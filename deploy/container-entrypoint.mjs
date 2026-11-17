import { spawn } from "node:child_process";

// PID 1 owns both services: no orphaned Next process or healthy-looking Nginx
// after a child failure. Docker's normal stop signal is forwarded to both.
const children = new Set();
let stopping = false;
let exitCode = 0;
let killTimer;

function finishIfStopped() {
  if (stopping && children.size === 0) {
    clearTimeout(killTimer);
    process.exit(exitCode);
  }
}

function stop(code, signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) child.kill(signal);
  killTimer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 5000);
  killTimer.unref();
  finishIfStopped();
}

function start(name, command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  children.add(child);
  child.on("error", (error) => {
    console.error(`${name} failed to start:`, error.message);
    stop(1);
  });
  // close also fires after spawn errors, so every child leaves the set.
  child.on("close", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${name} exited (${signal || code}); stopping container`);
      stop(code || 1);
    }
    finishIfStopped();
  });
}

process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0, "SIGINT"));

start("Next.js", process.execPath, ["/opt/undery/main/server.js"], {
  cwd: "/opt/undery/main",
  env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: "3001" },
});
start("Nginx", "/usr/sbin/nginx", ["-g", "daemon off;"]);
