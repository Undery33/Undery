import { memoJson, rejectMemoHead } from "@/lib/birthday-memo-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET() {
  // Retire old deletion URLs before parsing credentials or touching storage.
  return memoJson({ ok: false, error: "owner_deletion_disabled", message: "메시지는 등록만 가능합니다." }, 403);
}
export const HEAD = rejectMemoHead;
