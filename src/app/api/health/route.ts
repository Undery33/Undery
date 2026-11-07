import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  try {
    const info = JSON.parse(await readFile(path.join(process.cwd(), "build-info.json"), "utf8"));
    if (info.repository !== "Undery33/Undery" || !/^[a-f0-9]{40}$/.test(info.commit) || typeof info.branch !== "string") {
      throw new Error("Invalid build metadata");
    }
    return Response.json({ status: "ok", repository: info.repository, commit: info.commit, branch: info.branch }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
