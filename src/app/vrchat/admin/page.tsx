import type { Metadata } from "next";
import { headers } from "next/headers";
import { AdminLoginButton, AdminLogoutButton } from "@/app/admin/messages/auth-buttons";
import { authConfigEnabled, getAdminSession } from "@/lib/admin-auth";
import { MediaUploader } from "./media-uploader";
import { getGalleryStore } from "@/lib/vrchat-media-store";
import { PhotoList } from "./photo-list";
import styles from "./upload.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: "VRChat 갤러리 관리",
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

  const selectedAlbum = album === "birthday" || album === "birthday-art" ? album : undefined;
  const photos = session && !selectedAlbum ? await getGalleryPhotos() : null;
  return (
    <main id="main-content" className={styles.page}>
      <div className={styles.content}>
        <div className={styles.nav}>
          <a href="/vrchat">← VRChat 갤러리</a>
          {session && <AdminLogoutButton section="vrchat" csrfToken={session.csrfToken} className={styles.logout} />}
        </div>
        <h1>{selectedAlbum ? "사진·영상 업로드" : "VRChat 갤러리 관리"}</h1>
        {session ? <>
          <MediaUploader csrfToken={session.csrfToken} album={selectedAlbum} />
          {!selectedAlbum && (photos ? <PhotoList photos={photos} csrfToken={session.csrfToken} /> :
            <p role="alert">사진 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.</p>)}
        </> : (
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

async function getGalleryPhotos() {
  try {
    const items = await getGalleryStore().list();
    return items.filter(item => item.type === "photo").map(({ id, alt, thumbnail, src }) => ({ id, alt, thumbnail, src }));
  } catch { return null; }
}
