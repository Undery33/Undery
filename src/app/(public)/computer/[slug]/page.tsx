import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { IpAddressDemo } from "@/components/computer/ip-address-demo";
import styles from "@/components/computer/computer-article.module.css";
import { articleListHref, getArticle, getArticles } from "@/lib/articles";
import { getComputerCategory } from "@/lib/computer-categories";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return (await getArticles()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getArticle((await params).slug);
  if (!article) return { title: "글을 찾을 수 없습니다" };
  return { title: article.title, description: article.description };
}

export default async function ArticlePage({ params }: Props) {
  const article = await getArticle((await params).slug);
  if (!article) notFound();
  const category = getComputerCategory(article.category);
  // Only this authored lesson may insert this bundled component. Markdown stays inert.
  const sections = article.slug === "ip-basics" ? article.body.split("<!-- demo:ipv4 -->") : [article.body];
  const hasIpDemo = sections.length === 2;

  return (
    <article className={styles.article}>
      <nav className={styles.breadcrumb} aria-label="글 위치">
        <Link href="/computer">← Computer</Link>
        {category && <><span aria-hidden="true">/</span><Link href={articleListHref("", "", category.id)}>{category.label}</Link></>}
      </nav>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>{category?.english ?? "Computer"} / Learning notes</p>
        <h1>{article.title}</h1>
        <p className={styles.description}>{article.description}</p>
        <div className={styles.metadata}>
          <time dateTime={article.publishedAt}>{article.publishedAt.replaceAll("-", ".")}</time>
          {article.example && <span>{hasIpDemo ? "학습 예제" : "예제 글"}</span>}
        </div>
        <ul className={styles.tags} aria-label="글 태그">
          {article.tags.map((tag) => <li key={tag}><Link href={articleListHref("", tag, article.category)}>#{tag}</Link></li>)}
        </ul>
      </header>
      {article.example && !hasIpDemo && <aside className={styles.notice}>기본 기능을 확인하기 위한 예제 글입니다. 실제 운영 콘텐츠로 교체할 수 있습니다.</aside>}
      <div className={styles.body}>
        {hasIpDemo ? <><Markdown>{sections[0]}</Markdown><IpAddressDemo /><Markdown>{sections[1]}</Markdown></> : <Markdown>{article.body}</Markdown>}
      </div>
      <footer className={styles.footer}>
        <span>기술을 나누고, 이해를 연결합니다.</span>
        <Link href={articleListHref("", "", article.category)}>{category ? `${category.label} 글 목록` : "전체 기술 글"} ↗</Link>
      </footer>
    </article>
  );
}
