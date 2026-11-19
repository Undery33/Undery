import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Markdown } from "@/components/markdown";
import { getPost } from "@/lib/posts";
import styles from "../posts.module.css";

type Props = { params: Promise<{ slug: string }> };

const readPost = cache(async (slug: string) => {
  const post = await getPost(slug);
  if (!post) notFound();
  return post;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await readPost((await params).slug);
  return { title: post.title };
}

export default async function PostPage({ params }: Props) {
  const post = await readPost((await params).slug);

  return (
    <article className={styles.page}>
      <Link className={styles.back} href="/posts">← POST 목록</Link>
      <header className={styles.articleHeading}>
        <div className={styles.meta}>
          <span>{post.category}</span>
          <time dateTime={post.publishedAt}>{post.publishedAt.replaceAll("-", ".")}</time>
        </div>
        <h1>{post.title}</h1>
        {post.description && <p>{post.description}</p>}
        {post.tags.length > 0 && (
          <ul className={styles.tags} aria-label="태그">
            {post.tags.map(tag => <li key={tag}>#{tag}</li>)}
          </ul>
        )}
      </header>
      <Markdown>{post.body}</Markdown>
    </article>
  );
}
