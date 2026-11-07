import { spawn } from "node:child_process";
import path from "node:path";

const cwd = path.resolve(".next/standalone");
const server = spawn(process.execPath, [path.join(cwd, "server.js")], {
  cwd, stdio: "inherit", env: { ...process.env, HOSTNAME: process.env.HOSTNAME || "127.0.0.1" },
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.kill(signal));
server.on("error", (error) => { console.error(error); process.exitCode = 1; });
server.on("exit", (code) => { process.exitCode = code ?? 1; });
