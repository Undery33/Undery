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
    expect(await store.list()).toEqual(fixture.map(item => ({ ...item, date: item.date ?? null })));
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
});
