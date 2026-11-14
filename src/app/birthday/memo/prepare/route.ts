import { getBirthdayMemoStore } from "@/lib/birthday-memo-store";
import { memoClientAddress, memoFailure, memoJson, rejectMemoHead, rejectPrefetch } from "@/lib/birthday-memo-http";
import { parseMemoUrl } from "@/lib/birthday-memo-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    parseMemoUrl(request.url, []);
    rejectPrefetch(request);
    return memoJson(await getBirthdayMemoStore().prepare(memoClientAddress(request)));
  } catch (error) { return memoFailure(error); }
}
// Next otherwise implements HEAD by calling GET; token generation must be explicit.
export const HEAD = rejectMemoHead;
