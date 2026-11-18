import { authFailure, logoutAdmin, rejectAuthMethod } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return await logoutAdmin(request); } catch (error) { return authFailure(error); }
}
export const GET = rejectAuthMethod;
export const HEAD = rejectAuthMethod;
