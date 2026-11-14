import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portfolio",
  robots: { index: false, follow: false, noarchive: true },
};

export default function PortfolioPage() {
  return <main id="main-content" className="portfolio shell">
    <header className="portfolio-header"><span className="wordmark">Undery<span aria-hidden="true">.</span></span><span className="badge">Portfolio</span></header>
    <section className="page-heading"><p className="eyebrow">Introduction</p><h1>만들어 온 것들을<br />소개하는 공간.</h1><p>소개, 프로젝트, 경력을 정리할 독립 포트폴리오 페이지입니다.</p></section>
    <section className="empty-state" aria-labelledby="portfolio-status"><h2 id="portfolio-status">포트폴리오 준비 중</h2><p>실제 소개와 프로젝트 내용, 디자인은 추후 추가합니다.</p></section>
    <p className="foundation-note">이 페이지는 로그인 없이 직접 주소로 열 수 있습니다. 검색 제외 설정은 접근 제한이 아니므로 비공개 정보는 게시하지 않습니다.</p>
  </main>;
}
