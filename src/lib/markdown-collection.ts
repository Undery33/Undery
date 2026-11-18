import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const markdownSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function requiredText(value: unknown, field: string, slug: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${slug}: ${field} must be a non-empty string.`);
  }
  return value.trim();
}

export function publishedDate(value: unknown, slug: string): string {
  const date = requiredText(value, "publishedAt", slug);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`${slug}: publishedAt must be a valid quoted YYYY-MM-DD date.`);
  }
  return date;
}

export async function readPublishedMarkdown<T extends { slug: string; publishedAt: string; draft: boolean }>(
  directory: string,
  parse: (slug: string, source: string) => T,
  options: { allowMissingDirectory?: boolean } = {},
): Promise<T[]> {
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (options.allowMissingDirectory && error.code === "ENOENT") return [];
    throw error;
  });
  const entries = await Promise.all(
    files.filter((file) => file.endsWith(".md")).map(async (file) =>
      parse(file.slice(0, -3), await readFile(path.join(directory, file), "utf8")),
    ),
  );
  return entries
    .filter((entry) => !entry.draft)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
}
