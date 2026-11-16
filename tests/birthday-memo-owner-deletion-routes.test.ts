import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoError } from "@/lib/birthday-memo-validation";

const mocked = vi.hoisted(() => ({ trash: vi.fn(), store: vi.fn() }));
vi.mock("@/lib/birthday-memo-store", () => ({ getBirthdayMemoStore: mocked.store }));
import { GET, HEAD } from "@/app/birthday/memo/delete/route";
const input = { entryId: "12", token: "a".repeat(64), requestId: "b".repeat(32), confirm: "trash" };
const url = () => `https://undery.link/birthday/memo/delete?${new URLSearchParams(input)}`;
const receipt = { ok: true, duplicate: false, entryId: "12", status: "deleted", moderationRevision: "7" };

beforeEach(() => {
  vi.resetAllMocks();
  mocked.store.mockReturnValue({ trashOwnEntry: mocked.trash });
  mocked.trash.mockResolvedValue(receipt);
  vi.stubEnv("BIRTHDAY_MEMO_TRUST_PROXY", "false");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("owner deletion route", () => {
  it("returns only the current deletion receipt with private response headers", async () => {
    const response = await GET(new Request(url()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(receipt);
    expect(mocked.trash).toHaveBeenCalledExactlyOnceWith(input, "shared");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });
  it.each(["hidden", "visible"])("does not replace duplicate current status %s with a historical deleted status", async status => {
    mocked.trash.mockResolvedValue({ ...receipt, status, duplicate: true, moderationRevision: "9" });
    expect(await (await GET(new Request(url()))).json()).toEqual({ ...receipt, status, duplicate: true, moderationRevision: "9" });
  });
  it.each(["entryId", "token", "requestId", "confirm"])("requires %s before accessing storage", async key => {
    const requestUrl = new URL(url()); requestUrl.searchParams.delete(key);
    expect((await GET(new Request(requestUrl))).status).toBe(400);
    expect(mocked.store).not.toHaveBeenCalled();
  });
  it.each(["&token=other", "&entryId=13", "&nickname=owner", "&actorId=123", "&token=%FF", "&requestId=1"])("rejects unexpected, duplicate or invalid query %s", async extra => {
    expect((await GET(new Request(url() + extra))).status).toBe(400);
    expect(mocked.store).not.toHaveBeenCalled();
  });
  it.each([["purpose", "prefetch"], ["sec-purpose", "prefetch;prerender"], ["purpose", "prerender"]])("rejects speculative navigation %s: %s", async (header, value) => {
    expect((await GET(new Request(url(), { headers: { [header]: value } }))).status).toBe(400);
    expect(mocked.store).not.toHaveBeenCalled();
  });
  it("rejects HEAD without calling the mutation", async () => {
    const response = HEAD();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.text()).toBe("");
    expect(mocked.store).not.toHaveBeenCalled();
  });
  it("returns an ownership denial without exposing the secret or request URL", async () => {
    mocked.trash.mockRejectedValue(new MemoError("delete_forbidden", 403, "삭제 권한을 확인할 수 없습니다."));
    const response = await GET(new Request(url()));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "delete_forbidden", message: "삭제 권한을 확인할 수 없습니다." });
  });
  it("returns retry advice for the shared database rate limit", async () => {
    mocked.trash.mockRejectedValue(new MemoError("rate_limited", 429, "잠시 후 다시 시도해 주세요."));
    const response = await GET(new Request(url()));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
  it("sanitizes storage exceptions in both response and log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocked.trash.mockRejectedValue(new Error(`query ${url()} failed with private credentials`));
    const response = await GET(new Request(url()));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain(input.token);
    expect(body).not.toContain("private credentials");
    expect(JSON.stringify(log.mock.calls)).not.toContain(input.token);
    expect(log).toHaveBeenCalledExactlyOnceWith("Birthday memo request failed; check database availability and migration.");
  });
});
