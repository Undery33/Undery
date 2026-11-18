import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ store: vi.fn(), pool: vi.fn() }));
vi.mock("@/lib/birthday-memo-store", () => ({ getBirthdayMemoStore: mocked.store, getBirthdayMemoPool: mocked.pool }));
import { GET, HEAD } from "@/app/birthday/memo/delete/route";
const denied = { ok: false, error: "owner_deletion_disabled", message: "메시지는 등록만 가능합니다." };

beforeEach(() => {
  vi.resetAllMocks();
  mocked.store.mockImplementation(() => { throw new Error("Disabled endpoint must not access the store"); });
  mocked.pool.mockImplementation(() => { throw new Error("Disabled endpoint must not access the database"); });
});

describe("disabled owner deletion route", () => {
  it("rejects deletion without opening storage and preserves private response headers", async () => {
    const response = GET();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(denied);
    expect(mocked.store).not.toHaveBeenCalled();
    expect(mocked.pool).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });
  it("rejects HEAD without calling the mutation", async () => {
    const response = HEAD();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.text()).toBe("");
    expect(mocked.store).not.toHaveBeenCalled();
    expect(mocked.pool).not.toHaveBeenCalled();
  });
});
