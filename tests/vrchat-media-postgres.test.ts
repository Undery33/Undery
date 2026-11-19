import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GalleryStore } from "@/lib/vrchat-media-store";

const connectionString = process.env.VRCHAT_TEST_DATABASE_URL;
const schema = "vrchat_gallery_test_" + randomBytes(6).toString("hex");
let database: Pool;
let directory: string;
let store: GalleryStore;
let migrated = false;

describe.skipIf(!connectionString)("gallery PostgreSQL and persistent files", () => {
  beforeAll(async () => {
    database = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000 });
    directory = await mkdtemp(join(tmpdir(), "vrchat-gallery-db-"));
    store = new GalleryStore(database, directory, schema);
    const migration = await readFile(new URL("../src/lib/vrchat-gallery-migration.sql", import.meta.url), "utf8");
    await database.query(migration.replaceAll("vrchat_gallery", schema));
    migrated = true;
    await database.query(migration.replaceAll("vrchat_gallery", schema));
  });
  afterAll(async () => {
    try {
      if (migrated && /^vrchat_gallery_test_[a-f0-9]{12}$/u.test(schema)) await database.query("DROP SCHEMA " + schema + " CASCADE");
    } finally {
      await database?.end();
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  });

  it("seeds the existing files with their original order and metadata exactly once", async () => {
    const fixture = JSON.parse(await readFile(new URL("../dist/media.json", import.meta.url), "utf8")) as { date?: string }[];
    const items = await store.list();
    expect(items).toEqual(fixture.map(item => ({
      ...item, date: item.date ?? null, uploadedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/u),
    })));
    expect(items[0].uploadedAt).toBe(items[1].uploadedAt);
  });

  it("publishes complete bytes once across concurrent requests and removes conflicting or malformed retry staging files", async () => {
    const requestId = randomUUID();
    const source = new Uint8Array(await sharp({ create: { width: 24, height: 16, channels: 3, background: "gold" } }).png().toBuffer());
    const request = (tags = "[]", file = source) => {
      const form = new FormData();
      form.set("requestId", requestId);
      form.set("tags", tags);
      form.set("file", new Blob([file]), "untrusted.ext");
      return new Request("http://localhost/api/vrchat/media", { method: "POST", body: form });
    };
    const published = await Promise.all([store.upload(request()), store.upload(request())]);
    expect(published.map(result => result.created).sort()).toEqual([false, true]);
    expect(published[0].item).toEqual(published[1].item);
    const item = published[0].item;
    expect(item).toMatchObject({ width: 24, height: 16, alt: "VRChat 사진", date: null, tags: [],
      src: "/api/vrchat/media/files/" + item.id + "/original", thumbnail: "/api/vrchat/media/files/" + item.id + "/thumbnail" });
    expect((await store.file(item.id))?.mime).toBe("image/png");
    expect(await readFile(join(directory, item.id, "original"))).toEqual(Buffer.from(source));
    expect(await sharp(join(directory, item.id, "thumbnail.webp")).metadata()).toMatchObject({ format: "webp", width: 24, height: 16 });
    await expect(store.upload(request('["친구"]'))).rejects.toMatchObject({ status: 409 });
    await expect(store.upload(request("[]", new Uint8Array([1,2,3])))).rejects.toMatchObject({ status: 415 });
    expect(await readdir(directory)).toEqual([item.id]);
    expect((await new GalleryStore(database, directory, schema).list()).map(row => row.id).sort()).toEqual(["sunset","portrait",item.id].sort());
  });

  it("orders photos by upload instant and videos by capture date", async () => {
    const table = schema + ".media";
    await database.query(`INSERT INTO ${table}
      (id, type, taken_on, created_at, alt, width, height, mime, static_src, static_thumbnail)
      SELECT id, type, capture::date, upload::timestamptz, id, 24, 16, mime, '/sample', '/thumb'
      FROM (VALUES
        ('order-photo-a', 'photo', '2025-12-31', '2026-01-01T12:00:00.000001Z', 'image/png'),
        ('order-photo-b', 'photo', NULL,         '2026-01-01T12:00:00.000002Z', 'image/png'),
        ('order-video-a', 'video', '2025-12-31', '2026-01-01T11:00:00Z', 'video/mp4'),
        ('order-video-b', 'video', '2025-01-01', '2026-01-01T13:00:00Z', 'video/mp4')
      ) AS samples(id, type, capture, upload, mime)`);
    try {
      const items = (await store.list()).filter(item => item.id.startsWith("order-"));
      const photos = items.filter(item => item.type === "photo");
      expect(photos.map(item => item.id)).toEqual(["order-photo-b", "order-photo-a"]);
      expect(photos[0]).toMatchObject({ date: null, uploadedAt: "2026-01-01T12:00:00.000002Z" });
      expect(items.filter(item => item.type === "video").map(item => item.id)).toEqual(["order-video-a", "order-video-b"]);
    } finally {
      await database.query(`DELETE FROM ${table} WHERE id LIKE 'order-%'`);
    }
  });
});
