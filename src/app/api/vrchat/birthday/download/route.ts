import { createReadStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Zip, ZipPassThrough } from "fflate";
import { birthdayPhotos, type BirthdayPhoto } from "@/lib/birthday-album";
import { mediaDirectory } from "@/lib/vrchat-media-store";
import { galleryFailure } from "@/lib/vrchat-media-http";

export const dynamic = "force-dynamic";

// PNG originals are already compressed. Pull one file chunk at a time, including on slow downloads.
async function* archive(photos: BirthdayPhoto[]) {
  let pending: Uint8Array[] = [];
  const zip = new Zip((error, data) => { if (error) throw error; pending.push(data); });
  const names = new Set<string>();
  try {
    for (const photo of photos) {
      const basename = Array.from(photo.alt).filter(char => char.charCodeAt(0) >= 32).join("").replace(/[\\/:*?"<>|]/gu, "_").replace(/^\.+/u, "") || photo.id + ".png";
      const name = names.has(basename) ? photo.id + "-" + basename : basename;
      names.add(name);
      const entry = new ZipPassThrough(name);
      zip.add(entry);
      for await (const chunk of createReadStream(join(mediaDirectory(), photo.id, "original"))) {
        entry.push(chunk as Buffer);
        yield* pending;
        pending = [];
      }
      entry.push(new Uint8Array(0), true);
      yield* pending;
      pending = [];
    }
    zip.end();
    yield* pending;
  } finally { zip.terminate(); }
}

export async function GET(request: Request) {
  try {
    const photos = await birthdayPhotos();
    const raw = new URL(request.url).searchParams.get("ids");
    const ids = raw === null ? null : new Set(raw.split(","));
    const selected = ids ? photos.filter(photo => ids.has(photo.id)) : photos;
    if (!selected.length || (ids && ids.size !== selected.length)) return new Response(null, { status: 404 });
    const stream = Readable.from(archive(selected), { objectMode: false, highWaterMark: 65536 });
    const body = Readable.toWeb(stream, { strategy: { highWaterMark: 65536, size: chunk => chunk.byteLength } }) as ReadableStream<Uint8Array>;
    return new Response(body, { headers: {
      "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="Undery-Birthday.zip"',
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return galleryFailure(error); }
}
