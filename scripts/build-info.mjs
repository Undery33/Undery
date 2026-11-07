import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

function git(...args) {
  try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}
const commit = process.env.BUILD_COMMIT || git("rev-parse", "HEAD");
const branch = process.env.SOURCE_BRANCH || git("branch", "--show-current") || "detached";
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("BUILD_COMMIT must be a full commit SHA.");
await writeFile("build-info.json", JSON.stringify({ repository: "Undery33/Undery", commit, branch }) + "\n");
