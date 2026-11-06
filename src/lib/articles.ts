import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export type Article = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  tags: string[];
  body: string;
  draft: boolean;
  example: boolean;
};

const contentDirectory = path.join(process.cwd(), "content", "computer");
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function requiredText(value: unknown, field: string, slug: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${slug}: ${field} must be a non-empty string.`);
  }
  return value.trim();
}

/** Validate author-owned Markdown at build/read time; never trust URL input as a file path. */
export function parseArticle(slug: string, source: string): Article {
  if (!slugPattern.test(slug)) throw new Error(`Invalid article slug: ${slug}`);
  const { data, content } = matter(source);
  const publishedAt = requiredText(data.publishedAt, "publishedAt", slug);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) ||
    Number.isNaN(Date.parse(publishedAt)) ||
    new Date(publishedAt).toISOString().slice(0, 10) !== publishedAt
  ) {
    throw new Error(`${slug}: publishedAt must be a valid quoted YYYY-MM-DD date.`);
  }
  if (
    !Array.isArray(data.tags) ||
    data.tags.length === 0 ||
    data.tags.some((tag: unknown) => typeof tag !== "string" || !tag.trim())
  ) {
    throw new Error(`${slug}: tags must contain at least one non-empty string.`);
  }
  for (const field of ["draft", "example"]) {
    if (data[field] !== undefined && typeof data[field] !== "boolean") {
      throw new Error(`${slug}: ${field} must be a boolean.`);
    }
  }
  if (!content.trim()) throw new Error(`${slug}: article body cannot be empty.`);

  return {
    slug,
    title: requiredText(data.title, "title", slug),
    description: requiredText(data.description, "description", slug),
    publishedAt,
    tags: [...new Set((data.tags as string[]).map((tag) => tag.trim()))],
    body: content.trim(),
    draft: data.draft === true,
    example: data.example === true,
  };
}

export async function getArticles(): Promise<Article[]> {
  const files = await readdir(contentDirectory);
  const articles = await Promise.all(
    files.filter((file) => file.endsWith(".md")).map(async (file) =>
      parseArticle(file.slice(0, -3), await readFile(path.join(contentDirectory, file), "utf8")),
    ),
  );
  return articles
    .filter((article) => !article.draft)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
}

export async function getArticle(slug: string): Promise<Article | undefined> {
  if (!slugPattern.test(slug)) return undefined;
  return (await getArticles()).find((article) => article.slug === slug);
}

export function normalizeSearch(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

/** Search title, summary, tags, and Markdown body. Tag and query filters intersect. */
export function filterArticles(articles: Article[], query: string, tag: string): Article[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const normalizedTag = normalizeSearch(tag);
  return articles.filter((article) => {
    const matchesTag = !normalizedTag || article.tags.some((item) => normalizeSearch(item) === normalizedTag);
    const haystack = normalizeSearch([article.title, article.description, ...article.tags, article.body].join(" "));
    return matchesTag && words.every((word) => haystack.includes(word));
  });
}

export function getTags(articles: Article[]): string[] {
  return [...new Set(articles.flatMap((article) => article.tags))].sort((a, b) => a.localeCompare(b, "ko"));
}

export function articleListHref(query = "", tag = ""): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (tag) params.set("tag", tag);
  const search = params.toString();
  return `/computer${search ? `?${search}` : ""}`;
}
