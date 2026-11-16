import { getBirthdayMemoStore } from "@/lib/birthday-memo-store";
import { memoClientAddress, memoFailure, memoJson, rejectMemoHead, rejectPrefetch } from "@/lib/birthday-memo-http";
import { parseMemoUrl, validateMemoOwnerDeletion } from "@/lib/birthday-memo-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const url = parseMemoUrl(request.url, ["entryId", "token", "requestId", "confirm"]);
    rejectPrefetch(request);
    const input = validateMemoOwnerDeletion(
      url.searchParams.get("entryId") ?? "", url.searchParams.get("token") ?? "",
      url.searchParams.get("requestId") ?? "", url.searchParams.get("confirm") ?? "",
    );
    return memoJson(await getBirthdayMemoStore().trashOwnEntry(input, memoClientAddress(request)));
  } catch (error) { return memoFailure(error); }
}
export const HEAD = rejectMemoHead;
