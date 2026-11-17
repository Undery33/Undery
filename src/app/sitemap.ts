import type { MetadataRoute } from "next";
import { getArticles } from "@/lib/articles";
import { publicSections, siteOrigin } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const pages = ["/", ...publicSections.map(({ href }) => href)].map((pathname) => ({ url: new URL(pathname, origin).href }));
  const articles = (await getArticles()).map(({ slug, publishedAt }) => ({ url: new URL(`/computer/${slug}`, origin).href, lastModified: publishedAt }));
  // Portfolio and admin must never be added to public discovery lists.
  return [...pages, ...articles];
}
