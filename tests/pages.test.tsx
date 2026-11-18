import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ComputerPage from "@/app/(public)/computer/page";
import ArticlePage from "@/app/(public)/computer/[slug]/page";
import PublicNotFound from "@/app/(public)/not-found";

// These tests render the initial HTML outside the Next.js router.
vi.mock(import("next/navigation"), async (importOriginal) => ({
  ...await importOriginal(), useRouter: vi.fn(),
}));

describe("public page states", () => {
  it("offers the six Computer categories without linking to the retired AI collection", async () => {
    const html = renderToStaticMarkup(await ComputerPage({ searchParams: Promise.resolve({}) }));
    const nav = html.match(/<nav\b[^>]*aria-label="기술 분류"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    expect(nav).toBeDefined();
    const hrefs = [...(nav ?? "").matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual([
      "/computer?category=router", "/computer?category=switch", "/computer?category=asa",
      "/computer?category=server", "/computer?category=linux#computer-screen", "/computer?category=windows-server",
    ]);
    expect(html).not.toContain('href="/computer/cnn"');
    expect(html).not.toContain('href="/computer?category=ai"');
  });
  it("renders three named, icon-only architecture diagrams on a direct Linux request", async () => {
    const html = renderToStaticMarkup(await ComputerPage({ searchParams: Promise.resolve({ category: "linux" }) }));
    expect(html).toContain('id="computer-screen"');
    expect(html).toContain('data-topology-view="linux"');
    expect([...html.matchAll(/data-architecture="([^"]+)"/g)].map(match => match[1])).toEqual(["kubernetes", "jenkins", "docker"]);
    const diagrams = html.match(/<svg\b[^>]*data-architecture="[^"]+"[^>]*>[\s\S]*?<\/svg>/g) ?? [];
    expect(diagrams).toHaveLength(3);
    for (const diagram of diagrams) {
      expect(diagram).toContain('role="img"');
      expect(diagram).toMatch(/aria-label="[^"]+"/);
      expect(diagram).toContain("data-brand=");
      expect(diagram).toContain("data-node=");
      expect(diagram).toContain("data-edge=");
      expect(diagram).not.toMatch(/<(?:text|foreignObject)\b/i);
    }
  });
  it("keeps the network map wordless with named links and two plugs per cable on either layout", async () => {
    const html = renderToStaticMarkup(await ComputerPage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain('aria-label="Undery 홈"');
    expect(html).toContain('aria-label="Router부터 보기"');
    const layouts = html.match(/<svg\b[^>]*aria-label="컴퓨터 네트워크 구성도"[^>]*>[\s\S]*?<\/svg>/g) ?? [];
    expect(layouts).toHaveLength(2);
    for (const map of layouts) {
      expect(map).not.toContain("<text");
      expect(map.match(/data-ethernet-run=/g)).toHaveLength(5);
      const jackets = [...map.matchAll(/<path\b(?=[^>]*data-cable-jacket=)[^>]*\bd="([^"]+)"/g)];
      expect(jackets).toHaveLength(5);
      for (const [, path] of jackets) expect(path).toMatch(/^M[-\d., ]+(?:L[-\d., ]+)+$/);
      expect(map.match(/data-rj45-plug="from"/g)).toHaveLength(5);
      expect(map.match(/data-rj45-plug="to"/g)).toHaveLength(5);
      expect(map.match(/aria-label="[^"]+ 글 보기"/g)).toHaveLength(6);
    }
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
