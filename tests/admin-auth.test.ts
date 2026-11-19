import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), transaction: vi.fn(), release: vi.fn() }));
vi.mock("@/lib/birthday-memo-store", () => ({ getBirthdayMemoPool: () => database }));
import { authConfigEnabled, getAdminAuthConfig, getAdminSession, matchesAdminToken, requireAdminMutation, requireAdminSession, verifyGitHubOwner } from "@/lib/admin-auth";
import { POST as login, GET as loginGet, HEAD as loginHead } from "@/app/api/auth/github/route";
import { GET as callback, HEAD as callbackHead } from "@/app/api/auth/github/callback/route";
import { POST as logout, GET as logoutGet } from "@/app/api/auth/logout/route";
import { GET as legacyAdmin } from "@/app/admin/[[...path]]/route";

const origin = "https://undery.link";
const sessionToken = "s".repeat(43), csrfToken = "c".repeat(43);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const session = () => ({ tokenHash: digest(sessionToken), githubUserId: "12345", csrfToken,
  createdAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 3600000) });
const headers = (values: Record<string, string | undefined> = {}) => {
  const result = new Headers({ origin, "sec-fetch-site": "same-origin", cookie: `__Host-undery-session=${sessionToken}` });
  for (const [name, value] of Object.entries(values)) if (value !== undefined) result.set(name, value);
  return result;
};
const json = (value: unknown) => Response.json(value);
const loginRequest = (extra: Record<string, string> = {}) => new Request(`${origin}/api/auth/github`, { method: "POST", headers: headers(extra) });
const provider = vi.fn();
let attempt: { stateHash: string; browserHash: string; verifier: string; expired?: boolean } | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ["BIRTHDAY_MEMO_DATABASE_URL", "DATABASE_URL", "PGHOST", "PGDATABASE", "PGUSER", "BIRTHDAY_MEMO_ENABLED", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "ADMIN_GITHUB_ID", "SITE_URL", "BIRTHDAY_MEMO_TRUST_PROXY"]) vi.stubEnv(key, "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "postgresql://test-only@localhost/test");
  vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("ADMIN_GITHUB_ID", "12345");
  vi.stubEnv("SITE_URL", origin);
  attempt = undefined;
  database.query.mockImplementation(async (sql: string, values: string[] = []) => {
    if (sql.includes("INSERT INTO birthday_memo.rate_limits")) return { rows: [{ hits: 1 }], rowCount: 1 };
    if (sql.includes('INSERT INTO public."AdminLoginAttempt"')) {
      attempt = { stateHash: values[0], browserHash: values[1], verifier: values[2] };
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('DELETE FROM public."AdminLoginAttempt"') && sql.includes("RETURNING verifier")) {
      if (!attempt || attempt.expired || attempt.stateHash !== values[0] || attempt.browserHash !== values[1]) return { rows: [], rowCount: 0 };
      const saved = attempt;
      attempt = undefined;
      return { rows: [{ verifier: saved.verifier }], rowCount: 1 };
    }
    if (sql.includes('FROM public."AdminSession"') && sql.trim().startsWith("SELECT")) return { rows: [session()], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  database.connect.mockResolvedValue({ query: database.transaction, release: database.release });
  database.transaction.mockResolvedValue({ rows: [], rowCount: 1 });
  provider.mockImplementation(async (url: string) => url === "https://github.com/login/oauth/access_token"
    ? json({ access_token: "temporary-provider-token", token_type: "bearer" }) : json({ id: 12345 }));
  vi.stubGlobal("fetch", provider);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function startedLogin() {
  const response = await login(loginRequest());
  const destination = new URL(response.headers.get("location")!);
  const cookie = response.headers.getSetCookie()[0].split(";")[0];
  return { response, destination, cookie, state: destination.searchParams.get("state")! };
}
function callbackRequest(state: string, cookie: string, extra = "") {
  return new Request(`${origin}/api/auth/github/callback?state=${state}&code=test-authorization-code${extra}`, { headers: { cookie } });
}

describe("existing administrator authentication configuration", () => {
  it("reuses existing GitHub settings and accepts the configured shared PG pool", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PGHOST", "db"); vi.stubEnv("PGDATABASE", "undery"); vi.stubEnv("PGUSER", "undery");
    expect(authConfigEnabled()).toBe(true);
    expect(getAdminAuthConfig()).toMatchObject({ origin, ownerId: "12345", secure: true });
  });
  it.each(["http://undery.link", "https://user:password@undery.link", "https://undery.link/path", "https://undery.link/?x=1", "https://undery.link/#x"])("fails closed for unsafe public origin %s", value => {
    vi.stubEnv("SITE_URL", value);
    expect(authConfigEnabled()).toBe(false);
  });
  it("does not enable a login when the owner or OAuth credential is missing", async () => {
    vi.stubEnv("ADMIN_GITHUB_ID", "");
    expect((await login(loginRequest())).status).toBe(503);
    expect(database.query).not.toHaveBeenCalled();
    expect(legacyAdmin(new Request(`${origin}/admin`)).status).toBe(503);
  });
  it("only redirects the known legacy admin entry when enabled", () => {
    expect(legacyAdmin(new Request(`${origin}/admin`)).headers.get("location")).toBe(`${origin}/birthday/memo/admin`);
    expect(legacyAdmin(new Request(`${origin}/admin/photos`)).status).toBe(503);
  });
});

describe("session and administrator permission boundary", () => {
  it("validates the existing session cookie and hashed token against the configured owner", async () => {
    expect(await requireAdminSession(headers())).toMatchObject({ githubUserId: "12345", csrfToken });
    expect(database.query.mock.calls[0][1]).toEqual([digest(sessionToken), "12345"]);
    expect(database.query.mock.calls[0][0]).toContain('"expiresAt" > (now() AT TIME ZONE');
  });
  it.each(["", "__Host-undery-session=bad", `undery-session=${sessionToken}`, `__Host-undery-session=${sessionToken}; __Host-undery-session=${sessionToken}`])("rejects missing, invalid, insecure, or duplicate cookies", async value => {
    expect(await getAdminSession(new Headers({ cookie: value }))).toBeNull();
    expect(database.query).not.toHaveBeenCalled();
  });
  it("rejects expired sessions and sessions for another GitHub account", async () => {
    database.query.mockResolvedValueOnce({ rows: [{ ...session(), expiresAt: new Date(Date.now() - 1) }] });
    await expect(requireAdminSession(headers())).rejects.toMatchObject({ status: 401 });
    database.query.mockResolvedValueOnce({ rows: [{ ...session(), githubUserId: "99999" }] });
    await expect(requireAdminSession(headers())).rejects.toMatchObject({ status: 401 });
  });
  it.each([{ origin: "https://evil.example" }, { origin: "" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }])("rejects cross-origin mutation before session lookup", async extra => {
    await expect(requireAdminMutation(new Request(`${origin}/birthday/memo/admin/api`, { method: "POST", headers: headers({ "x-csrf-token": csrfToken, ...extra }) }))).rejects.toMatchObject({ status: 403 });
    expect(database.query).not.toHaveBeenCalled();
  });
  it("requires the session-specific CSRF token even for the owner", async () => {
    await expect(requireAdminMutation(new Request(`${origin}/birthday/memo/admin/api`, { method: "POST", headers: headers() }))).rejects.toMatchObject({ status: 403 });
    await expect(requireAdminMutation(new Request(`${origin}/birthday/memo/admin/api`, { method: "POST", headers: headers({ "x-csrf-token": "z".repeat(43) }) }))).rejects.toMatchObject({ status: 403 });
    expect(await requireAdminMutation(new Request(`${origin}/birthday/memo/admin/api`, { method: "POST", headers: headers({ "x-csrf-token": csrfToken }) }))).toMatchObject({ githubUserId: "12345" });
    expect(matchesAdminToken("한".repeat(43), csrfToken)).toBe(false);
  });
});

describe("GitHub state, browser binding, and PKCE flow", () => {
  it("returns to the originating VRChat admin page after owner login", async () => {
    const start = await login(new Request(origin + "/api/auth/github?section=vrchat", { method: "POST", headers: headers() }));
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const cookie = start.headers.getSetCookie()[0].split(";")[0];
    const changed = await callback(callbackRequest(state.replace("vrchat.", ""), cookie));
    expect(changed.headers.get("location")).toContain("?error=login");
    expect(provider).not.toHaveBeenCalled();
    const done = await callback(callbackRequest(state, cookie));
    expect(done.headers.get("location")).toBe(origin + "/vrchat/admin");
    expect(done.headers.getSetCookie().some(value => value.startsWith("__Host-undery-session="))).toBe(true);
  });
  it("uses POST login and secure browser cookie with state and S256 PKCE", async () => {
    const { response, destination, state } = await startedLogin();
    expect(response.status).toBe(303);
    expect(destination.origin).toBe("https://github.com");
    expect(destination.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/github/callback`);
    expect(destination.searchParams.get("code_challenge_method")).toBe("S256");
    expect(destination.searchParams.get("code_challenge")).toBe(createHash("sha256").update(attempt!.verifier).digest("base64url"));
    expect(attempt!.stateHash).toBe(digest(state));
    expect(response.headers.getSetCookie()[0]).toMatch(/^__Host-undery-login=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(loginGet().status).toBe(405); expect(loginHead().status).toBe(405); expect(callbackHead().status).toBe(405);
  });
  it("does not create login attempts for cross-site requests or exceeded rate limits", async () => {
    expect((await login(loginRequest({ origin: "https://evil.example" }))).status).toBe(403);
    expect(database.query).not.toHaveBeenCalled();
    database.query.mockResolvedValueOnce({ rows: [{ hits: 11 }] });
    const limited = await login(loginRequest());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(attempt).toBeUndefined();
  });
  it("will not consume another browser's attempt or call GitHub", async () => {
    const { state, cookie } = await startedLogin();
    const rejected = await callback(callbackRequest(state, `__Host-undery-login=${"w".repeat(43)}`));
    expect(rejected.headers.get("location")).toContain("?error=login");
    expect(attempt).toBeDefined();
    expect(provider).not.toHaveBeenCalled();
    expect((await callback(callbackRequest(state, cookie))).headers.get("location")).toBe(`${origin}/birthday/memo/admin`);
  });
  it("negotiates a JSON login destination and cookie without weakening the Origin check", async () => {
    const saved = await login(loginRequest({ accept: "application/json" }));
    expect(saved.status).toBe(200);
    expect(saved.headers.get("location")).toBeNull();
    const value = await saved.json();
    expect(value.ok).toBe(true);
    const destination = new URL(value.redirectTo);
    expect(destination.origin + destination.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(destination.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(saved.headers.getSetCookie()[0]).toMatch(/^__Host-undery-login=/);
    database.query.mockClear();
    expect((await login(loginRequest({ accept: "application/json", origin: "null" }))).status).toBe(403);
    expect(database.query).not.toHaveBeenCalled();
  });
  it("consumes a state once and rotates the session only after verifying the owner", async () => {
    const { state, cookie } = await startedLogin();
    const saved = await callback(callbackRequest(state, cookie + `; __Host-undery-session=${sessionToken}`));
    expect(saved.headers.get("location")).toBe(`${origin}/birthday/memo/admin`);
    expect(saved.headers.getSetCookie().some(value => /^__Host-undery-session=[A-Za-z0-9_-]{43};.*Max-Age=28800; Secure$/.test(value))).toBe(true);
    expect(database.transaction.mock.calls.some(([sql, values]) => sql.startsWith('DELETE FROM public."AdminSession"') && values[1] === digest(sessionToken))).toBe(true);
    expect(database.transaction.mock.calls.some(([sql, values]) => sql.startsWith('INSERT INTO public."AdminSession"') && values[1] === "12345" && values[0] !== sessionToken)).toBe(true);
    expect(database.transaction).toHaveBeenCalledWith("COMMIT");
    expect(provider).toHaveBeenCalledTimes(2);
    const repeat = await callback(callbackRequest(state, cookie));
    expect(repeat.headers.get("location")).toContain("?error=login");
    expect(provider).toHaveBeenCalledTimes(2);
  });
  it("rejects expired attempts and duplicate state parameters without exchanging a code", async () => {
    const { state, cookie } = await startedLogin();
    attempt!.expired = true;
    expect((await callback(callbackRequest(state, cookie))).headers.get("location")).toContain("?error=login");
    expect((await callback(callbackRequest(state, cookie, `&state=${state}`))).headers.get("location")).toContain("?error=login");
    expect(provider).not.toHaveBeenCalled();
  });
  it("does not grant access to another GitHub account, and consumes failed states", async () => {
    const { state, cookie } = await startedLogin();
    provider.mockImplementation(async (url: string) => url.endsWith("access_token") ? json({ access_token: "temporary-provider-token", token_type: "bearer" }) : json({ id: 99999 }));
    const failed = await callback(callbackRequest(state, cookie));
    expect(failed.headers.get("location")).toContain("?error=login");
    expect(failed.headers.getSetCookie().some(value => value.startsWith("__Host-undery-session="))).toBe(false);
    expect(attempt).toBeUndefined();
    expect(database.connect).not.toHaveBeenCalled();
  });
  it("rolls back a failed session write and never sends the uncommitted cookie", async () => {
    const { state, cookie } = await startedLogin();
    database.transaction.mockImplementation(async (sql: string) => { if (sql.startsWith('INSERT INTO public."AdminSession"')) throw new Error("private database details"); return {}; });
    const failed = await callback(callbackRequest(state, cookie));
    expect(database.transaction).toHaveBeenCalledWith("ROLLBACK");
    expect(database.release).toHaveBeenCalledOnce();
    expect(failed.headers.get("location")).toContain("?error=login");
    expect(await failed.text()).not.toContain("private");
    expect(failed.headers.getSetCookie().some(value => value.startsWith("__Host-undery-session="))).toBe(false);
  });
});

describe("provider and logout handling", () => {
  it("uses fixed GitHub endpoints, refuses redirects, and does not persist provider credentials", async () => {
    expect(await verifyGitHubOwner(getAdminAuthConfig()!, "code", "v".repeat(43), provider)).toBe("12345");
    expect(provider.mock.calls.map(([url]) => url)).toEqual(["https://github.com/login/oauth/access_token", "https://api.github.com/user"]);
    for (const [, init] of provider.mock.calls) expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(database.query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });
  it("rejects malformed, oversized, and non-JSON provider responses", async () => {
    for (const bad of [json({ access_token: "token\r\nsecret", token_type: "bearer" }), json({ access_token: "x".repeat(70000), token_type: "bearer" }), new Response("<html>bad</html>", { headers: { "content-type": "text/html" } }), Response.redirect("https://evil.example", 302)]) {
      provider.mockResolvedValueOnce(bad);
      await expect(verifyGitHubOwner(getAdminAuthConfig()!, "code", "v".repeat(43), provider)).rejects.toBeInstanceOf(Error);
    }
  });
  it("ends a stalled provider response at the read deadline", async () => {
    vi.useFakeTimers();
    provider.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>(), { headers: { "content-type": "application/json" } }));
    const check = expect(verifyGitHubOwner(getAdminAuthConfig()!, "code", "v".repeat(43), provider)).rejects.toMatchObject({ code: "request_timeout" });
    await vi.advanceTimersByTimeAsync(10001);
    await check;
  });
  it("revokes only the matching session after same-origin form CSRF verification", async () => {
    const request = (csrf = csrfToken) => new Request(`${origin}/api/auth/logout`, { method: "POST", headers: headers({ "content-type": "application/x-www-form-urlencoded" }), body: new URLSearchParams({ csrfToken: csrf }) });
    expect((await logout(request("invalid"))).status).toBe(403);
    expect(database.query.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM public."AdminSession"'))).toBe(false);
    const done = await logout(request());
    expect(done.status).toBe(303);
    expect(database.query.mock.calls.at(-1)?.[1]).toEqual([digest(sessionToken), "12345"]);
    expect(done.headers.getSetCookie()[0]).toContain("__Host-undery-session=;");
    expect(done.headers.getSetCookie()[0]).toContain("Max-Age=0;");
    expect(logoutGet().status).toBe(405);
  });
  it("negotiates a JSON logout response while clearing the cookie and retaining CSRF checks", async () => {
    const request = (csrf = csrfToken) => new Request(`${origin}/api/auth/logout`, { method: "POST", headers: headers({ accept: "application/json", "content-type": "application/x-www-form-urlencoded" }), body: new URLSearchParams({ csrfToken: csrf }) });
    expect((await logout(request("invalid"))).status).toBe(403);
    const saved = await logout(request());
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ ok: true, redirectTo: "/birthday/memo/admin" });
    expect(saved.headers.get("location")).toBeNull();
    expect(saved.headers.getSetCookie()[0]).toContain("undery-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure");
  });
});
