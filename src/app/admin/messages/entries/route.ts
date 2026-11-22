import { requireAdminMutation, requireAdminSession } from "@/lib/admin-auth";
import { getBirthdayMemoManagement, MemoConflictError, parseManagementQuery, parseMemoMutation } from "@/lib/birthday-memo-management";
import { memoFailure, memoJson, readMemoJson } from "@/lib/birthday-memo-http";
import { parseMemoUrl } from "@/lib/birthday-memo-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const input = parseMemoMutation(await readMemoJson(request));
    return memoJson(await getBirthdayMemoManagement().mutate(input, session.githubUserId));
  } catch (error) {
    if (error instanceof MemoConflictError) return memoJson({ ok: false, error: error.code, message: error.message, current: error.current }, error.status);
    return memoFailure(error);
  }
}
