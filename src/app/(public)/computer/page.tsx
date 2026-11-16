import type { Metadata } from "next";
import Link from "next/link";
import { ComputerShowcase } from "@/components/computer/computer-showcase";
import styles from "@/components/computer/computer.module.css";
import {
  articleListHref, filterArticles, getArticles, getTags, normalizeSearch, type Article,
} from "@/lib/articles";
import { computerCategories, getComputerCategory } from "@/lib/computer-categories";

export const metadata: Metadata = {
  title: "Computer",
  description: "서버·네트워크·AI. 세 분야로 연결하는 기술 기록과 검색.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Filters = { query: string; tag: string; category: string };

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || "";
}

function catalogueHref(query = "", tag = "", category = "") {
  const href = articleListHref(query, tag, category);
  return href === "/computer" ? href + "#articles" : href;
}

function Arrow({ down = false }: { down?: boolean }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" className={down ? styles.arrowDown : undefined}><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SearchForm({ query, tag, category, id, compact = false }: Filters & { id: string; compact?: boolean }) {
  return (
    <form className={[styles.searchForm, compact ? styles.compactSearch : ""].join(" ")} action="/computer#articles" method="get" role="search" aria-label={compact ? "빠른 기술 글 검색" : "기술 글 검색"}>
      <label className={styles.srOnly} htmlFor={id}>기술 글 검색</label>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      <input key={query} id={id} name="q" type="search" defaultValue={query} maxLength={120} placeholder="기술 이름이나 키워드로 검색" />
      {tag && <input type="hidden" name="tag" value={tag} />}
      {category && <input type="hidden" name="category" value={category} />}
      <button type="submit"><span>검색</span><Arrow /></button>
    </form>
  );
}

function ArticleRow({ article, filters }: { article: Article; filters: Filters }) {
  const field = getComputerCategory(article.category);
  return (
    <article className={styles.articleRow}>
      <div className={styles.articleMeta}>
        {field && <span className={styles.articleField}>{field.label}</span>}
        <time dateTime={article.publishedAt}>{article.publishedAt.replaceAll("-", ".")}</time>
        {article.example && <span className={styles.example}>예제 글</span>}
      </div>
      <h3><Link href={"/computer/" + article.slug}>{article.title}<Arrow /></Link></h3>
      <p>{article.description}</p>
      <ul className={styles.articleTags} aria-label="글 태그">
        {article.tags.map((tag) => <li key={tag}><Link href={catalogueHref(filters.query, tag, filters.category)}>#{tag}</Link></li>)}
      </ul>
    </article>
  );
}

export default async function ComputerPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = first(params.q).trim().slice(0, 120);
  const tag = first(params.tag).trim().slice(0, 80);
  const category = getComputerCategory(first(params.category))?.id || "";
  const filters = { query, tag, category };
  const articles = await getArticles();
  const filtered = filterArticles(articles, query, tag, category);
  const tags = getTags(articles);
  const selectedCategory = getComputerCategory(category);
  const hasFilters = Boolean(query || tag || category);

  return (
    <div className={styles.page}>
      {hasFilters ? (
        <header className={styles.searchIntro}>
          <Link href="/computer" className={styles.backLink}>← 분야 둘러보기</Link>
          <p className={styles.eyebrow}>COMPUTER / ARCHIVE</p>
          <h1>{selectedCategory ? selectedCategory.label + "의 기록" : "기술 기록 검색"}<span className={styles.titleDot}>.</span></h1>
          <p>{selectedCategory?.description || "궁금한 기술을 검색하고 필요한 기록을 찾아봅니다."}</p>
        </header>
      ) : (
        <ComputerShowcase>
          <section id="overview" className={styles.intro} data-computer-section="overview" aria-labelledby="computer-title">
            <p className={styles.eyebrow}><span className={styles.statusDot} />COMPUTER / NOTES & LEARNING</p>
            <h1 id="computer-title">기술을 나누고,<br />이해를 연결합니다<span className={styles.titleDot}>.</span></h1>
            <p className={styles.introDescription}>서버를 이해하고 네트워크로 연결하고 AI로 확장합니다.<br />배운 내용을 세 갈래로 기록합니다.</p>
            <SearchForm {...filters} id="hero-article-search" compact />
            <p className={styles.searchHint}>제목 · 본문 · 태그로 검색</p>
            <div className={styles.introActions}>
              <a className={styles.outlineLink} href="#server">분야 살펴보기<Arrow down /></a>
              <a className={styles.quietLink} href="#articles">전체 글 보기<Arrow /></a>
            </div>
            <nav className={styles.introIndex} aria-label="세 가지 기술 분야">
              {computerCategories.map((field, index) => <a href={"#" + field.id} key={field.id}><span>{String(index + 1).padStart(2, "0")}</span>{field.label}</a>)}
            </nav>
          </section>

          {computerCategories.map((field, index) => {
            const fieldArticles = articles.filter((article) => article.category === field.id);
            return (
              <section className={styles.fieldSection} id={field.id} data-computer-section={field.id} key={field.id} aria-labelledby={field.id + "-title"}>
                <div className={styles.fieldNumber}><span>{String(index + 1).padStart(2, "0")}</span><span>{field.english}</span></div>
                <h2 id={field.id + "-title"}>{field.label}<span className={styles.titleDot}>.</span></h2>
                <h3>{field.headline}</h3>
                <p className={styles.fieldDescription}>{field.description}</p>
                <ul className={styles.topics} aria-label={field.label + "의 주요 주제"}>{field.topics.map((topic) => <li key={topic}>{topic}</li>)}</ul>
                <div className={styles.fieldArticles}>
                  <div className={styles.fieldArticlesHeading}><span>이 분야의 기록</span><span>{String(fieldArticles.length).padStart(2, "0")}</span></div>
                  {fieldArticles.length > 0 ? (
                    <ol>{fieldArticles.slice(0, 3).map((article) => <li key={article.slug}><Link href={"/computer/" + article.slug}>{article.title}<Arrow /></Link></li>)}</ol>
                  ) : <p className={styles.fieldEmpty}>첫 기록을 준비하고 있습니다.</p>}
                  <Link className={styles.fieldLink} href={articleListHref("", "", field.id)}>{field.label} 글 모아보기<Arrow /></Link>
                </div>
              </section>
            );
          })}
        </ComputerShowcase>
      )}

      <section id="articles" className={[styles.catalogue, hasFilters ? styles.filteredCatalogue : ""].join(" ")} aria-labelledby="archive-title">
        <div className={styles.catalogueHeading}>
          <div><p className={styles.eyebrow}>THE ARCHIVE</p><h2 id="archive-title">기록을 찾아봅니다<span className={styles.titleDot}>.</span></h2></div>
          <p>관심 있는 분야부터<br /> 지금 필요한 키워드까지.</p>
        </div>
        <SearchForm {...filters} id="article-search" />
        <nav className={styles.categories} aria-label="분야로 필터링">
          <Link href={catalogueHref(query, tag)} aria-current={!category ? "true" : undefined}>전체<span>{articles.length}</span></Link>
          {computerCategories.map((field) => <Link key={field.id} href={catalogueHref(query, tag, field.id)} aria-current={category === field.id ? "true" : undefined}>{field.label}<span>{articles.filter((article) => article.category === field.id).length}</span></Link>)}
        </nav>
        {tags.length > 0 && <nav className={styles.tags} aria-label="태그로 필터링">
          <span>태그</span>
          <Link className={!tag ? "selected" : undefined} aria-current={!tag ? "true" : undefined} href={catalogueHref(query, "", category)}>전체</Link>
          {tags.map((item) => {
            const selected = normalizeSearch(tag) === normalizeSearch(item);
            return <Link className={selected ? "selected" : undefined} aria-current={selected ? "true" : undefined} href={catalogueHref(query, item, category)} key={item}>#{item}</Link>;
          })}
        </nav>}
        <div className={styles.resultsHeading}>
          <p><strong>{filtered.length}</strong>개의 글{query && <> · “{query}”</>}{selectedCategory && <> · {selectedCategory.label}</>}{tag && <> · #{tag}</>}</p>
          {hasFilters && <Link href="/computer#articles">검색·필터 초기화<Arrow /></Link>}
        </div>
        {filtered.length > 0 ? (
          <div className={styles.articleList}>{filtered.map((article) => <ArticleRow key={article.slug} article={article} filters={filters} />)}</div>
        ) : (
          <div className={styles.emptyState}>
            <span aria-hidden="true" className={styles.emptyMark}>∅</span>
            <h3>조건에 맞는 글이 없습니다.</h3>
            <p>{category && !query && !tag ? "이 분야의 첫 기록을 준비하고 있습니다." : "다른 검색어를 입력하거나 분야·태그 필터를 초기화해 보세요."}</p>
            <Link href="/computer#articles">전체 글 보기<Arrow /></Link>
          </div>
        )}
        <div className={styles.archiveFootnote}><span>UNDERY / COMPUTER</span><a href={hasFilters ? "/computer" : "#overview"}>처음으로 ↑</a></div>
      </section>
    </div>
  );
}
