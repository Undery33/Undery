import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout } from "node:timers/promises";

// Actual production HTTP routing checks with database configuration deliberately
// removed. This proves fail-closed behavior, not successful database persistence.
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
const cwd = path.resolve(process.env.RUNTIME_DIRECTORY || ".next/standalone");
const environment = { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port), NEXT_TELEMETRY_DISABLED: "1" };
for (const name of Object.keys(environment)) if (name.startsWith("PG") || name.startsWith("BIRTHDAY_MEMO_") || name === "DATABASE_URL") delete environment[name];
const server = spawn(process.execPath, [path.join(cwd, "server.js")], { cwd, env: environment, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.resume();
server.stderr.resume();
const exited = once(server, "exit");
const origin = `http://127.0.0.1:${port}`;
const read = (route, method = "GET") => fetch(new URL(route, origin), { method, redirect: "manual", signal: AbortSignal.timeout(5000) });

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Temporary production server exited before the HTTP check.");
    try { ready = (await read("/api/health")).ok; } catch { /* Wait for loopback listener. */ }
    if (ready) break;
    await setTimeout(250);
  }
  assert.ok(ready, "Temporary production server must become ready.");
  for (const path of ["/birthday", "/birthday/memo", "/birthday/memo/feed", "/birthday/memo/submit", "/birthday/memo/admin"]) {
    assert.equal((await read(path)).status, 404, path);
  }
  const feed = await read("/api/vrchat/birthday/feed?page=0&order=oldest");
  assert.equal(feed.status, 503);
  assert.match(feed.headers.get("cache-control") || "", /no-store/);
  assert.equal((await feed.json()).ok, false);
  const managementPage = await read("/admin/messages");
  assert.equal(managementPage.status, 200);
  assert.match(await managementPage.text(), /메시지 관리/);
  const managementApi = await read("/admin/messages/entries");
  assert.equal(managementApi.status, 503);
  assert.equal((await managementApi.json()).error, "auth_unavailable");
  assert.equal((await read("/api/auth/github", "GET")).status, 405);
  assert.equal((await read("/api/auth/github", "POST")).status, 503);
  assert.equal((await read("/api/auth/github/callback", "HEAD")).status, 405);
  console.log("PASS retired birthday routes, read-only feed and protected management");
} finally {
  if (server.exitCode === null) server.kill("SIGTERM");
  await exited;
}
