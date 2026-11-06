import { describe, expect, it } from "vitest";
import { articleListHref, filterArticles, getArticle, getArticles, getTags, parseArticle } from "@/lib/articles";

const source = `---
title: "TypeScript 시작"
description: "정적 타입을 배웁니다"
publishedAt: "2026-11-06"
tags: ["TypeScript", "개발", "개발"]
draft: false
---
본문에서 검색할 PostgreSQL 설명입니다.
`;

describe("Markdown article validation", () => {
  it("validates and deduplicates metadata", () => {
    expect(parseArticle("typescript-basics", source)).toMatchObject({ title: "TypeScript 시작", tags: ["TypeScript", "개발"], draft: false, example: false });
  });
  it.each(["../secret", "article/name", "Bad_Name", ""])('rejects unsafe slug "%s"', (slug) => {
    expect(() => parseArticle(slug, source)).toThrow("Invalid article slug");
  });
  it.each(["2026-02-30", "not-a-date", "2026-13-01"])('rejects invalid date "%s"', (date) => {
    expect(() => parseArticle("example", source.replace("2026-11-06", date))).toThrow("publishedAt");
  });
  it("rejects unquoted YAML dates", () => {
    expect(() => parseArticle("example", source.replace('"2026-11-06"', "2026-11-06"))).toThrow("publishedAt");
  });
  it("rejects missing metadata, empty content, and string booleans", () => {
    expect(() => parseArticle("example", "no front matter")).toThrow();
    expect(() => parseArticle("example", source.replace("draft: false", 'draft: "false"'))).toThrow("draft");
    expect(() => parseArticle("example", source.replace('tags: ["TypeScript", "개발", "개발"]', "tags: []"))).toThrow("tags");
    expect(() => parseArticle("example", source.slice(0, source.lastIndexOf("---") + 3))).toThrow("body");
  });
});

describe("search and tag filtering", () => {
  const article = parseArticle("typescript-basics", source);
  const articles = [article];
  it("matches title, body and normalized full-width input", () => {
    expect(filterArticles(articles, "typescript", "")).toHaveLength(1);
    expect(filterArticles(articles, "postgresql", "")).toHaveLength(1);
    expect(filterArticles(articles, "ＴｙｐｅＳｃｒｉｐｔ", "")).toHaveLength(1);
  });
  it("intersects query words and exact tags", () => {
    expect(filterArticles(articles, "타입 PostgreSQL", "개발")).toHaveLength(1);
    expect(filterArticles(articles, "typescript", "Git")).toHaveLength(0);
    expect(filterArticles(articles, "absent", "개발")).toHaveLength(0);
    expect(filterArticles(articles, "", "개")).toHaveLength(0);
    expect(filterArticles(articles, "", " typescript ")).toHaveLength(1);
  });
  it("returns all results for empty filters and unique sorted tags", () => {
    expect(filterArticles(articles, "   ", "")).toEqual(articles);
    expect(getTags([article, article])).toHaveLength(2);
  });
  it("encodes filter URLs safely and resets empty values", () => {
    expect(articleListHref()).toBe("/computer");
    const url = new URL(articleListHref("a&b", "C++"), "http://localhost");
    expect(url.searchParams.get("q")).toBe("a&b");
    expect(url.searchParams.get("tag")).toBe("C++");
  });
});

describe("repository content", () => {
  it("loads and validates every published article", async () => {
    const articles = await getArticles();
    expect(articles.length).toBeGreaterThan(0);
    expect(articles.every((article) => !article.draft)).toBe(true);
    expect(new Set(articles.map(({ slug }) => slug)).size).toBe(articles.length);
  });
  it("finds known posts and refuses missing or traversal paths", async () => {
    expect(await getArticle("getting-started")).toBeDefined();
    expect(await getArticle("not-a-real-post")).toBeUndefined();
    expect(await getArticle("../.env")).toBeUndefined();
  });
});
