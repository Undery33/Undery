import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoError } from "@/lib/birthday-memo-validation";
import { memoClientAddress } from "@/lib/birthday-memo-http";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), submit: vi.fn(), feed: vi.fn(), getStore: vi.fn() }));
vi.mock("@/lib/birthday-memo-store", () => ({ getBirthdayMemoStore: mocks.getStore }));
import { GET as prepare, HEAD as prepareHead } from "@/app/birthday/memo/prepare/route";
import { GET as submit, HEAD as submitHead } from "@/app/birthday/memo/submit/route";
import { GET as feed } from "@/app/birthday/memo/feed/route";

const token = "a".repeat(64);
const receipt = { ok: true, duplicate: false, entry: { id: "1", nickname: "친구", message: "생일 축하해요\r\n🎂", createdAt: "2026-11-14T01:00:00.000Z" } };
const submission = (nickname = receipt.entry.nickname, message = receipt.entry.message) => new Request(`https://undery.link/birthday/memo/submit?token=${token}&nickname=${encodeURIComponent(nickname)}&message=${encodeURIComponent(message)}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getStore.mockReturnValue(mocks);
  mocks.prepare.mockResolvedValue({ ok: true, token, expiresAt: "2026-11-14T01:10:00.000Z" });
  mocks.submit.mockResolvedValue(receipt);
  mocks.feed.mockResolvedValue({ ok: true, entries: [], page: 0, pageSize: 150, total: 0, totalPages: 0, hasMore: false, revision: "0", order: "oldest" });
});
afterEach(() => vi.unstubAllEnvs());

describe("birthday memo HTTP contract", () => {
  it("returns a no-cache token only from GET", async () => {
    const response = await prepare(new Request("https://undery.link/birthday/memo/prepare"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, token });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(prepareHead().status).toBe(405);
    expect(submitHead().status).toBe(405);
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("blocks blank nicknames without touching the database", async () => {
    const response = await submit(submission("\u00a0 \u200b"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "nickname_required" });
    expect(mocks.getStore).not.toHaveBeenCalled();
  });
  it("returns the exact stored receipt to Unity", async () => {
    const response = await submit(submission());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(receipt);
    expect(mocks.submit).toHaveBeenCalledWith(token, receipt.entry.nickname, receipt.entry.message, "shared");
  });
  it("does not let a prefetch consume a token", async () => {
    const response = await submit(new Request(submission(), { headers: { "sec-purpose": "prefetch;prerender" } }));
    expect(response.status).toBe(400);
    expect(mocks.getStore).not.toHaveBeenCalled();
  });
  it("accepts page and oldest order while refusing unknown parameters", async () => {
    expect((await feed(new Request("https://undery.link/birthday/memo/feed?page=2&order=oldest"))).status).toBe(200);
    expect(mocks.feed).toHaveBeenCalledWith(2, "oldest");
    expect((await feed(new Request("https://undery.link/birthday/memo/feed?page=2&order=random"))).status).toBe(400);
    expect((await feed(new Request("https://undery.link/birthday/memo/feed?page=2&sql=oops"))).status).toBe(400);
  });
  it("rejects invalid feed parameters even while storage is unavailable", async () => {
    mocks.getStore.mockImplementation(() => { throw new MemoError("storage_unavailable", 503, "연결 안 됨"); });
    expect((await feed(new Request("https://undery.link/birthday/memo/feed?page=2&order=random"))).status).toBe(400);
    expect(mocks.getStore).not.toHaveBeenCalled();
  });
  it("returns safe retry information without database details or URL contents", async () => {
    mocks.submit.mockRejectedValueOnce(new MemoError("rate_limited", 429, "잠시 후 다시 시도해 주세요."));
    const limited = await submit(submission());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.submit.mockRejectedValueOnce(new Error("postgres://private:secret@db/internal?token=secret"));
    const failed = await submit(submission());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");
    expect(log.mock.calls.flat().join(" ")).not.toContain("secret");
    log.mockRestore();
  });
});

describe("proxy boundary", () => {
  it("ignores untrusted forwarded IP headers by default", () => {
    vi.stubEnv("BIRTHDAY_MEMO_TRUST_PROXY", "false");
    expect(memoClientAddress(new Request("https://undery.link", { headers: { "x-forwarded-for": "1.2.3.4", "x-undery-client-ip": "1.2.3.4" } }))).toBe("shared");
  });
  it("only uses a valid dedicated header when private proxy trust is configured", () => {
    vi.stubEnv("BIRTHDAY_MEMO_TRUST_PROXY", "true");
    expect(memoClientAddress(new Request("https://undery.link", { headers: { "x-undery-client-ip": "2001:db8::1" } }))).toBe("2001:db8::1");
    expect(memoClientAddress(new Request("https://undery.link", { headers: { "x-undery-client-ip": "1.2.3.4, 5.6.7.8" } }))).toBe("shared");
  });
});
