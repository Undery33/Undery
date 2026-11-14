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
  const page = await read("/birthday/memo");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /방명록을 불러오지 못했어요/);
  for (const route of ["/birthday/memo/prepare", "/birthday/memo/feed?page=0&order=oldest"]) {
    const response = await read(route);
    assert.equal(response.status, 503, route);
    assert.equal(response.headers.get("location"), null, "The API must not redirect.");
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.deepEqual((await response.json()).ok, false);
  }
  const blank = await read(`/birthday/memo/submit?token=${"a".repeat(64)}&nickname=%E3%80%80&message=hello`);
  assert.equal(blank.status, 400);
  assert.equal((await blank.json()).error, "nickname_required");
  assert.equal((await read("/birthday/memo/prepare", "HEAD")).status, 405);
  assert.equal((await read("/birthday/memo/submit", "HEAD")).status, 405);
  assert.equal((await read("/birthday/memo/submit", "POST")).status, 405);
  assert.equal((await read("/birthday/memo/feed?page=0&order=invalid")).status, 400);
  console.log("PASS birthday subdirectory routes, no redirects/cache, blank nickname rejection, safe missing-DB failure and read-only HEAD/POST");
  console.log("PostgreSQL persistence is deliberately not covered by this HTTP check.");
} finally {
  if (server.exitCode === null) server.kill("SIGTERM");
  await exited;
}
