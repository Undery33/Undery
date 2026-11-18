import type { Post } from "./posts";

export function normalizePostQuery(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

export function toPostSummary({ slug, title, publishedAt, category, description, tags }: Post) {
  return {
    slug, title, publishedAt, category,
    keywords: normalizePostQuery([title, category, description, ...tags].join(" ")),
  };
}

export type PostSummary = ReturnType<typeof toPostSummary>;
