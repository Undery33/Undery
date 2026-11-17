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
