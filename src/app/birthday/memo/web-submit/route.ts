import { memoClientAddress, memoFailure, memoJson, readMemoJson } from "@/lib/birthday-memo-http";
import { getBirthdayMemoStore } from "@/lib/birthday-memo-store";
import { MemoError, parseMemoUrl, parseWebMemo } from "@/lib/birthday-memo-validation";
import { siteOrigin } from "@/lib/site";

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== siteOrigin().origin) {
      throw new MemoError("invalid_origin", 403, "생일 메시지 페이지에서 다시 시도해 주세요.");
    }
    parseMemoUrl(request.url, []);
    const input = parseWebMemo(await readMemoJson(request));
    const result = await getBirthdayMemoStore().submitWeb(input, memoClientAddress(request));
    return memoJson(result);
  } catch (error) {
    return memoFailure(error);
  }
}
