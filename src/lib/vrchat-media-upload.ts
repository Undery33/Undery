import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import busboy from "busboy";
import { MemoError } from "./birthday-memo-validation";
import { calendarDate, VIDEO_MAX_BYTES } from "./vrchat-media-inspect";

export const uuidPattern = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/iu;
const tooLarge = () => new MemoError("upload_too_large", 413, "영상은 256 MiB까지 등록할 수 있습니다.");
const invalidFields = () => new MemoError("invalid_fields", 400, "파일과 입력 항목을 확인해 주세요.");
const maxBody = VIDEO_MAX_BYTES + 1024 * 1024;
const allowedFields = new Set(["date", "alt", "requestId", "tags", "type"]);

export function validateFields(fields: Map<string, string>) {
  const alt = fields.get("alt")?.trim() || null;
  const date = fields.get("date")?.trim() || null;
  const requestId = fields.get("requestId") || null;
  const type = fields.get("type") || null;
  let tags: unknown;
  try { tags = JSON.parse(fields.get("tags") || "[]"); } catch { throw invalidFields(); }
  if (alt && ([...alt].length > 200 || /\p{Cc}/u.test(alt))) throw invalidFields();
  if (date && !calendarDate(date)) throw invalidFields();
  if (requestId && !uuidPattern.test(requestId)) throw invalidFields();
  if (type && type !== "photo" && type !== "video") throw invalidFields();
  if (!Array.isArray(tags) || tags.length > 12 || !tags.every(tag => typeof tag === "string"
    && [...tag.trim()].length >= 1 && [...tag.trim()].length <= 24 && !/\p{Cc}/u.test(tag))) throw invalidFields();
  return { alt, date, type, requestId, tags: [...new Set((tags as string[]).map(tag => tag.trim()))] };
}

export function checkUploadHeaders(request: Request) {
  if (!/^multipart\/form-data\s*;/iu.test(request.headers.get("content-type") || "")) {
    throw new MemoError("invalid_content_type", 415, "파일을 폼 데이터로 보내 주세요.");
  }
  if (Number(request.headers.get("content-length")) > maxBody) throw tooLarge();
}

export async function receiveMedia(request: Request, directory: string) {
  checkUploadHeaders(request);
  if (!request.body) throw invalidFields();
  const fields = new Map<string, string>();
  const hash = createHash("sha256");
  let bytes = 0;
  let total = 0;
  let parser: ReturnType<typeof busboy>;
  try {
    parser = busboy({ headers: { "content-type": request.headers.get("content-type")! }, defCharset: "utf8",
      limits: { fileSize: VIDEO_MAX_BYTES + 1, files: 1, fields: 5, fieldSize: 2048 } });
  } catch { throw invalidFields(); }
  const controller = new AbortController();
  let failure: unknown;
  const fail = (error: unknown) => { failure ??= error; queueMicrotask(() => controller.abort()); };
  const invalidPart = () => { failure ??= invalidFields(); };
  let fileWrite: Promise<void> | undefined;
  parser.on("file", (key, file) => {
    // Attach an error listener before consuming or aborting a multipart file stream.
    file.on("error", () => {});
    if (key !== "file" || fileWrite) { file.resume(); invalidPart(); return; }
    file.on("limit", () => fail(tooLarge()));
    const digest = new Transform({ transform(chunk: Buffer, _, callback) {
      bytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    } });
    fileWrite = pipeline(file, digest, createWriteStream(join(directory, "original"), { flags: "wx", mode: 0o600 }),
      { signal: controller.signal }).catch(error => fail(error));
  });
  parser.on("field", (key, value, info) => {
    if (!allowedFields.has(key) || fields.has(key) || info.valueTruncated || info.nameTruncated) { invalidPart(); return; }
    fields.set(key, value);
  });
  parser.on("filesLimit", invalidPart);
  parser.on("fieldsLimit", invalidPart);
  const count = new Transform({ transform(chunk: Buffer, _, callback) {
    total += chunk.length;
    if (total > maxBody) { const error = tooLarge(); failure ??= error; callback(error); }
    else callback(null, chunk);
  } });
  const timedOut = () => fail(new MemoError("upload_timeout", 408, "파일 전송이 중단되었거나 4분 50초를 초과했습니다. 다시 시도해 주세요."));
  // Allow the app to return a retryable response before Node's five-minute HTTP deadline.
  const timeout = setTimeout(timedOut, 290_000);
  request.signal.addEventListener("abort", timedOut, { once: true });
  if (request.signal.aborted) timedOut();
  try {
    await pipeline(Readable.fromWeb(request.body as NodeReadableStream<Uint8Array>), count, parser, { signal: controller.signal })
      .catch(error => { if (!failure) fail(error); });
    await fileWrite;
    if (failure instanceof MemoError) throw failure;
    if (failure && ["ENOSPC", "EACCES", "EROFS", "EIO", "EMFILE"].includes((failure as NodeJS.ErrnoException).code || "")) throw failure;
    if (failure || !fileWrite || !bytes) throw invalidFields();
    return { ...validateFields(fields), bytes, sha256: hash.digest("hex") };
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", timedOut);
  }
}
