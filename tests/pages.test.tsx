import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ComputerPage from "@/app/(public)/computer/page";
import ArticlePage from "@/app/(public)/computer/[slug]/page";
import PublicNotFound from "@/app/(public)/not-found";

describe("public page states", () => {
  it("marks the normalized tag filter as selected", async () => {
    const html = renderToStaticMarkup(await ComputerPage({ searchParams: Promise.resolve({ tag: "markdown" }) }));
    expect(html).toMatch(/class="selected" aria-current="true" href="\/computer\?tag=Markdown"/);
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
  it("combines network, tag and body search while retaining the selected filters", async () => {
    const html = renderToStaticMarkup(await ComputerPage({ searchParams: Promise.resolve({ category: "network", tag: "IPv4", q: "옥텟" }) }));
    expect(html).toContain('href="/computer/ip-basics"');
    expect(html).not.toContain('href="/computer/getting-started"');
    expect(html).toContain('name="category" value="network"');
    expect(html).toContain('name="tag" value="IPv4"');
  });
  it("places the bundled IP demo between the lesson text and preserves its category link", async () => {
    const html = renderToStaticMarkup(await ArticlePage({ params: Promise.resolve({ slug: "ip-basics" }) }));
    const demoPosition = html.indexOf("직접 바꾸는 IP 주소");
    expect(demoPosition).toBeGreaterThan(html.indexOf("숫자와 비트를 직접 바꿔 봅시다"));
    expect(demoPosition).toBeLessThan(html.indexOf("표기가 맞아도 연결된다는 뜻은 아닙니다"));
    expect(html).toContain('href="/computer?category=network"');
    expect(html).not.toContain("<!-- demo:ipv4 -->");
  });
  it("keeps ordinary articles free of the IP demo", async () => {
    const html = renderToStaticMarkup(await ArticlePage({ params: Promise.resolve({ slug: "getting-started" }) }));
    expect(html).not.toContain("직접 바꾸는 IP 주소");
  });
});
