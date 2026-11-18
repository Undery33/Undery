import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPost, getPosts } from "@/lib/posts";

describe("general Markdown posts", () => {
  let root: string;
  let posts: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "undery-posts-"));
    posts = path.join(root, "content", "posts");
    vi.spyOn(process, "cwd").mockReturnValue(root);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  async function writePost(slug: string, date: string, fields = "", body = "일반 게시글 본문") {
    await mkdir(posts, { recursive: true });
    const source = `---\ntitle: "제목"\npublishedAt: "${date}"\n${fields}\n---\n${body}\n`;
    await writeFile(path.join(posts, `${slug}.md`), source);
  }

  it("returns an empty board for a missing or empty directory, independently of computer articles", async () => {
    const computer = path.join(root, "content", "computer");
    await mkdir(computer, { recursive: true });
    await writeFile(path.join(computer, "vlan.md"), "a technical article");
    expect(await getPosts()).toEqual([]);
    expect(await getPost("vlan")).toBeUndefined();
    await mkdir(posts);
    expect(await getPosts()).toEqual([]);
  });

  it("serves published general posts newest first with stable slug ties and hides drafts from detail", async () => {
    await writePost("older", "2024-02-29");
    await writePost("b-note", "2026-11-18");
    await writePost("a-note", "2026-11-18", 'category: "공연 후기"\ndescription: "요약"\ntags: ["무대", "무대"]');
    await writePost("hidden", "2026-11-19", "draft: true");
    expect((await getPosts()).map((post) => post.slug)).toEqual(["a-note", "b-note", "older"]);
    expect(await getPost("a-note")).toMatchObject({
      title: "제목", category: "공연 후기", description: "요약", tags: ["무대"], body: "일반 게시글 본문",
    });
    expect(await getPost("older")).toMatchObject({ category: "일반", description: "", tags: [] });
    expect(await getPost("hidden")).toBeUndefined();
    expect(await getPost("unknown")).toBeUndefined();
  });

  it("rejects unsafe lookup slugs and invalid filenames", async () => {
    await writePost("Wrong_Name", "2026-11-18");
    for (const slug of ["../computer/vlan", "post/file", "Bad_Name", ""]) {
      expect(await getPost(slug)).toBeUndefined();
    }
    await expect(getPosts()).rejects.toThrow("Invalid post slug");
  });

  it("rejects invalid calendar dates, empty categories, empty bodies and non-boolean drafts", async () => {
    await writePost("post", "2025-02-29");
    await expect(getPosts()).rejects.toThrow("publishedAt");
    await writePost("post", "2026-11-18", 'category: "  "');
    await expect(getPosts()).rejects.toThrow("category");
    await writePost("post", "2026-11-18", "", "   ");
    await expect(getPosts()).rejects.toThrow("body");
    await writePost("post", "2026-11-18", 'draft: "true"');
    await expect(getPosts()).rejects.toThrow("draft");
  });
});
