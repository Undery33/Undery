import assert from "node:assert/strict";

const base = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const origin = new URL(base);
if (!["http:", "https:"].includes(origin.protocol)) throw new Error("SMOKE_BASE_URL must be HTTP(S).");
const adminEnabled = process.env.SMOKE_ADMIN_ENABLED === "true";
if (process.env.SMOKE_ADMIN_ENABLED && !["true", "false"].includes(process.env.SMOKE_ADMIN_ENABLED)) {
  throw new Error("SMOKE_ADMIN_ENABLED must be true or false.");
}

async function read(path, options) {
  const response = await fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(15000), ...options });
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

const birthday = await read("/birthday");
assert.equal(birthday.response.status, 200);
assert.match(birthday.html, /Undery #26 생일 파티/);
const worldLink = birthday.html.match(/<a\b[^>]*aria-label="VRChat 월드 구경하기"[^>]*>/)?.[0];
assert.ok(worldLink, "The printed world link must have an accessible name");
assert.match(worldLink, /href="https:\/\/vrchat\.com\/home\/world\/wrld_59673787-ac01-41bb-8d81-568a17ca6993\/info"/);
const poster = birthday.html.match(/<img\b[^>]*\bsrc="(\/_next\/static\/media\/[^"<>]+\.webp)"/);
assert.ok(poster, "The birthday page must reference its bundled poster");
const posterResponse = await fetch(new URL(poster[1], origin), { signal: AbortSignal.timeout(15000) });
assert.equal(posterResponse.status, 200);
assert.match(posterResponse.headers.get("content-type") || "", /^image\/webp\b/);
console.log("PASS /birthday and its bundled poster");

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
  assert.equal(response.status, path === "/admin" && adminEnabled ? 303 : 503, path);
  if (path === "/admin" && adminEnabled) {
    assert.equal(response.headers.get("location"), new URL("/birthday/memo/admin", process.env.SITE_URL || "https://undery.link").href);
  }
  assert.equal(response.headers.get("cache-control"), "no-store", path);
  assert.doesNotMatch(html, /<form/, path);
  assert.equal((await read(path, { method: "POST" })).response.status, 405, `${path} POST`);
}
const adminPage = await read("/birthday/memo/admin");
assert.equal(adminPage.response.status, 200);
assert.match(adminPage.response.headers.get("cache-control") || "", /no-store/);
if (adminEnabled) assert.match(adminPage.html, /GitHub/);
const adminEntries = await read("/birthday/memo/admin/entries");
assert.equal(adminEntries.response.status, adminEnabled ? 401 : 503);
assert.equal(JSON.parse(adminEntries.html).error, adminEnabled ? "login_required" : "auth_unavailable");
console.log("PASS expected admin login state and rejected unauthenticated access");

for (const path of ["/missing-page", "/computer/not-a-real-post"]) {
  assert.equal((await read(path)).response.status, 404, path);
}
const sitemap = await read("/sitemap.xml");
assert.equal(sitemap.response.status, 200);
assert.doesNotMatch(sitemap.html, /\/portfolio|\/admin/);
assert.equal((await read("/robots.txt")).response.status, 200);
console.log("PASS 404, robots, and sitemap exclusions");
console.log("All HTTP smoke checks passed.");

