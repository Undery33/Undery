import { authFailure, finishAdminLogin } from "@/lib/admin-auth";
import { memoHeaders } from "@/lib/birthday-memo-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return await finishAdminLogin(request); } catch (error) { return authFailure(error); }
}
export function HEAD() { return new Response(null, { status: 405, headers: { ...memoHeaders, Allow: "GET" } }); }
