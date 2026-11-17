import { describe, expect, it } from "vitest";
import { articleListHref, filterArticles, getArticle, getArticles, getTags, parseArticle } from "@/lib/articles";
import { computerCategories, getComputerCategory } from "@/lib/computer-categories";

const source = `---
title: "Linux 시작"
description: "운영체제의 자원과 프로세스를 배웁니다"
publishedAt: "2026-11-06"
tags: ["Linux", "운영", "운영"]
draft: false
---
본문에서 검색할 PostgreSQL 설명입니다.
`;

describe("Markdown article validation", () => {
  it("validates and deduplicates metadata", () => {
    expect(parseArticle("linux-basics", source)).toMatchObject({ title: "Linux 시작", tags: ["Linux", "운영"], draft: false, example: false });
  });
  it("preserves an article with no category without guessing from its tags", () => {
    expect(parseArticle("linux-basics", source).category).toBeUndefined();
  });
  it.each(["server", "network", "ai"])("accepts the explicit category %s", (category) => {
    expect(parseArticle("example", source.replace("draft: false", `category: ${category}\ndraft: false`)).category).toBe(category);
  });
  it.each(['"devops"', '"frontend"', '"backend"', '"Server"', '""', "null", "42", "[server]"])("rejects an invalid category %s", (category) => {
    expect(() => parseArticle("example", source.replace("draft: false", `category: ${category}\ndraft: false`))).toThrow("category");
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
    expect(() => parseArticle("example", source.replace('tags: ["Linux", "운영", "운영"]', "tags: []"))).toThrow("tags");
    expect(() => parseArticle("example", source.slice(0, source.lastIndexOf("---") + 3))).toThrow("body");
  });
});

describe("search and tag filtering", () => {
  const article = parseArticle("linux-basics", source);
  const articles = [article];
  it("matches title, body and normalized full-width input", () => {
    expect(filterArticles(articles, "linux", "")).toHaveLength(1);
    expect(filterArticles(articles, "postgresql", "")).toHaveLength(1);
    expect(filterArticles(articles, "Ｌｉｎｕｘ", "")).toHaveLength(1);
  });
  it("intersects query words and exact tags", () => {
    expect(filterArticles(articles, "자원 PostgreSQL", "운영")).toHaveLength(1);
    expect(filterArticles(articles, "linux", "Git")).toHaveLength(0);
    expect(filterArticles(articles, "absent", "운영")).toHaveLength(0);
    expect(filterArticles(articles, "", "운")).toHaveLength(0);
    expect(filterArticles(articles, "", " linux ")).toHaveLength(1);
  });
  it("returns all results for empty filters and unique sorted tags", () => {
    expect(filterArticles(articles, "   ", "")).toEqual(articles);
    expect(getTags([article, article])).toHaveLength(2);
  });
  it("intersects category, query, and tag while keeping uncategorized posts in all results", () => {
    const server = parseArticle("server-notes", source.replace("draft: false", "category: server\ndraft: false"));
    const network = parseArticle("network-notes", source.replace("draft: false", "category: network\ndraft: false"));
    const mixed = [article, server, network];
    expect(filterArticles(mixed, "", "")).toEqual(mixed);
    expect(filterArticles(mixed, "PostgreSQL", "Git", "network")).toEqual([]);
    expect(filterArticles(mixed, "PostgreSQL", "운영", "network")).toEqual([network]);
    expect(filterArticles(mixed, "Ｌｉｎｕｘ", "linux", "server")).toEqual([server]);
    expect(filterArticles(mixed, "absent", "운영", "network")).toEqual([]);
    expect(filterArticles(mixed, "", "", "ai")).toEqual([]);
    expect(filterArticles(mixed, "", "", "unknown")).toEqual([]);
  });
  it("encodes filter URLs safely and resets empty values", () => {
    expect(articleListHref()).toBe("/computer");
    const url = new URL(articleListHref("a&b", "C++"), "http://localhost");
    expect(url.searchParams.get("q")).toBe("a&b");
    expect(url.searchParams.get("tag")).toBe("C++");
    const categorized = new URL(articleListHref("a&b", "C++", "server"), "http://localhost");
    expect([...categorized.searchParams]).toEqual([["q", "a&b"], ["tag", "C++"], ["category", "server"]]);
    expect(articleListHref("", "", "server")).toBe("/computer?category=server");
    expect(new URL(articleListHref("", "", "a&b"), "http://localhost").searchParams.get("category")).toBe("a&b");
  });
});

describe("computer category metadata", () => {
  it("exposes the three categories in the requested order and only resolves exact IDs", () => {
    expect(computerCategories.map(({ id }) => id)).toEqual(["server", "network", "ai"]);
    expect(getComputerCategory("server")?.label).toBe("서버");
    expect(getComputerCategory("Server")).toBeUndefined();
    expect(getComputerCategory("frontend")).toBeUndefined();
    expect(getComputerCategory("backend")).toBeUndefined();
    expect(getComputerCategory(undefined)).toBeUndefined();
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
