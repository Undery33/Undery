import { requireAdminMutation, requireAdminSession } from "@/lib/admin-auth";
import { getBirthdayMemoManagement, MemoConflictError, parseManagementQuery, parseMemoMutation } from "@/lib/birthday-memo-management";
import { memoFailure, memoJson } from "@/lib/birthday-memo-http";
import { MemoError, parseMemoUrl } from "@/lib/birthday-memo-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readJson(request: Request) {
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

export async function GET(request: Request) {
  try {
    await requireAdminSession(request.headers);
    const url = parseMemoUrl(request.url, ["page", "q", "status"]);
    return memoJson(await getBirthdayMemoManagement().list(parseManagementQuery(url.searchParams)));
  } catch (error) { return memoFailure(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminMutation(request);
    parseMemoUrl(request.url, []);
    const input = parseMemoMutation(await readJson(request));
    return memoJson(await getBirthdayMemoManagement().mutate(input, session.githubUserId));
  } catch (error) {
    if (error instanceof MemoConflictError) return memoJson({ ok: false, error: error.code, message: error.message, current: error.current }, error.status);
    return memoFailure(error);
  }
}
