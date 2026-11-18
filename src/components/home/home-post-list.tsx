"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./home-posts.module.css";

type Post = {
  slug: string;
  title: string;
  publishedAt: string;
  category: string;
  keywords: string;
};

export function HomePostList({ posts }: { posts: Post[] }) {
  const [query, setQuery] = useState("");
  const words = query.normalize("NFKC").toLocaleLowerCase("ko-KR").trim().split(/\s+/).filter(Boolean);
  const matches = words.length
    ? posts.filter((post) => words.every((word) => post.keywords.includes(word)))
    : posts;

  return (
    <>
      <form className={styles.search} action="/computer#articles" method="get" role="search" aria-label="게시글 검색">
        <input type="search" aria-label="게시글 검색어" name="q" maxLength={120} value={query}
          onChange={(event) => setQuery(event.target.value)} placeholder="키워드를 검색해보세요!" />
        <button type="submit" aria-label="전체 글에서 검색">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="10" cy="10" r="7" /><path d="m15.2 15.2 6.6 6.6" />
          </svg>
        </button>
      </form>
      <div className={styles.list}>
        <table aria-label="최근 게시글">
          <thead><tr><th scope="col">분류</th><th scope="col">날짜</th><th scope="col">제목</th></tr></thead>
          <tbody>
            {matches.slice(0, 5).map((post) => (
              <tr key={post.slug}>
                <td>{post.category}</td>
                <td><time dateTime={post.publishedAt}>{post.publishedAt.slice(2).replaceAll("-", ".")}</time></td>
                <td><Link href={"/computer/" + post.slug}>{post.title}</Link></td>
              </tr>
            ))}
            {!matches.length && (
              <tr><td colSpan={3} className={styles.empty}>{posts.length ? "검색 결과가 없습니다." : "등록된 글이 없습니다."}</td></tr>
            )}
          </tbody>
        </table>
        <span className={styles.announcement} role="status">{words.length ? `검색 결과 ${matches.length}개` : ""}</span>
        <Link className={styles.more} href={query.trim()
          ? "/computer?" + new URLSearchParams({ q: query.trim() }) + "#articles"
          : "/computer#articles"}>더 보기</Link>
      </div>
    </>
  );
}
