import type { Metadata } from "next";
import { HomePostList } from "@/components/home/home-post-list";
import { toPostSummary } from "@/lib/post-summary";
import { getPosts } from "@/lib/posts";
import styles from "./posts.module.css";

export const metadata: Metadata = {
  title: "POST",
};

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export default async function PostsPage({ searchParams }: Props) {
  const [posts, { q }] = await Promise.all([getPosts(), searchParams]);
  const query = ((Array.isArray(q) ? q[0] : q) ?? "").slice(0, 120);

  return (
    <section className={`${styles.page} ${styles.archive}`} aria-labelledby="post-archive-heading">
      <h1 className={styles.archiveTitle} id="post-archive-heading">POST</h1>
      <HomePostList key={query} posts={posts.map(toPostSummary)} archive initialQuery={query} />
    </section>
  );
}
