import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Let crawlers read portfolio's noindex. Disallow is not a privacy control.
  return { rules: { userAgent: "*", allow: "/", disallow: "/admin/" }, sitemap: new URL("/sitemap.xml", siteOrigin()).href };
}
