import path from "node:path";
import matter from "gray-matter";
import { markdownSlug, publishedDate, readPublishedMarkdown, requiredText } from "@/lib/markdown-collection";

export type Post = {
  slug: string;
  title: string;
  publishedAt: string;
  category: string;
  description: string;
  tags: string[];
  body: string;
  draft: boolean;
};

function parsePost(slug: string, source: string): Post {
  if (!markdownSlug.test(slug)) throw new Error(`Invalid post slug: ${slug}`);
  const { data, content } = matter(source);
  if (data.draft !== undefined && typeof data.draft !== "boolean") {
    throw new Error(`${slug}: draft must be a boolean.`);
  }
  const tags: unknown = data.tags === undefined ? [] : data.tags;
  if (!Array.isArray(tags)) throw new Error(`${slug}: tags must be an array of strings.`);
  return {
    slug,
    title: requiredText(data.title, "title", slug),
    publishedAt: publishedDate(data.publishedAt, slug),
    category: data.category === undefined ? "일반" : requiredText(data.category, "category", slug),
    description: data.description === undefined ? "" : requiredText(data.description, "description", slug),
    tags: [...new Set(tags.map((tag) => requiredText(tag, "tags", slug)))],
    body: requiredText(content, "body", slug),
    draft: data.draft === true,
  };
}

export async function getPosts(): Promise<Post[]> {
  return readPublishedMarkdown(path.join(process.cwd(), "content", "posts"), parsePost, {
    allowMissingDirectory: true,
  });
}

export async function getPost(slug: string): Promise<Post | undefined> {
  if (!markdownSlug.test(slug)) return undefined;
  return (await getPosts()).find((post) => post.slug === slug);
}
