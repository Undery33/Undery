import { getBirthdayMemoStore } from "@/lib/birthday-memo-store";
import { memoFailure, memoJson } from "@/lib/birthday-memo-http";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return memoJson(await getBirthdayMemoStore().visibleMessages()); }
  catch (error) { return memoFailure(error); }
}
