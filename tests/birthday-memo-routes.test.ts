import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoError } from "@/lib/birthday-memo-validation";
import { memoClientAddress } from "@/lib/birthday-memo-http";

const mocks = vi.hoisted(() => ({ feed: vi.fn(), getStore: vi.fn() }));
vi.mock("@/lib/birthday-memo-store", () => ({ getBirthdayMemoStore: mocks.getStore }));
import { GET as feed } from "@/app/api/vrchat/birthday/feed/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getStore.mockReturnValue(mocks);
  mocks.feed.mockResolvedValue({ ok: true, entries: [], page: 0, pageSize: 150, total: 0, totalPages: 0, hasMore: false, revision: "0", order: "oldest" });
});
afterEach(() => vi.unstubAllEnvs());

describe("birthday memo HTTP contract", () => {
  it("accepts page and oldest order while refusing unknown parameters", async () => {
    expect((await feed(new Request("https://undery.link/api/vrchat/birthday/feed?page=2&order=oldest"))).status).toBe(200);
    expect(mocks.feed).toHaveBeenCalledWith(2, "oldest");
    expect((await feed(new Request("https://undery.link/api/vrchat/birthday/feed?page=2&order=random"))).status).toBe(400);
    expect((await feed(new Request("https://undery.link/api/vrchat/birthday/feed?page=2&sql=oops"))).status).toBe(400);
  });
  it("rejects invalid feed parameters even while storage is unavailable", async () => {
    mocks.getStore.mockImplementation(() => { throw new MemoError("storage_unavailable", 503, "연결 안 됨"); });
    expect((await feed(new Request("https://undery.link/api/vrchat/birthday/feed?page=2&order=random"))).status).toBe(400);
    expect(mocks.getStore).not.toHaveBeenCalled();
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
