import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "@/components/markdown";
import { GET } from "@/app/admin/[[...path]]/route";
import { metadata } from "@/app/portfolio/page";
import sitemap from "@/app/sitemap";
import { publicSections, siteOrigin } from "@/lib/site";

afterEach(() => vi.unstubAllEnvs());

describe("content safety", () => {
  it("does not render raw scripts, HTML handlers, or javascript links", () => {
    const html = renderToStaticMarkup(<Markdown>{'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert%281%29)'}</Markdown>);
    expect(html).not.toMatch(/<script|onerror=|href="javascript:/);
  });
  it("renders ordinary Markdown and code as text", () => {
    const html = renderToStaticMarkup(<Markdown>{"## Heading\n\n**Bold**\n\n`<script>`"}</Markdown>);
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("private-by-discovery is not authentication", () => {
  it("keeps portfolio and admin out of navigation and sitemap", async () => {
    vi.stubEnv("SITE_URL", "https://example.test");
    expect(publicSections.map(({ href }) => href)).toEqual(["/computer", "/vrchat", "/valorant"]);
    const urls = (await sitemap()).map(({ url }) => url);
    expect(urls).not.toContain("https://example.test/portfolio");
    expect(urls).not.toContain("https://example.test/admin");
    expect(urls).toContain("https://example.test/computer/getting-started");
  });
  it("declares portfolio noindex", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
  it("fails closed for admin without pretending authentication exists", async () => {
    const response = GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(await response.text()).not.toContain("<form");
  });
  it("rejects invalid site origins and strips paths", () => {
    vi.stubEnv("SITE_URL", "https://example.test/nested");
    expect(siteOrigin().href).toBe("https://example.test/");
    vi.stubEnv("SITE_URL", "javascript:alert(1)");
    expect(() => siteOrigin()).toThrow();
    vi.stubEnv("SITE_URL", "https://user:password@example.test");
    expect(() => siteOrigin()).toThrow();
  });
});
