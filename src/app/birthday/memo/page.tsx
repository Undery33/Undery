import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { getBirthdayMemoStore, type MemoFeed } from "@/lib/birthday-memo-store";
import { parseMemoPage } from "@/lib/birthday-memo-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "생일 방명록", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function BirthdayMemoPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  let feed: MemoFeed | undefined;
  try {
    const params = await searchParams;
    feed = await getBirthdayMemoStore().feed(parseMemoPage(params.page ?? null));
  } catch { /* Render a clear unavailable state without exposing database details. */ }
  return <>
    <SiteHeader />
    <main id="main-content" className="shell main-content">
      <header className="page-heading">
        <p className="eyebrow">Happy birthday</p>
        <h1>생일 방명록</h1>
        <p>월드에서 남긴 축하 메시지를 모았어요.</p>
      </header>
      <p className="notice">글은 VRChat 월드의 펜 위 입력란에서 작성해 주세요. 닉네임과 메시지를 입력하고 생성한 등록 주소를 복사·붙여넣으면 이 방명록에 저장됩니다. 닉네임은 작성자가 입력한 이름입니다.</p>
      {!feed ? <div className="empty-state" role="status"><h2>방명록을 불러오지 못했어요</h2><p>잠시 후 다시 방문해 주세요. 저장 완료 안내가 없었다면 월드에서 등록을 다시 확인해 주세요.</p></div>
        : <>
          <div className="results-heading"><p>총 {feed.total.toLocaleString("ko-KR")}개의 메시지</p><p>{feed.totalPages > 0 ? `${feed.page + 1} / ${feed.totalPages} 페이지` : "첫 메시지를 기다리고 있어요"}</p></div>
          {feed.entries.length === 0 ? <div className="empty-state"><h2>아직 표시할 메시지가 없어요</h2><p>월드에서 생일 축하 메시지를 남겨 주세요.</p></div>
            : <div className="article-list">{feed.entries.map(entry => <article className="article-card" key={entry.id}>
              <h2 style={{ fontSize: "1.2rem" }}>{entry.nickname}</h2>
              <p style={{ whiteSpace: "pre-wrap", color: "var(--ink)" }}>{entry.message || "(메시지 없음)"}</p>
              <time className="meta" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time>
            </article>)}</div>}
          <nav aria-label="방명록 페이지" style={{ display: "flex", justifyContent: "space-between", gap: 24, marginTop: 24 }}>
            {feed.page > 0 ? <a href={`/birthday/memo?page=${feed.page - 1}`}>이전 페이지</a> : <span />}
            {feed.hasMore ? <a href={`/birthday/memo?page=${feed.page + 1}`}>다음 페이지</a> : <span />}
          </nav>
        </>}
    </main>
    <footer className="site-footer shell">Undery · 생일을 함께 기억하는 공간</footer>
  </>;
}
