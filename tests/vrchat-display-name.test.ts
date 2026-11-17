import { afterEach, describe, expect, it, vi } from "vitest";
import { requireExactDisplayName } from "@/lib/vrchat-display-name";
import { parseWebMemo } from "@/lib/birthday-memo-validation";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("VRChat display name lookup", () => {
  it("compares the complete display name, preserving spaces, case and Unicode", async () => {
    vi.stubEnv("VRCHAT_SERVICE_AUTH", "test-only");
    const fetcher = vi.fn(async () => Response.json([{ displayName: "Ab 별☆" }, { displayName: "Ab 별☆1" }]));
    vi.stubGlobal("fetch", fetcher);
    await expect(requireExactDisplayName("Ab 별☆")).resolves.toBeUndefined();
    for (const name of ["Ab 별", "ab 별☆", "Ab별☆", "Ab 별☆ "]) {
      await expect(requireExactDisplayName(name)).rejects.toMatchObject({ status: 422 });
    }
  });

  it("checks later results and only contacts the fixed VRChat search endpoint", async () => {
    vi.stubEnv("VRCHAT_SERVICE_AUTH", "test-only");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(Array.from({ length: 100 }, () => ({ displayName: "similar" }))))
      .mockResolvedValueOnce(Response.json([{ displayName: "A & B" }]));
    vi.stubGlobal("fetch", fetcher);
    await requireExactDisplayName("A & B");
    const [url, options] = fetcher.mock.lastCall!;
    expect(url.origin + url.pathname).toBe("https://api.vrchat.cloud/api/1/users");
    expect(url.searchParams.get("search")).toBe("A & B");
    expect(url.searchParams.get("offset")).toBe("100");
    expect(options).toMatchObject({ redirect: "error", headers: { Cookie: "auth=test-only" } });
  });

  it("keeps unavailable lookup and no match distinct", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json([{}])).mockRejectedValueOnce(new Error("timeout"));
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("VRCHAT_SERVICE_AUTH", "");
    await expect(requireExactDisplayName("Undery")).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("VRCHAT_SERVICE_AUTH", "test-only");
    for (let n = 0; n < 3; n++) await expect(requireExactDisplayName("Undery")).rejects.toMatchObject({ status: 503 });
  });

  it("pauses searches after an upstream rate limit", async () => {
    vi.stubEnv("VRCHAT_SERVICE_AUTH", "test-only");
    const fetcher = vi.fn(async () => new Response(null, { status: 429, headers: { "Retry-After": "60" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(requireExactDisplayName("Undery")).rejects.toMatchObject({ status: 429 });
    await expect(requireExactDisplayName("다른 이름")).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it("rejects blank web messages and malformed request IDs before searching", () => {
  const input = { nickname: "별", message: "축하해!", requestId: crypto.randomUUID() };
  expect(parseWebMemo(input)).toEqual(input);
  expect(() => parseWebMemo({ ...input, message: "  \u200b" })).toThrow();
  expect(() => parseWebMemo({ ...input, requestId: "bad" })).toThrow();
});
