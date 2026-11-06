import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ComputerPage from "@/app/(public)/computer/page";
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
});
