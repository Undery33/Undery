import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { articleListHref, getArticle, getArticles } from "@/lib/articles";

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

  return <article className="article-detail">
    <Link className="back-link" href="/computer">← 전체 기술 글</Link>
    <header className="article-heading"><p className="eyebrow">Computer</p><h1>{article.title}</h1><p className="article-summary">{article.description}</p><div className="meta"><time dateTime={article.publishedAt}>{article.publishedAt}</time></div><ul className="tags" aria-label="글 태그">{article.tags.map((tag) => <li key={tag}><Link href={articleListHref("", tag)}>#{tag}</Link></li>)}</ul></header>
    {article.example && <aside className="notice">기본 기능을 확인하기 위한 예제 글입니다. 실제 운영 콘텐츠로 교체할 수 있습니다.</aside>}
    <Markdown>{article.body}</Markdown>
  </article>;
}
