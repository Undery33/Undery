import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ComputerPage from "@/app/(public)/computer/page";
import ArticlePage from "@/app/(public)/computer/[slug]/page";
import PublicNotFound from "@/app/(public)/not-found";

describe("public page states", () => {
  it("offers the six Computer categories without linking to the retired AI collection", async () => {
    const html = renderToStaticMarkup(await ComputerPage({ searchParams: Promise.resolve({}) }));
    const nav = html.match(/<nav\b[^>]*aria-label="기술 분류"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    expect(nav).toBeDefined();
    const hrefs = [...(nav ?? "").matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual(["router", "switch", "asa", "server", "linux", "windows-server"].map((id) => "/computer?category=" + id));
    expect(html).not.toContain('href="/computer/cnn"');
    expect(html).not.toContain('href="/computer?category=ai"');
  });
  it("marks the normalized tag filter as selected", async () => {
    const html = renderToStaticMarkup(await ComputerPage({ searchParams: Promise.resolve({ tag: "markdown" }) }));
    expect(html).toMatch(/<a\b(?=[^>]*aria-current="true")(?=[^>]*href="\/computer\?tag=Markdown")[^>]*>/);
    expect(html).toContain('href="/computer/getting-started"');
    expect(html).not.toContain('href="/computer/development-workflow"');
  });
  it("uses the first duplicate query value and supports an empty state", async () => {
    const html = renderToStaticMarkup(await ComputerPage({ searchParams: Promise.resolve({ q: ["no-results-expected", "Markdown"] }) }));
    expect(html).toContain("조건에 맞는 글이 없습니다");
    expect(html).toContain('value="no-results-expected"');
  });
  it("does not duplicate the layout main landmark on article 404s", () => {
    const html = renderToStaticMarkup(<PublicNotFound />);
    expect(html).not.toContain("<main");
    expect(html).not.toContain('id="main-content"');
  });
  it("combines switch, tag and body search while retaining the selected filters", async () => {
    const html = renderToStaticMarkup(await ComputerPage({ searchParams: Promise.resolve({ category: "switch", tag: "VLAN", q: "트렁크" }) }));
    expect(html).toContain('href="/computer/vlan"');
    expect(html).not.toContain('href="/computer/getting-started"');
    expect(html).toContain('name="category" value="switch"');
    expect(html).toContain('name="tag" value="VLAN"');
  });
  it.each([["vlan", "switch"], ["routing", "router"], ["dns", "server"], ["dhcp", "server"]])("renders the authored %s example with the correct category", async (slug, category) => {
    const html = renderToStaticMarkup(await ArticlePage({ params: Promise.resolve({ slug }) }));
    expect(html).toContain(`data-technology-demo="${slug}"`);
    expect(html).toContain(`href="/computer?category=${category}"`);
    expect(html).toContain('href="#technology-demo"');
    expect(html).not.toContain(`<!-- demo:${slug} -->`);
  });
  it.each(["정적 라우팅", "OSPF", "EIGRP", "IS-IS", "BGP", "RIPng", "PBR", "VRF"])("finds Cisco routing by technology name %s in the Router archive", async (q) => {
    const html = renderToStaticMarkup(await ComputerPage({ searchParams: Promise.resolve({ category: "router", q }) }));
    expect(html).toContain('href="/computer/routing"');
    expect(html).toContain('name="category" value="router"');
    expect(html).not.toContain('href="/computer/dhcp"');
  });
  it("keeps ordinary articles free of interactive examples", async () => {
    const html = renderToStaticMarkup(await ArticlePage({ params: Promise.resolve({ slug: "getting-started" }) }));
    expect(html).not.toContain('data-technology-demo=');
  });
});
