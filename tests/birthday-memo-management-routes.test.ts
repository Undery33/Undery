import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoError } from "@/lib/birthday-memo-validation";

const mocks = vi.hoisted(() => ({ session: vi.fn(), mutation: vi.fn(), list: vi.fn(), mutate: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: mocks.session, requireAdminMutation: mocks.mutation }));
vi.mock("@/lib/birthday-memo-management", async importOriginal => ({ ...await importOriginal<object>(), getBirthdayMemoManagement: mocks.get }));
import { GET, POST } from "@/app/admin/messages/entries/route";

const endpoint = "https://undery.link/admin/messages/entries";
const post = (body: unknown, headers = { "Content-Type": "application/json" }) => new Request(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockReturnValue(mocks);
  mocks.session.mockResolvedValue({ githubUserId: "123" });
  mocks.mutation.mockResolvedValue({ githubUserId: "123" });
  mocks.list.mockResolvedValue({ ok: true, entries: [] });
  mocks.mutate.mockResolvedValue({ ok: true, entry: { id: "1" } });
});

describe("protected message management routes", () => {
  it("never reads messages without an authenticated session", async () => {
    mocks.session.mockRejectedValue(new MemoError("unauthorized", 401, "로그인이 필요합니다."));
    expect((await GET(new Request(endpoint))).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("never opens a mutation before permission and CSRF validation", async () => {
    mocks.mutation.mockRejectedValue(new MemoError("forbidden", 403, "허용되지 않은 요청입니다."));
    expect((await POST(post({ action: "trash", id: "1", version: "1" }))).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("binds actor identity to the server session and rejects payload overrides", async () => {
    const input = { action: "hide", id: "1", version: "3" };
    expect((await POST(post(input))).status).toBe(200);
    expect(mocks.mutate).toHaveBeenCalledWith(input, "123");
    mocks.mutate.mockClear();
    expect((await POST(post({ ...input, actorId: "other" }))).status).toBe(400);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("rejects non-JSON, oversized and malformed payloads", async () => {
    expect((await POST(post({}, { "Content-Type": "text/plain" }))).status).toBe(415);
    expect((await POST(post({ message: "x".repeat(17000) }))).status).toBe(413);
    expect((await POST(new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status).toBe(400);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("passes validated filters and returns no-store responses", async () => {
    const response = await GET(new Request(endpoint + "?page=2&status=hidden&q=hello"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.list).toHaveBeenCalledWith({ page: 2, status: "hidden", q: "hello" });
    expect((await GET(new Request(endpoint + "?q=x&q=y"))).status).toBe(400);
  });
  it("stops a stalled authenticated body without changing data", async () => {
    vi.useFakeTimers();
    try {
      const body = new ReadableStream<Uint8Array>({ start() { /* Deliberately never produces a body. */ } });
      const pending = POST(new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, duplex: "half" } as RequestInit & { duplex: "half" }));
      await vi.advanceTimersByTimeAsync(10001);
      expect((await pending).status).toBe(408);
      expect(mocks.mutate).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("keeps conflict details safe and never exposes database errors", async () => {
    mocks.mutate.mockRejectedValueOnce(new MemoError("version_conflict", 409, "다시 확인해 주세요."));
    expect((await POST(post({ action: "trash", id: "1", version: "1" }))).status).toBe(409);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.list.mockRejectedValue(new Error("private database password and message"));
    const response = await GET(new Request(endpoint));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("password");
    expect(log.mock.calls.flat().join(" ")).not.toContain("password");
    log.mockRestore();
  });
});
