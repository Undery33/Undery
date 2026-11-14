import { getBirthdayMemoStore } from "@/lib/birthday-memo-store";
import { memoClientAddress, memoFailure, memoJson, rejectMemoHead, rejectPrefetch } from "@/lib/birthday-memo-http";
import { parseMemoUrl, validateMemo, validateToken } from "@/lib/birthday-memo-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const url = parseMemoUrl(request.url, ["token", "nickname", "message"]);
    rejectPrefetch(request);
    const token = validateToken(url.searchParams.get("token") ?? "");
    const payload = validateMemo(url.searchParams.get("nickname") ?? "", url.searchParams.get("message") ?? "");
    const result = await getBirthdayMemoStore().submit(token, payload.nickname, payload.message, memoClientAddress(request));
    return memoJson(result);
  } catch (error) { return memoFailure(error); }
}
export const HEAD = rejectMemoHead;
