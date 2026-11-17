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

for (const path of ["/", "/computer", "/computer/getting-started", "/computer/vlan", "/computer/routing", "/computer/dns", "/computer/dhcp", "/computer/cnn", "/vrchat", "/valorant"]) {
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
assert.match(birthday.html, /<a\b[^>]*href="\/birthday\/memo"[^>]*>\s*<span\b[^>]*>축하 메시지<\/span>\s*<\/a>/);
const worldLink = birthday.html.match(/<a\b[^>]*href="https:\/\/vrchat\.com\/home\/world\/wrld_59673787-ac01-41bb-8d81-568a17ca6993\/info"[^>]*>/);
assert.ok(worldLink, "The poster must link to the birthday world");
assert.match(worldLink[0], /aria-label="VRChat 월드 구경하기"/);
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

const network = await read("/computer?category=network&q=" + encodeURIComponent("트렁크") + "&tag=VLAN");
assert.match(network.html, /href="\/computer\/vlan"/);
assert.doesNotMatch(network.html, /href="\/computer\/(?:getting-started|development-workflow)"/);
assert.match(network.html, /name="category" value="network"/);
assert.match(network.html, /name="tag" value="VLAN"/);
const serverSearch = await read("/computer?category=server&q=VLAN&tag=VLAN");
assert.match(serverSearch.html, /조건에 맞는 글이 없습니다/);
for (const slug of ["vlan", "routing", "dns", "dhcp", "cnn"]) {
  const technology = await read(`/computer/${slug}`);
  assert.ok(technology.html.includes(`data-technology-demo="${slug}"`), slug);
  assert.ok(!technology.html.includes(`<!-- demo:${slug} -->`), slug);
  assert.match(technology.html, /aria-label="화면 테마"/);
}
console.log("PASS combined category search and five technology examples");

const routingSearch = await read("/computer?category=network&q=OSPF");
assert.match(routingSearch.html, /href="\/computer\/routing"/);
const routingLab = await read("/computer/routing");
for (const name of ["정적 실습", "RIP 실습", "OSPF 실습", "EIGRP 실습", "IS-IS 실습", "BGP 실습", "PBR 실습"]) {
  assert.ok(routingLab.html.includes(`aria-label="${name}"`), name);
}
assert.match(routingLab.html, /라우팅 실습 화면 선택/);
console.log("PASS Cisco routing catalogue search and seven interactive methods");

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

for (const path of ["/missing-page", "/computer/not-a-real-post", "/computer/ip-basics"]) {
  assert.equal((await read(path)).response.status, 404, path);
}
const sitemap = await read("/sitemap.xml");
assert.equal(sitemap.response.status, 200);
assert.doesNotMatch(sitemap.html, /\/portfolio|\/admin/);
assert.doesNotMatch(sitemap.html, /\/computer\/ip-basics/);
assert.equal((await read("/robots.txt")).response.status, 200);
console.log("PASS 404, robots, and sitemap exclusions");
console.log("All HTTP smoke checks passed.");

