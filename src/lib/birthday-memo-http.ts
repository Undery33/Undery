import { isIP } from "node:net";
import { MemoError } from "./birthday-memo-validation";

export const memoHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function memoClientAddress(request: Request) {
  // Enable only when the private upstream proxy overwrites this header itself.
  // Raw X-Forwarded-For is intentionally never trusted.
  const address = process.env.BIRTHDAY_MEMO_TRUST_PROXY === "true" ? request.headers.get("x-undery-client-ip")?.trim() : undefined;
  return address && isIP(address) ? address : "shared";
}

export function memoJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: memoHeaders });
}

export function memoFailure(error: unknown) {
  if (error instanceof MemoError) {
    const response = memoJson({ ok: false, error: error.code, message: error.message }, error.status);
    if (error.status === 429) response.headers.set("Retry-After", "60");
    return response;
  }
  // SQL errors can carry database addresses and query values. Do not log the object.
  console.error("Birthday memo request failed; check database availability and migration.");
  return memoJson({ ok: false, error: "storage_unavailable", message: "저장소에 연결할 수 없습니다. 입력 내용을 유지한 채 잠시 후 다시 시도해 주세요." }, 503);
}

export function rejectMemoHead() {
  return new Response(null, { status: 405, headers: { ...memoHeaders, Allow: "GET" } });
}

export function rejectPrefetch(request: Request) {
  if (/prefetch|prerender/iu.test(`${request.headers.get("purpose") || ""} ${request.headers.get("sec-purpose") || ""}`)) {
    throw new MemoError("prefetch_rejected", 400, "미리 불러오기로 등록할 수 없습니다.");
  }
}

export async function readMemoJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new MemoError("invalid_content_type", 415, "JSON 형식으로 요청해 주세요.");
  if (Number(request.headers.get("content-length")) > 16384) throw new MemoError("request_too_large", 413, "입력 내용이 너무 깁니다.");
  const reader = request.body?.getReader();
  if (!reader) throw new MemoError("invalid_request", 400, "입력 내용을 확인해 주세요.");
  let size = 0;
  let expired = false;
  const chunks: Uint8Array[] = [];
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => undefined); }, 10000);
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16384) { void reader.cancel().catch(() => undefined); throw new MemoError("request_too_large", 413, "입력 내용이 너무 깁니다."); }
      chunks.push(chunk.value);
    }
    if (expired) throw new MemoError("request_timeout", 408, "요청 시간이 초과되었습니다. 입력한 내용을 유지한 채 다시 시도해 주세요.");
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw new MemoError("invalid_request", 400, "입력 내용을 확인해 주세요."); }
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
