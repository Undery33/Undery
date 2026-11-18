import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteHeader } from "@/components/site-header";
import { authConfigEnabled, getAdminSession } from "@/lib/admin-auth";
import { getBirthdayMemoManagement, type ManagedMemoPage } from "@/lib/birthday-memo-management";
import { MemoManager } from "./memo-manager";
import { AdminLoginButton } from "./auth-buttons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "메시지 관리", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function MessageManagementPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const parameters = await searchParams;
  let session: Awaited<ReturnType<typeof getAdminSession>> = null;
  let initial: ManagedMemoPage | undefined;
  let unavailable = false;
  try {
    session = await getAdminSession(new Headers(await headers()));
    if (session) initial = await getBirthdayMemoManagement().list({ page: 0, q: "", status: "all" });
  } catch { unavailable = true; }
  return <>
    <SiteHeader />
    <main id="main-content" className="shell main-content">
      <header className="page-heading"><p className="eyebrow">Birthday messages</p><h1>메시지 관리</h1><p>월드의 큰 벽에 표시할 메시지를 작성하고 관리합니다.</p></header>
      {session && initial ? <MemoManager initial={initial} csrfToken={session.csrfToken} />
        : <section className="empty-state">
          <h2>{unavailable ? "관리 화면을 불러오지 못했어요" : "관리자 로그인이 필요해요"}</h2>
          <p>{unavailable ? "잠시 후 새로고침해 주세요. 저장된 메시지는 그대로 유지됩니다." : "기존에 등록된 관리자 GitHub 계정으로 로그인해 주세요."}</p>
          {parameters.error && <p role="alert">로그인을 완료하지 못했습니다. 관리자 계정과 로그인 유효 시간을 확인한 뒤 다시 시도해 주세요.</p>}
          {authConfigEnabled() && !unavailable ? <div style={{ marginTop: 24 }}><AdminLoginButton /></div>
            : !unavailable && <p style={{ marginTop: 20 }}>관리자 로그인 연결을 준비 중입니다.</p>}
        </section>}
    </main>
  </>;
}
