import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { articleListHref, filterArticles, getArticles, getTags, normalizeSearch } from "@/lib/articles";

export const metadata: Metadata = { title: "Computer", description: "태그와 검색으로 찾는 기술 기록" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function first(value: string | string[] | undefined) { return (Array.isArray(value) ? value[0] : value) || ""; }

export default async function ComputerPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = first(params.q).trim().slice(0, 120);
  const tag = first(params.tag).trim().slice(0, 80);
  const articles = await getArticles();
  const filtered = filterArticles(articles, query, tag);
  const tags = getTags(articles);

  return (
    <>
      <div className="page-heading"><p className="eyebrow">Notes & learning</p><h1>Computer</h1><p>배운 내용을 기록하고, 필요할 때 다시 꺼내 봅니다.</p></div>
      <form className="search-form" action="/computer" method="get" role="search">
        <div className="search-field"><label htmlFor="article-search">기술 글 검색</label><input key={query} type="search" id="article-search" name="q" defaultValue={query} maxLength={120} placeholder="제목, 본문, 태그로 검색" /></div>
        {tag && <input type="hidden" name="tag" value={tag} />}
        <button type="submit">검색</button>
      </form>
      <nav className="filter-tags" aria-label="태그로 필터링">
        <Link className={!tag ? "selected" : ""} aria-current={!tag ? "true" : undefined} href={articleListHref(query)}>전체</Link>
        {tags.map((item) => {
          const selected = normalizeSearch(tag) === normalizeSearch(item);
          return <Link className={selected ? "selected" : ""} aria-current={selected ? "true" : undefined} href={articleListHref(query, item)} key={item}>#{item}</Link>;
        })}
      </nav>
      <div className="results-heading"><p>{filtered.length}개의 글{query && <> · “{query}”</>}{tag && <> · #{tag}</>}</p>{(query || tag) && <Link href="/computer">검색·필터 초기화</Link>}</div>
      {filtered.length ? <div className="article-list">{filtered.map((article) => <ArticleCard key={article.slug} article={article} />)}</div> : <div className="empty-state"><h2>조건에 맞는 글이 없습니다.</h2><p>다른 검색어를 입력하거나 태그 필터를 초기화해 보세요.</p><Link className="text-link" href="/computer">전체 글 보기</Link></div>}
    </>
  );
}
