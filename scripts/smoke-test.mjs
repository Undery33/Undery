import assert from "node:assert/strict";

const base = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const origin = new URL(base);
if (!["http:", "https:"].includes(origin.protocol)) throw new Error("SMOKE_BASE_URL must be HTTP(S).");
const adminEnabled = process.env.SMOKE_ADMIN_ENABLED === "true";
if (process.env.SMOKE_ADMIN_ENABLED && !["true", "false"].includes(process.env.SMOKE_ADMIN_ENABLED)) {
  throw new Error("SMOKE_ADMIN_ENABLED must be true or false.");
}

async function read(path, options) {
  const headers = new Headers(options?.headers);
  headers.set("User-Agent", "Discordbot/2.0 (+https://discordapp.com)");
  const response = await fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(15000), ...options, headers });
  const html = await response.text();
  if (response.headers.get("content-type")?.includes("text/html")) {
    assert.doesNotMatch(html, /<meta\b[^>]*\s(?:name|property|itemprop)\s*=\s*["'](?:description|og:description|twitter:description)["']/i,
      "Discord preview descriptions must be absent at " + path);
  }
  return { response, html };
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

for (const path of ["/", "/posts", "/computer", "/computer/getting-started", "/computer/vlan", "/computer/routing", "/computer/dns", "/computer/dhcp", "/vrchat", "/valorant"]) {
  const { response, html } = await read(path);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", path);
  assert.match(html, /lang="ko"/, path);
  assert.doesNotMatch(html, /href="\/portfolio(?:\/|"|\?)/, `Portfolio must not be linked at ${path}`);
  console.log(`PASS ${path}`);
}

for (const path of ["/birthday", "/birthday/memo", "/birthday/memo/admin", "/birthday/memo/submit"]) {
  assert.equal((await read(path)).response.status, 404, path);
}
for (const [path, title] of [["/vrchat/birthday", "THANK YOU"], ["/vrchat/birthday/photos", "PHOTO ZONE"], ["/vrchat/birthday/messages", "MASSAGE"]]) {
  const page = await read(path);
  assert.equal(page.response.status, 200, path);
  assert.ok(page.html.includes(title), path);
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

const computer = await read("/computer");
for (const category of ["router", "switch", "asa", "server", "linux", "windows-server"]) {
  const anchor = category === "linux" ? "#computer-screen" : "";
  assert.ok(computer.html.includes(`href="/computer?category=${category}${anchor}"`), category);
}
assert.doesNotMatch(computer.html, /href="\/computer(?:\/cnn|\?category=ai)"/);
const linux = await read("/computer?category=linux");
assert.equal(linux.response.status, 200);
assert.match(linux.html, /data-topology-view="linux"/);
for (const diagram of ["kubernetes", "jenkins", "docker"]) {
  assert.match(linux.html, new RegExp(`<svg\\b(?=[^>]*data-architecture="${diagram}")(?=[^>]*role="img")`), diagram);
}
const switchSearch = await read("/computer?category=switch&q=" + encodeURIComponent("트렁크") + "&tag=VLAN");
assert.match(switchSearch.html, /href="\/computer\/vlan"/);
assert.doesNotMatch(switchSearch.html, /href="\/computer\/(?:getting-started|development-workflow)"/);
assert.match(switchSearch.html, /name="category" value="switch"/);
assert.match(switchSearch.html, /name="tag" value="VLAN"/);
const serverSearch = await read("/computer?category=server&q=VLAN&tag=VLAN");
assert.match(serverSearch.html, /조건에 맞는 글이 없습니다/);
for (const slug of ["vlan", "routing", "dns", "dhcp"]) {
  const technology = await read(`/computer/${slug}`);
  assert.ok(technology.html.includes(`data-technology-demo="${slug}"`), slug);
  assert.ok(!technology.html.includes(`<!-- demo:${slug} -->`), slug);
  assert.match(technology.html, /aria-label="화면 테마"/);
}
console.log("PASS six computer categories, combined category search and four technology examples");

const routingSearch = await read("/computer?category=router&q=OSPF");
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
    assert.equal(response.headers.get("location"), new URL("/admin/messages", process.env.SITE_URL || "https://undery.link").href);
  }
  assert.equal(response.headers.get("cache-control"), "no-store", path);
  assert.doesNotMatch(html, /<form/, path);
  assert.equal((await read(path, { method: "POST" })).response.status, 405, `${path} POST`);
}
const adminPage = await read("/admin/messages");
assert.equal(adminPage.response.status, 200);
assert.match(adminPage.response.headers.get("cache-control") || "", /no-store/);
if (adminEnabled) assert.match(adminPage.html, /GitHub/);
const adminEntries = await read("/admin/messages/entries");
assert.equal(adminEntries.response.status, adminEnabled ? 401 : 503);
assert.equal(JSON.parse(adminEntries.html).error, adminEnabled ? "login_required" : "auth_unavailable");
console.log("PASS expected admin login state and rejected unauthenticated access");

for (const path of ["/missing-page", "/posts/not-a-real-post", "/computer/not-a-real-post", "/computer/ip-basics", "/computer/cnn"]) {
  assert.equal((await read(path)).response.status, 404, path);
}
const sitemap = await read("/sitemap.xml");
assert.equal(sitemap.response.status, 200);
assert.doesNotMatch(sitemap.html, /\/portfolio|\/admin/);
assert.doesNotMatch(sitemap.html, /\/computer\/(?:ip-basics|cnn)</);
assert.equal((await read("/robots.txt")).response.status, 200);
console.log("PASS 404, robots, and sitemap exclusions");
console.log("All HTTP smoke checks passed.");

