import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { GET } from "@/app/api/vrchat/birthday/download/route";

const mocks = vi.hoisted(() => ({ photos: vi.fn(), directory: vi.fn() }));
vi.mock("@/lib/birthday-album", () => ({ birthdayPhotos: mocks.photos }));
vi.mock("@/lib/vrchat-media-store", () => ({ mediaDirectory: mocks.directory }));
const route = "https://undery.link/api/vrchat/birthday/download";
const photos = ["한글.png", "second.png"].map((alt, i) => ({ id: randomUUID(), alt, bytes: Uint8Array.of(i, 137, 80, 78, 71) }));
let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "birthday-download-"));
  for (const item of photos) {
    await mkdir(join(root, item.id));
    await writeFile(join(root, item.id, "original"), item.bytes);
  }
  mocks.directory.mockReturnValue(root);
  mocks.photos.mockResolvedValue(photos);
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

it("streams the original names and bytes for the whole album and a selection", async () => {
  for (const items of [photos, [photos[0]]]) {
    const suffix = items === photos ? "" : "?ids=" + items[0].id;
    const response = await GET(new Request(route + suffix));
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(files)).toEqual(items.map(item => item.alt));
    for (const item of items) expect(files[item.alt]).toEqual(item.bytes);
  }
});

it("rejects empty and out-of-album selections before streaming", async () => {
  for (const ids of ["", randomUUID(), photos[0].id + "," + randomUUID()]) {
    expect((await GET(new Request(route + "?ids=" + ids))).status).toBe(404);
  }
});
