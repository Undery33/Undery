import { describe, expect, it } from "vitest";
import { splitTechnologyDemo, technologyDemos } from "@/lib/article-demos";
import { getArticle, getArticles } from "@/lib/articles";

describe("bundled technology examples", () => {
  it.each(technologyDemos)("only extracts the one matching marker for %s", (slug) => {
    expect(splitTechnologyDemo(slug, `앞 문단\n<!-- demo:${slug} -->\n뒷 문단`)).toEqual({ demo: slug, before: "앞 문단\n", after: "\n뒷 문단" });
    expect(splitTechnologyDemo(slug, `<!-- demo:${slug} --><!-- demo:${slug} -->`)).toBeUndefined();
    expect(splitTechnologyDemo(slug, "표식 없는 문서")).toBeUndefined();
  });
  it("does not let other documents select executable examples", () => {
    expect(splitTechnologyDemo("getting-started", "<!-- demo:vlan -->")).toBeUndefined();
    expect(splitTechnologyDemo("dns", "<!-- demo:cnn -->")).toBeUndefined();
    expect(splitTechnologyDemo("__proto__", "<!-- demo:__proto__ -->")).toBeUndefined();
  });
  it("publishes routing, switching and server examples in their matching categories", async () => {
    expect(await getArticle("ip-basics")).toBeUndefined();
    const categories = Object.fromEntries((await getArticles()).map((article) => [article.slug, article.category]));
    expect(categories).toMatchObject({ routing: "router", vlan: "switch", dns: "server", dhcp: "server" });
  });
});
