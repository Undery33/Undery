import Link from "next/link";
import { articleListHref, type Article } from "@/lib/articles";

export function ArticleCard({ article }: { article: Article }) {
  return (
    <article className="article-card">
      <div className="meta"><time dateTime={article.publishedAt}>{article.publishedAt}</time>{article.example && <span className="badge">예제 글</span>}</div>
      <h2><Link href={`/computer/${article.slug}`}>{article.title}</Link></h2>
      <p>{article.description}</p>
      <ul className="tags" aria-label="글 태그">
        {article.tags.map((tag) => <li key={tag}><Link href={articleListHref("", tag)}>#{tag}</Link></li>)}
      </ul>
    </article>
  );
}
