import type { Metadata } from "next";
import GuestbookHero from "./guestbook-hero";
import { getBirthdayMemoStore, type MemoFeed } from "@/lib/birthday-memo-store";
import { parseMemoPage } from "@/lib/birthday-memo-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "생일 메시지", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function BirthdayMemoPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  let feed: MemoFeed | undefined;
  try {
    const params = await searchParams;
    feed = await getBirthdayMemoStore().feed(parseMemoPage(params.page ?? null));
  } catch { /* Render a clear unavailable state without exposing database details. */ }
  return <>
    <main id="main-content">
      <GuestbookHero />
      <section id="messages" className="shell main-content" aria-labelledby="message-heading">
      <header className="page-heading">
        <h2 id="message-heading">생일 메시지</h2>
      </header>
      {!feed ? <div className="empty-state" role="status"><h2>메시지를 불러오지 못했어요</h2><p>잠시 후 다시 방문해 주세요. 저장 완료 안내가 없었다면 월드에서 등록을 다시 확인해 주세요.</p></div>
        : <>
          <div className="results-heading"><p>총 {feed.total.toLocaleString("ko-KR")}개의 메시지</p><p>{feed.totalPages > 0 ? `${feed.page + 1} / ${feed.totalPages} 페이지` : "첫 메시지를 기다리고 있어요"}</p></div>
          {feed.entries.length === 0 ? <div className="empty-state"><h2>아직 표시할 메시지가 없어요</h2><p>월드에서 생일 축하 메시지를 남겨 주세요.</p></div>
            : <div className="article-list">{feed.entries.map(entry => <article className="article-card" key={entry.id}>
              <h2 style={{ fontSize: "1.2rem" }}>{entry.nickname}</h2>
              <p style={{ whiteSpace: "pre-wrap", color: "var(--ink)" }}>{entry.message || "(메시지 없음)"}</p>
              <time className="meta" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time>
            </article>)}</div>}
          <nav aria-label="메시지 페이지" style={{ display: "flex", justifyContent: "space-between", gap: 24, marginTop: 24 }}>
            {feed.page > 0 ? <a href={`/birthday/memo?page=${feed.page - 1}#messages`}>이전 페이지</a> : <span />}
            {feed.hasMore ? <a href={`/birthday/memo?page=${feed.page + 1}#messages`}>다음 페이지</a> : <span />}
          </nav>
        </>}
      </section>
    </main>
    <footer className="site-footer shell">Undery · 생일을 함께 기억하는 공간 · <a href="/birthday/memo/admin">메시지 관리</a></footer>
  </>;
}
