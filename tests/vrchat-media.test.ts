import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { byteRange } from "@/lib/vrchat-media-http";
import { inspectMedia, PHOTO_MAX_BYTES } from "@/lib/vrchat-media-inspect";
import { receiveMedia, validateFields } from "@/lib/vrchat-media-upload";

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "vrchat-upload-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

function upload(form: FormData) {
  return new Request("https://undery.link/api/vrchat/media", { method: "POST", body: form });
}

describe("gallery media processing", () => {
  it("streams the original intact, gets orientation and true capture date, and makes a clean WebP preview", async () => {
    const jpeg = await sharp({ create: { width: 800, height: 400, channels: 3, background: "navy" } })
      .jpeg().withMetadata({ orientation: 6 }).withExifMerge({ IFD2: { DateTimeOriginal: "2024:02:29 23:04:05" } }).toBuffer();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(jpeg)], { type: "application/octet-stream" }), "../../fake.png");
    form.append("tags", JSON.stringify(["배경", "캐릭터"]));
    const parsed = await receiveMedia(upload(form), directory);
    expect(parsed).toMatchObject({ bytes: jpeg.length, date: null, alt: null, tags: ["배경", "캐릭터"] });
    expect(await readFile(join(directory, "original"))).toEqual(jpeg);
    expect(await inspectMedia(directory, parsed.bytes)).toEqual({ type: "photo", mime: "image/jpeg", width: 400, height: 800, date: "2024-02-29" });
    const poster = await sharp(join(directory, "thumbnail.webp")).metadata();
    expect(poster).toMatchObject({ format: "webp", width: 360, height: 720 });
    expect(poster.exif).toBeUndefined();
  });

  it("leaves unknown dates empty and rejects corrupt, disguised and oversize photos", async () => {
    const path = join(directory, "original");
    await sharp({ create: { width: 11, height: 7, channels: 3, background: "orange" } }).png().toFile(path);
    await expect(inspectMedia(directory, 100)).resolves.toMatchObject({ width: 11, height: 7, date: null });
    await expect(inspectMedia(directory, PHOTO_MAX_BYTES + 1)).rejects.toMatchObject({ status: 413 });
    await writeFile(path, Buffer.from([255,216,255,0,1]));
    await expect(inspectMedia(directory, 5)).rejects.toMatchObject({ status: 422 });
    await writeFile(path, "<html>not a photo</html>");
    await expect(inspectMedia(directory, 24)).rejects.toMatchObject({ status: 415 });
  });

  it("refuses malformed or incomplete multipart bodies without treating a partial file as a successful upload", async () => {
    const request = new Request("https://undery.link", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=cut" },
      body: '--cut\r\nContent-Disposition: form-data; name="file"; filename="x"\r\nContent-Type: image/png\r\n\r\nsome bytes' });
    await expect(receiveMedia(request, directory)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects multiple files and above-limit HTTP bodies, even with an otherwise valid form", async () => {
    const form = new FormData();
    form.append("file", new Blob(["123"]), "x");
    form.append("file", new Blob(["456"]), "y");
    await expect(receiveMedia(upload(form), directory)).rejects.toMatchObject({ status: 400 });
    const oversized = upload(form);
    oversized.headers.set("Content-Length", String(258 * 1024 * 1024));
    await expect(receiveMedia(oversized, directory)).rejects.toMatchObject({ status: 413 });
  });

  it("validates the calendar date and metadata without guessing", () => {
    expect(() => validateFields(new Map([["date", "2025-02-29"]]))).toThrow();
    expect(() => validateFields(new Map([["tags", "{}"]]))).toThrow();
    expect(() => validateFields(new Map([["requestId", "../file"]]))).toThrow();
    expect(validateFields(new Map([["tags", '["복숭아","복숭아"]'], ["date", "2024-02-29"]]))).toMatchObject({ tags: ["복숭아"], date: "2024-02-29" });
  });

  it("handles exact, suffix, open-ended, unsatisfiable and multi-range video requests", () => {
    expect(byteRange("bytes=2-4", 10)).toEqual([2, 4]);
    expect(byteRange("bytes=4-", 10)).toEqual([4, 9]);
    expect(byteRange("bytes=-3", 10)).toEqual([7, 9]);
    expect(byteRange("bytes=3-999999", 10)).toEqual([3, 9]);
    for (const invalid of ["bytes=10-", "bytes=-0", "bytes=4-3", "bytes=0-1,3-4", "bytes=-", "bytes=1-x"]) {
      expect(byteRange(invalid, 10)).toBeNull();
    }
  });

  it.skipIf(process.env.VRCHAT_TEST_VIDEO !== "true").each([
    ["mp4", "libx264"], ["webm", "libvpx-vp9"],
  ])("probes a real %s video and decodes its first frame as a WebP poster", async (format, codec) => {
    const path = join(directory, "original");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=blue:size=96x54:rate=3",
      "-t", "1", "-threads", "1", "-c:v", codec, "-metadata", "creation_time=2024-02-29T05:15:00Z", "-f", format, path]);
    const info = await inspectMedia(directory, (await stat(path)).size);
    expect(info).toMatchObject({ type: "video", mime: "video/" + format, width: 96, height: 54, date: "2024-02-29" });
    expect(await sharp(join(directory, "thumbnail.webp")).metadata()).toMatchObject({ format: "webp", width: 96, height: 54 });
  });
});
