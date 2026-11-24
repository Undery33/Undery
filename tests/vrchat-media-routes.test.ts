import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoError } from "@/lib/birthday-memo-validation";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), getStore: vi.fn(), list: vi.fn(), upload: vi.fn(), removePhoto: vi.fn(), file: vi.fn(), dir: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminMutation: mocks.guard }));
vi.mock("@/lib/vrchat-media-store", () => ({ getGalleryStore: mocks.getStore, mediaDirectory: mocks.dir }));
import { DELETE, GET, POST } from "@/app/api/vrchat/media/route";
import { GET as getFile, HEAD as headFile } from "@/app/api/vrchat/media/files/[id]/[variant]/route";

const endpoint = "https://undery.link/api/vrchat/media";
const post = () => new Request(endpoint, { method: "POST", body: "body" });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getStore.mockReturnValue(mocks);
});

it("allows public listing and reports unavailable storage as a retriable failure", async () => {
  mocks.list.mockResolvedValue([{ id: "sunset" }]);
  expect(await (await GET()).json()).toEqual([{ id: "sunset" }]);
  expect(mocks.guard).not.toHaveBeenCalled();
  mocks.list.mockRejectedValue(new Error("private database details"));
  const failed = await GET();
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("private database details");
});

it.each([401,403])("does not consume the upload or touch storage when the admin guard rejects (%s)", async status => {
  mocks.guard.mockRejectedValue(new MemoError("unauthorized", status, "요청이 허용되지 않았습니다."));
  const request = post();
  expect((await POST(request)).status).toBe(status);
  expect(request.bodyUsed).toBe(false);
  expect(mocks.getStore).not.toHaveBeenCalled();
});

it("bounds concurrent uploads and releases the worker for retries", async () => {
  let finish!: () => void;
  const active = new Promise<void>(resolve => { finish = resolve; });
  mocks.upload.mockImplementationOnce(async () => { await active; return { item: { id: "one" }, created: true }; });
  const first = POST(post());
  await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
  expect((await POST(post())).status).toBe(429);
  finish();
  expect((await first).status).toBe(201);
  mocks.upload.mockResolvedValueOnce({ item: { id: "one" }, created: false });
  expect((await POST(post())).status).toBe(200);
});

it("requires the admin guard and one photo ID before removing a photo", async () => {
  const remove = (query: string) => DELETE(new Request(endpoint + query, { method: "DELETE" }));
  mocks.guard.mockRejectedValueOnce(new MemoError("invalid_csrf", 403, "요청이 허용되지 않았습니다."));
  expect((await remove("?id=sunset")).status).toBe(403);
  expect(mocks.getStore).not.toHaveBeenCalled();
  expect((await remove("?id=sunset&id=portrait")).status).toBe(400);
  expect((await remove("")).status).toBe(400);
  expect(mocks.removePhoto).not.toHaveBeenCalled();
  expect((await remove("?id=sunset")).status).toBe(200);
  expect(mocks.removePhoto).toHaveBeenCalledWith("sunset");
});

it("serves exact byte ranges and HEAD with the saved type; unknown or uncommitted files are unreachable", async () => {
  const id = "12345678-1234-4cde-a123-123456789abc";
  const context = { params: Promise.resolve({ id, variant: "original" }) };
  const dir = await mkdtemp(join(tmpdir(), "vrchat-range-test-"));
  try {
    await mkdir(join(dir, id));
    await writeFile(join(dir, id, "original"), Buffer.from("0123456789"));
    mocks.dir.mockReturnValue(dir);
    mocks.file.mockResolvedValue({ mime: "video/mp4" });
    const section = await getFile(new Request(endpoint, { headers: { Range: "bytes=2-5" } }), context);
    expect(section.status).toBe(206);
    expect(section.headers.get("content-type")).toBe("video/mp4");
    expect(section.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await section.text()).toBe("2345");
    const head = await headFile(new Request(endpoint, { method: "HEAD" }), context);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("10");
    expect(head.body).toBeNull();
    const outOfBounds = await getFile(new Request(endpoint, { headers: { Range: "bytes=10-" } }), context);
    expect(outOfBounds.status).toBe(416);
    expect(outOfBounds.headers.get("content-range")).toBe("bytes */10");
    mocks.file.mockResolvedValue(undefined);
    expect((await getFile(new Request(endpoint), context)).status).toBe(404);
    expect((await getFile(new Request(endpoint), { params: Promise.resolve({ id, variant: "../secret" }) })).status).toBe(404);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
