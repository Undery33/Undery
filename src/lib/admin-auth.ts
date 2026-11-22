import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getBirthdayMemoPool } from "./birthday-memo-store";
import { memoClientAddress, memoHeaders, memoJson } from "./birthday-memo-http";
import { MemoError } from "./birthday-memo-validation";

export type AdminSession = {
  tokenHash: string;
  githubUserId: string;
  csrfToken: string;
  createdAt: Date;
  expiresAt: Date;
};

export type AdminAuthConfig = { origin: string; clientId: string; clientSecret: string; ownerId: string; secure: boolean };
const tokenPattern = /^[A-Za-z0-9_-]{43}$/u;
const token = () => randomBytes(32).toString("base64url");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Compatibility with the existing deployed GitHub login, not a new account store. */
export function getAdminAuthConfig(env = process.env): AdminAuthConfig | null {
  if (env.BIRTHDAY_MEMO_ENABLED === "false" ||
      !(env.BIRTHDAY_MEMO_DATABASE_URL || env.DATABASE_URL || (env.PGHOST && env.PGDATABASE && env.PGUSER)) ||
      !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !/^[1-9][0-9]*$/u.test(env.ADMIN_GITHUB_ID ?? "")) return null;
  try {
    const origin = new URL(env.SITE_URL ?? "");
    const localDevelopment = env.NODE_ENV === "development" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" ||
        (origin.protocol !== "https:" && !(localDevelopment && origin.protocol === "http:"))) return null;
    return { origin: origin.origin, clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET,
      ownerId: env.ADMIN_GITHUB_ID!, secure: origin.protocol === "https:" };
  } catch { return null; }
}

export function authConfigEnabled() { return getAdminAuthConfig() !== null; }

function configured() {
  const config = getAdminAuthConfig();
  if (!config) throw new MemoError("auth_unavailable", 503, "관리자 로그인이 아직 연결되지 않았습니다.");
  return config;
}

export const adminCookieName = (kind: "login" | "session", secure: boolean) => `${secure ? "__Host-" : ""}undery-${kind}`;

function readCookie(headers: Headers, name: string) {
  const raw = headers.get("cookie") ?? "";
  if (raw.length > 8192) return null;
  const values = raw.split(";").map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(name.length + 1);
  return tokenPattern.test(value) ? value : null;
}

export function sameAdminOrigin(headers: Headers, origin: string) {
  return headers.get("origin") === origin && !["same-site", "cross-site"].includes(headers.get("sec-fetch-site") ?? "");
}

export function matchesAdminToken(candidate: string, expected: string) {
  return tokenPattern.test(candidate) && tokenPattern.test(expected) && timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

export async function getAdminSession(headers: Headers): Promise<AdminSession | null> {
  const config = getAdminAuthConfig();
  if (!config) return null;
  const cookie = readCookie(headers, adminCookieName("session", config.secure));
  if (!cookie) return null;
  const result = await getBirthdayMemoPool().query<AdminSession>(
    `SELECT "tokenHash", "githubUserId", "csrfToken",
       "createdAt" AT TIME ZONE 'UTC' AS "createdAt", "expiresAt" AT TIME ZONE 'UTC' AS "expiresAt"
     FROM public."AdminSession"
     WHERE "tokenHash"=$1 AND "githubUserId"=$2 AND "expiresAt" > (now() AT TIME ZONE 'UTC')`, [hash(cookie), config.ownerId]);
  const saved = result.rows[0];
  return saved && saved.githubUserId === config.ownerId && saved.expiresAt instanceof Date &&
    saved.expiresAt.getTime() > Date.now() && tokenPattern.test(saved.csrfToken) ? saved : null;
}

export async function requireAdminSession(headers: Headers): Promise<AdminSession> {
  configured();
  const session = await getAdminSession(headers);
  if (!session) throw new MemoError("login_required", 401, "관리자 로그인이 필요합니다.");
  return session;
}

export async function requireAdminMutation(request: Request): Promise<AdminSession> {
  const config = configured();
  if (!sameAdminOrigin(request.headers, config.origin)) throw new MemoError("forbidden_origin", 403, "허용되지 않은 요청입니다.");
  const session = await requireAdminSession(request.headers);
  if (!matchesAdminToken(request.headers.get("x-csrf-token") ?? "", session.csrfToken)) {
    throw new MemoError("invalid_csrf", 403, "로그인 상태를 새로 확인한 뒤 다시 시도해 주세요.");
  }
  return session;
}

function setCookie(response: Response, config: AdminAuthConfig, kind: "login" | "session", value: string, age: number) {
  response.headers.append("Set-Cookie", `${adminCookieName(kind, config.secure)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${config.secure ? "; Secure" : ""}`);
}

function redirect(location: string) { return new Response(null, { status: 303, headers: { ...memoHeaders, Location: location } }); }

const vrchatAdmin = "/vrchat/admin";
const birthdayAdmin = "/admin/messages";
const vrchatStatePrefix = "vrchat.";

function adminDestination(request: Request) {
  return new URL(request.url).searchParams.get("section") === "vrchat" ? vrchatAdmin : birthdayAdmin;
}

/** Database counters prevent concurrent processes or restarts from bypassing throttling. */
async function limitLogin(request: Request) {
  for (const [key, limit] of [[hash(`undery-admin-login:${memoClientAddress(request)}`), 10], [hash("undery-admin-login:global"), 60]] as const) {
    const result = await getBirthdayMemoPool().query<{ hits: number }>(
      `INSERT INTO birthday_memo.rate_limits(bucket,client_key,window_start,hits)
       VALUES ('admin_login',$1,date_trunc('minute',now()),1)
       ON CONFLICT (bucket,client_key,window_start) DO UPDATE SET hits=LEAST(birthday_memo.rate_limits.hits+1,$2+1)
       RETURNING hits`, [key, limit]);
    if (result.rows[0].hits > limit) throw new MemoError("rate_limited", 429, "로그인 요청이 많습니다. 1분 뒤 다시 시도해 주세요.");
  }
  await getBirthdayMemoPool().query(`DELETE FROM birthday_memo.rate_limits
    WHERE bucket='admin_login' AND window_start < now() - interval '2 days'`);
}

export async function startAdminLogin(request: Request) {
  const config = configured();
  if (!sameAdminOrigin(request.headers, config.origin)) throw new MemoError("forbidden_origin", 403, "허용되지 않은 요청입니다.");
  await limitLogin(request);
  // Include the entry point in the opaque state whose full hash is bound to this browser.
  const state = (adminDestination(request) === vrchatAdmin ? vrchatStatePrefix : "") + token();
  const browser = token(), verifier = token();
  const pool = getBirthdayMemoPool();
  await pool.query(`DELETE FROM public."AdminLoginAttempt" WHERE "expiresAt" <= (now() AT TIME ZONE 'UTC')`);
  await pool.query(`INSERT INTO public."AdminLoginAttempt"("stateHash","browserHash",verifier,"expiresAt")
    VALUES ($1,$2,$3,(now() AT TIME ZONE 'UTC') + interval '10 minutes')`, [hash(state), hash(browser), verifier]);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${config.origin}/api/auth/github/callback`, state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", scope: "", allow_signup: "false" }).toString();
  const response = request.headers.get("accept") === "application/json"
    ? memoJson({ ok: true, redirectTo: url.href }) : redirect(url.href);
  setCookie(response, config, "login", browser, 600);
  return response;
}

async function readLimitedBody(body: ReadableStream<Uint8Array>, limit: number) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => undefined); }, 10000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        void reader.cancel().catch(() => undefined);
        throw new MemoError("invalid_body", 413, "요청 크기를 확인해 주세요.");
      }
      chunks.push(value);
    }
    if (expired) throw new MemoError("request_timeout", 408, "요청 시간이 초과되었습니다. 다시 시도해 주세요.");
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

async function boundedJson(response: Response) {
  if (!response.ok || response.redirected || !response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) {
    throw new Error("Identity provider response unavailable");
  }
  const value: unknown = JSON.parse(await readLimitedBody(response.body, 65536));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid identity provider response");
  return value as Record<string, unknown>;
}

export async function verifyGitHubOwner(config: AdminAuthConfig, code: string, verifier: string, request = fetch) {
  const exchange = await request("https://github.com/login/oauth/access_token", {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, code_verifier: verifier,
      redirect_uri: `${config.origin}/api/auth/github/callback` }),
  });
  const access = await boundedJson(exchange);
  if (typeof access.access_token !== "string" || !/^[\x21-\x7e]{1,2048}$/u.test(access.access_token) || access.token_type !== "bearer") throw new Error("OAuth exchange failed");
  const identity = await boundedJson(await request("https://api.github.com/user", {
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${access.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "undery-admin", "X-GitHub-Api-Version": "2022-11-28" },
  }));
  if (typeof identity.id !== "number" || !Number.isSafeInteger(identity.id) || identity.id <= 0 || String(identity.id) !== config.ownerId) {
    throw new Error("Account is not authorized");
  }
  return config.ownerId;
}

export async function finishAdminLogin(request: Request) {
  const config = configured();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "", code = url.searchParams.get("code") ?? "";
  const forVrchat = state.startsWith(vrchatStatePrefix);
  const destination = config.origin + (forVrchat ? vrchatAdmin : birthdayAdmin);
  const response = redirect(destination + "?error=login");
  setCookie(response, config, "login", "", 0);
  const browser = readCookie(request.headers, adminCookieName("login", config.secure));
  if (url.searchParams.getAll("state").length !== 1 || url.searchParams.getAll("code").length !== 1 ||
      !tokenPattern.test(forVrchat ? state.slice(vrchatStatePrefix.length) : state) ||
      !browser || !code || code.length > 512 || url.searchParams.has("error")) return response;
  try {
    const pool = getBirthdayMemoPool();
    // DELETE ... RETURNING consumes the browser-bound state once, before exchange.
    const attempts = await pool.query<{ verifier: string }>(
      `DELETE FROM public."AdminLoginAttempt" WHERE "stateHash"=$1 AND "browserHash"=$2
       AND "expiresAt" > (now() AT TIME ZONE 'UTC') RETURNING verifier`, [hash(state), hash(browser)]);
    if (attempts.rowCount !== 1 || !tokenPattern.test(attempts.rows[0].verifier)) return response;
    const owner = await verifyGitHubOwner(config, code, attempts.rows[0].verifier);
    const session = token(), csrf = token();
    const oldSession = readCookie(request.headers, adminCookieName("session", config.secure));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM public."AdminSession" WHERE "githubUserId"=$1 AND
        ("expiresAt" <= (now() AT TIME ZONE 'UTC') OR "tokenHash"=$2)`, [owner, oldSession ? hash(oldSession) : ""]);
      await client.query(`INSERT INTO public."AdminIdentity"(id,"githubUserId","createdAt")
        VALUES ($1,$2,now() AT TIME ZONE 'UTC') ON CONFLICT ("githubUserId") DO NOTHING`, [randomUUID(), owner]);
      await client.query(`INSERT INTO public."AdminSession"("tokenHash","githubUserId","csrfToken","createdAt","expiresAt")
        VALUES ($1,$2,$3,now() AT TIME ZONE 'UTC',(now() AT TIME ZONE 'UTC') + interval '8 hours')`, [hash(session), owner, csrf]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
    response.headers.set("Location", destination);
    setCookie(response, config, "session", session, 28800);
  } catch { /* Do not expose provider responses, authorization codes, sessions, or database details. */ }
  return response;
}

export async function logoutAdmin(request: Request) {
  const config = configured();
  if (!sameAdminOrigin(request.headers, config.origin)) throw new MemoError("forbidden_origin", 403, "허용되지 않은 요청입니다.");
  const session = await requireAdminSession(request.headers);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/x-www-form-urlencoded") {
    throw new MemoError("invalid_content_type", 415, "로그아웃 버튼을 이용해 주세요.");
  }
  if (!request.body) throw new MemoError("invalid_csrf", 403, "로그인 상태를 다시 확인해 주세요.");
  const body = await readLimitedBody(request.body, 1024);
  const form = new URLSearchParams(body);
  if (form.getAll("csrfToken").length !== 1 || !matchesAdminToken(form.get("csrfToken") ?? "", session.csrfToken)) {
    throw new MemoError("invalid_csrf", 403, "로그인 상태를 새로 확인한 뒤 다시 시도해 주세요.");
  }
  await getBirthdayMemoPool().query(`DELETE FROM public."AdminSession" WHERE "tokenHash"=$1 AND "githubUserId"=$2`, [session.tokenHash, config.ownerId]);
  const destination = adminDestination(request);
  const response = request.headers.get("accept") === "application/json"
    ? memoJson({ ok: true, redirectTo: destination }) : redirect(config.origin + destination);
  setCookie(response, config, "session", "", 0);
  return response;
}

export function authFailure(error: unknown) {
  if (error instanceof MemoError) {
    const response = memoJson({ ok: false, error: error.code, message: error.message }, error.status);
    if (error.status === 429) response.headers.set("Retry-After", "60");
    return response;
  }
  return memoJson({ ok: false, error: "auth_unavailable", message: "로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503);
}

export function rejectAuthMethod() { return new Response(null, { status: 405, headers: { ...memoHeaders, Allow: "POST" } }); }
