import type { MetadataRoute } from "next";
import { getArticles } from "@/lib/articles";
import { getPosts } from "@/lib/posts";
import { publicSections, siteOrigin } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const pages = ["/", "/posts", ...publicSections.map(({ href }) => href)].map((pathname) => ({ url: new URL(pathname, origin).href }));
  const [articles, posts] = await Promise.all([getArticles(), getPosts()]);
  // Portfolio and admin must never be added to public discovery lists.
  return [
    ...pages,
    ...articles.map(({ slug, publishedAt }) => ({ url: new URL(`/computer/${slug}`, origin).href, lastModified: publishedAt })),
    ...posts.map(({ slug, publishedAt }) => ({ url: new URL(`/posts/${slug}`, origin).href, lastModified: publishedAt })),
  ];
}
