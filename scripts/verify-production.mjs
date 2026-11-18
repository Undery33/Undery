import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout } from "node:timers/promises";

// A temporary loopback-only server for automated HTTP tests, not a browser preview.
const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));

const baseUrl = `http://127.0.0.1:${port}`;
const cwd = path.resolve(process.env.RUNTIME_DIRECTORY || ".next/standalone");
const server = spawn(process.execPath, [path.join(cwd, "server.js")], {
  cwd,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port), NEXT_TELEMETRY_DISABLED: "1" },
});
let serverLog = "";
server.stdout.on("data", (data) => { serverLog += data; });
server.stderr.on("data", (data) => { serverLog += data; });
const serverExit = once(server, "exit");

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Production server exited early.\n${serverLog}`);
    try {
      ready = (await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })).ok;
    } catch { /* Wait for the production server to bind. */ }
    if (ready) break;
    await setTimeout(250);
  }
  if (!ready) throw new Error(`Production server did not become ready.\n${serverLog}`);
  const smoke = spawn(process.execPath, ["scripts/smoke-test.mjs"], {
    stdio: "inherit", env: { ...process.env, SMOKE_BASE_URL: baseUrl },
  });
  const [exitCode] = await once(smoke, "exit");
  if (exitCode !== 0) throw new Error(`HTTP smoke tests failed (${exitCode}).\n${serverLog}`);
} finally {
  if (server.exitCode === null) server.kill("SIGTERM");
  await serverExit;
}

