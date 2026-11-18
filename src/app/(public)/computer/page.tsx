import type { Metadata } from "next";
import Link from "next/link";
import { ComputerTopologyScene } from "@/components/computer/computer-topology-scene";
import { ComputerDeviceIcon } from "@/components/computer/computer-topology";
import styles from "@/components/computer/computer.module.css";
import { articleListHref, filterArticles, getArticles, getTags, normalizeSearch } from "@/lib/articles";
import { computerCategories, getComputerCategory, type ComputerCategory } from "@/lib/computer-categories";

export const metadata: Metadata = {
  title: "Computer",
  description: "3D 구성도에서 장비를 선택하고 네트워크와 서버 기술 글을 찾아보세요.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function ComputerPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = first(params.q).trim().slice(0, 120);
  const tag = first(params.tag).trim().slice(0, 80);
  const requested = first(params.category);
  const selected = getComputerCategory(requested);
  const legacy = requested === "network" || requested === "ai";
  const category = selected?.id ?? (legacy ? requested : "");
  const articles = await getArticles();
  const filtered = filterArticles(articles, query, tag, category);
  const tags = getTags(articles);
  const hasFilters = Boolean(query || tag || category);
  const deviceLinks = Object.fromEntries(computerCategories.map(({ id }) =>
    [id, articleListHref(query, tag, id) + "#articles"])) as Record<ComputerCategory, string>;

  return (
    <div className={styles.page}>
      <nav className={styles.siteNav} aria-label="홈으로 이동">
        <Link href="/" aria-label="Undery 홈"><span aria-hidden="true">←</span> Undery</Link>
      </nav>
      <ComputerTopologyScene hrefs={deviceLinks} selected={category} />

      <header className={styles.heading}>
        <h1 id="computer-title">Computer</h1>
        <form className={styles.search} action="/computer#articles" method="get" role="search" aria-label="기술 글 검색">
          <input key={query} name="q" type="search" aria-label="기술 글 검색어" defaultValue={query} maxLength={120} placeholder="기술 글 검색" />
          {tag && <input type="hidden" name="tag" value={tag} />}
          {category && <input type="hidden" name="category" value={category} />}
          <button type="submit" aria-label="검색">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="10" cy="10" r="6.5" /><path d="m15 15 5.5 5.5" />
            </svg>
          </button>
        </form>
      </header>

      <nav className={styles.categories} aria-label="기술 분류">
        {computerCategories.map(({ id, label }) => (
          <Link key={id} href={articleListHref(query, tag, id)} scroll={false} aria-current={id === category ? "true" : undefined}>
            <span className={styles.thumbnail}><ComputerDeviceIcon device={id} /></span>
            <span className={styles.cardTitle}>{label}</span>
          </Link>
        ))}
      </nav>

      <section className={styles.archive} id="articles" aria-labelledby="archive-title">
        <div className={styles.archiveHeading}>
          <h2 id="archive-title">{selected?.label ?? (category === "network" ? "네트워크" : "기술 글")}</h2>
          <span>{filtered.length}개의 글</span>
          {hasFilters && <Link href="/computer#articles">검색·필터 초기화</Link>}
        </div>
        {tags.length > 0 && (
          <details key={tag} className={styles.tagPicker} open={tag ? true : undefined}>
            <summary>{tag ? "태그 · #" + tag : "태그"}</summary>
            <nav aria-label="태그로 필터링">
              <Link href={articleListHref(query, "", category)} scroll={false} aria-current={!tag ? "true" : undefined}>전체</Link>
              {tags.map((item) => (
                <Link key={item} href={articleListHref(query, item, category)} scroll={false}
                  aria-current={normalizeSearch(tag) === normalizeSearch(item) ? "true" : undefined}>#{item}</Link>
              ))}
            </nav>
          </details>
        )}
        {filtered.length ? (
          <ul className={styles.results}>
            {filtered.map((article) => (
              <li key={article.slug}>
                <Link href={"/computer/" + article.slug}>
                  <div>
                    <span className={styles.articleCategory}>{getComputerCategory(article.category)?.label ?? "Computer"}</span>
                    <h3>{article.title}</h3>
                    <p>{article.description}</p>
                  </div>
                  <time dateTime={article.publishedAt}>{article.publishedAt.replaceAll("-", ".")}</time>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className={styles.empty}>조건에 맞는 글이 없습니다.</p>}
      </section>
    </div>
  );
}
