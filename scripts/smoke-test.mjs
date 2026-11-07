import assert from "node:assert/strict";

const base = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const origin = new URL(base);
if (!["http:", "https:"].includes(origin.protocol)) throw new Error("SMOKE_BASE_URL must be HTTP(S).");

async function read(path, options) {
  const response = await fetch(new URL(path, origin), { redirect: "manual", ...options });
  return { response, html: await response.text() };
}

const health = await read("/api/health");
assert.equal(health.response.status, 200);
assert.equal(health.response.headers.get("cache-control"), "no-store");
const info = JSON.parse(health.html);
assert.equal(info.repository, "Undery33/Undery");
assert.match(info.commit, /^[a-f0-9]{40}$/);
if (process.env.BUILD_COMMIT) assert.equal(info.commit, process.env.BUILD_COMMIT);
if (process.env.SOURCE_BRANCH) assert.equal(info.branch, process.env.SOURCE_BRANCH);
const home = await read("/");
const stylesheet = home.html.match(/href="([^\"]+\.css(?:\?[^\"]*)?)"/);
assert.ok(stylesheet, "Rendered page must reference a stylesheet");
assert.equal((await read(stylesheet[1].replaceAll("&amp;", "&"))).response.status, 200);
console.log("PASS build identity and standalone static assets");

for (const path of ["/", "/computer", "/computer/getting-started", "/vrchat", "/valorant"]) {
  const { response, html } = await read(path);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", path);
  assert.match(html, /lang="ko"/, path);
  assert.doesNotMatch(html, /href="\/portfolio(?:\/|"|\?)/, `Portfolio must not be linked at ${path}`);
  console.log(`PASS ${path}`);
}

const search = await read("/computer?q=PostgreSQL&tag=Markdown");
assert.equal(search.response.status, 200);
assert.match(search.html, /조건에 맞는 글이 없습니다/);
const filtered = await read("/computer?tag=Git");
assert.match(filtered.html, /href="\/computer\/development-workflow"/);
assert.doesNotMatch(filtered.html, /href="\/computer\/getting-started"/);
const matched = await read("/computer?q=Markdown&tag=Markdown");
assert.match(matched.html, /href="\/computer\/getting-started"/);
const xss = await read("/computer?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
assert.doesNotMatch(xss.html, /<script>alert\(1\)<\/script>/);
console.log("PASS search, tag, empty state, and escaped input");

const portfolio = await read("/portfolio");
assert.equal(portfolio.response.status, 200);
assert.match(portfolio.response.headers.get("x-robots-tag") || "", /noindex/);
assert.match(portfolio.html, /name="robots" content="[^"]*noindex/);
assert.equal(portfolio.response.headers.get("set-cookie"), null);
console.log("PASS direct portfolio access and noindex");

for (const path of ["/admin", "/admin/posts", "/admin/settings"]) {
  const { response, html } = await read(path);
  assert.equal(response.status, 503, path);
  assert.equal(response.headers.get("cache-control"), "no-store", path);
  assert.doesNotMatch(html, /<form/, path);
  assert.equal((await read(path, { method: "POST" })).response.status, 405, `${path} POST`);
}
console.log("PASS unavailable admin and rejected writes");

for (const path of ["/missing-page", "/computer/not-a-real-post"]) {
  assert.equal((await read(path)).response.status, 404, path);
}
const sitemap = await read("/sitemap.xml");
assert.equal(sitemap.response.status, 200);
assert.doesNotMatch(sitemap.html, /\/portfolio|\/admin/);
assert.equal((await read("/robots.txt")).response.status, 200);
console.log("PASS 404, robots, and sitemap exclusions");
console.log("All HTTP smoke checks passed.");

