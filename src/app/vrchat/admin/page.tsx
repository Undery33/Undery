import type { Metadata } from "next";
import { headers } from "next/headers";
import { AdminLoginButton, AdminLogoutButton } from "@/app/admin/messages/auth-buttons";
import { authConfigEnabled, getAdminSession } from "@/lib/admin-auth";
import { MediaUploader } from "./media-uploader";
import styles from "./upload.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: "VRChat 사진·영상 업로드",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function VrchatUploadPage({ searchParams }: { searchParams: Promise<{ error?: string; album?: string }> }) {
  const { error, album } = await searchParams;
  let session: Awaited<ReturnType<typeof getAdminSession>> = null;
  let unavailable = false;
  try {
    session = await getAdminSession(new Headers(await headers()));
  } catch {
    unavailable = true;
  }

  return (
    <main id="main-content" className={styles.page}>
      <div className={styles.content}>
        <div className={styles.nav}>
          <a href="/vrchat">← VRChat 갤러리</a>
          {session && <AdminLogoutButton section="vrchat" csrfToken={session.csrfToken} className={styles.logout} />}
        </div>
        <h1>사진·영상 업로드</h1>
        {session ? <MediaUploader csrfToken={session.csrfToken} album={album === "birthday" || album === "birthday-art" ? album : undefined} /> : (
          <section className={styles.login} aria-label="관리자 로그인">
            {unavailable ? <p role="alert">로그인 상태를 확인하지 못했습니다. 잠시 후 새로고침해 주세요.</p>
              : authConfigEnabled() ? <>
                <p>VRChat 갤러리에 파일을 올리려면 관리자 GitHub 계정으로 로그인하세요.</p>
                {error && <p role="alert">로그인을 완료하지 못했습니다. 관리자 계정으로 다시 시도해 주세요.</p>}
                <AdminLoginButton section="vrchat" />
              </> : <p>관리자 로그인 연결을 준비 중입니다.</p>}
          </section>
        )}
      </div>
    </main>
  );
}
