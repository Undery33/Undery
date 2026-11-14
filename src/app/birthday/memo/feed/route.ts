import { getBirthdayMemoStore } from "@/lib/birthday-memo-store";
import { memoFailure, memoJson } from "@/lib/birthday-memo-http";
import { parseMemoOrder, parseMemoPage, parseMemoUrl } from "@/lib/birthday-memo-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const url = parseMemoUrl(request.url, ["page", "order"]);
    const page = parseMemoPage(url.searchParams.get("page"));
    const order = parseMemoOrder(url.searchParams.get("order"));
    return memoJson(await getBirthdayMemoStore().feed(page, order));
  } catch (error) { return memoFailure(error); }
}
