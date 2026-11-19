import { open } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { MemoError } from "./birthday-memo-validation";
import { getGalleryStore, mediaDirectory } from "./vrchat-media-store";
import { uuidPattern } from "./vrchat-media-upload";

const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export function galleryJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: noStore });
}

export function galleryFailure(error: unknown) {
  if (error instanceof MemoError && error.code !== "storage_unavailable") {
    const response = galleryJson({ ok: false, error: error.code, message: error.message }, error.status);
    if (error.status === 429) response.headers.set("Retry-After", "5");
    return response;
  }
  return galleryJson({ ok: false, error: "storage_unavailable", message: "갤러리 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." }, 503);
}

// A single inclusive byte range, including open-ended and suffix requests.
export function byteRange(header: string, size: number): [number, number] | null {
  const match = /^bytes=(\d*)-(\d*)$/iu.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  if (!match[1]) {
    const length = Number(match[2]);
    return Number.isSafeInteger(length) && length > 0 ? [Math.max(size - length, 0), size - 1] : null;
  }
  const first = Number(match[1]);
  const last = match[2] ? Number(match[2]) : size - 1;
  return Number.isSafeInteger(first) && Number.isSafeInteger(last) && first < size && last >= first
    ? [first, Math.min(size - 1, last)] : null;
}

export async function galleryFile(request: Request, id: string, variant: string) {
  const missing = () => galleryJson({ ok: false, error: "not_found", message: "파일을 찾을 수 없습니다." }, 404);
  if (!uuidPattern.test(id) || (variant !== "original" && variant !== "thumbnail")) return missing();
  try {
    const item = await getGalleryStore().file(id);
    if (!item) return missing();
    const file = await open(join(mediaDirectory(), id, variant === "original" ? "original" : "thumbnail.webp"), "r");
    let streamOwnsFile = false;
    try {
      const size = (await file.stat()).size;
      const headers = new Headers({ "Content-Type": variant === "original" ? item.mime : "image/webp",
        "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
      const rangeHeader = request.headers.get("range");
      const range = rangeHeader ? byteRange(rangeHeader, size) : null;
      if (rangeHeader && !range) {
        headers.set("Content-Range", "bytes */" + size);
        headers.set("Cache-Control", "no-store");
        return new Response(null, { status: 416, headers });
      }
      const [start, end] = range ?? [0, size - 1];
      headers.set("Content-Length", String(end - start + 1));
      if (range) headers.set("Content-Range", "bytes " + start + "-" + end + "/" + size);
      const response = { status: range ? 206 : 200, headers };
      if (request.method === "HEAD" || size === 0) return new Response(null, response);
      const input = file.createReadStream({ start, end, autoClose: true });
      const body = Readable.toWeb(input, { strategy: { highWaterMark: 64 * 1024, size: chunk => chunk.byteLength } }) as ReadableStream<Uint8Array>;
      streamOwnsFile = true;
      return new Response(body, response);
    } finally { if (!streamOwnsFile) await file.close(); }
  } catch (error) { return galleryFailure(error); }
}
