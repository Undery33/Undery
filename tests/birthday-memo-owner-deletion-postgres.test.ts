import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BirthdayMemoStore } from "@/lib/birthday-memo-store";
import { BirthdayMemoManagement, type ManagedMemo, type MemoAction } from "@/lib/birthday-memo-management";
import type { MemoOwnerDeletion } from "@/lib/birthday-memo-validation";

const connectionString = process.env.BIRTHDAY_MEMO_TEST_DATABASE_URL;
const schema = `birthday_memo_test_${randomBytes(6).toString("hex")}`;
let pool: Pool;
let store: BirthdayMemoStore;
let management: BirthdayMemoManagement;
let created = false;
const requestId = () => randomBytes(16).toString("hex");
const inputFor = (entryId: string, token: string, id = requestId()): MemoOwnerDeletion => ({ entryId, token, requestId: id, confirm: "trash" });
const change = (entry: ManagedMemo, action: MemoAction) => management.mutate({ action, id: entry.id, version: entry.version }, "123");
const managed = async (id: string) => (await management.list({ page: 0, q: "", status: "all" })).entries.find(entry => entry.id === id)!;
async function post(nickname = "동일 이름", message = "원문\r\n🎂") {
  const { token } = await store.prepare("writer");
  const result = await store.submit(token, nickname, message, "writer");
  return { token, ...result, input: inputFor(result.entry.id, token) };
}

describe.skipIf(!connectionString)("owner deletion actual PostgreSQL", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000, query_timeout: 10000, application_name: "undery-owner-deletion-tests" });
    if (!/^birthday_memo_test_[a-f0-9]{12}$/u.test(schema)) throw new Error("Unsafe test schema");
    for (const name of ["birthday-memo-migration.sql", "birthday-memo-management-migration.sql", "birthday-memo-owner-deletion-migration.sql"]) {
      const sql = await readFile(new URL(`../src/lib/${name}`, import.meta.url), "utf8");
      await pool.query(sql.replaceAll("birthday_memo", schema));
      created = true;
    }
    store = new BirthdayMemoStore(pool, schema);
    management = new BirthdayMemoManagement(pool, schema);
  });
  beforeEach(async () => {
    await pool.query(`TRUNCATE ${schema}.tokens,${schema}.entries,${schema}.rate_limits,${schema}.management_events,${schema}.owner_events RESTART IDENTITY CASCADE`);
    await pool.query(`UPDATE ${schema}.board_state SET moderation_revision=0`);
  });
  afterAll(async () => {
    try { if (created && /^birthday_memo_test_[a-f0-9]{12}$/u.test(schema)) await pool.query(`DROP SCHEMA ${schema} CASCADE`); }
    finally { await pool?.end(); }
  });

  it("moves only the owned row into the existing administrator trash and preserves content and receipt", async () => {
    const first = await post(); const other = await post();
    const before = await managed(first.entry.id);
    expect(await store.trashOwnEntry(first.input, "writer")).toEqual({ ok: true, duplicate: false, entryId: first.entry.id, status: "deleted", moderationRevision: "1" });
    const after = await managed(first.entry.id);
    expect(after).toMatchObject({ ...first.entry, status: "deleted", version: "2" });
    expect(new Date(after.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before.updatedAt).getTime());
    expect((await store.feed()).entries).toEqual([other.entry]);
    expect((await management.list({ page: 0, status: "deleted", q: "" })).entries).toEqual([after]);
    expect((await store.submit(first.token, first.entry.nickname, first.entry.message, "writer")).entry).toEqual(first.entry);
    const events = (await pool.query(`SELECT entry_id::text,request_id,action,entry_version::text FROM ${schema}.owner_events`)).rows;
    expect(events).toEqual([{ entry_id: first.entry.id, request_id: first.input.requestId, action: "trash", entry_version: "2" }]);
    expect((await pool.query(`SELECT count(*)::int AS n FROM ${schema}.management_events`)).rows[0].n).toBe(0);
    const auditColumns = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='owner_events'", [schema])).rows.map(row => row.column_name);
    expect(auditColumns.sort()).toEqual(["id", "entry_id", "request_id", "action", "entry_version", "created_at"].sort());
    const ledger = (await pool.query(`SELECT token_hash FROM ${schema}.owner_deletion_requests`)).rows[0];
    expect(ledger.token_hash).toBe(createHash("sha256").update(first.token).digest("hex"));
    expect(JSON.stringify(await store.feed())).not.toContain(first.token);
  });

  it("denies a same-name visitor, wrong ID, unused secret, unknown secret and an administrator-created row", async () => {
    const first = await post(); const second = await post();
    const unused = await store.prepare("writer");
    const admin = await management.mutate({ action: "create", requestId: randomUUID(), nickname: first.entry.nickname, message: "admin", status: "visible" }, "123");
    for (const input of [inputFor(first.entry.id, second.token), inputFor("9223372036854775807", first.token), inputFor(first.entry.id, unused.token), inputFor(first.entry.id, "0".repeat(64)), inputFor(admin.entry.id, first.token)]) {
      await expect(store.trashOwnEntry(input, "attempt")).rejects.toMatchObject({ code: "delete_forbidden", status: 403 });
    }
    expect((await store.feed()).total).toBe(3);
    expect((await pool.query(`SELECT count(*)::int AS n FROM ${schema}.owner_deletion_requests`)).rows[0].n).toBe(0);
  });

  it("accepts a consumed secret after prepare expiry and from a fresh connection", async () => {
    const first = await post();
    await pool.query(`UPDATE ${schema}.tokens SET expires_at=now()-interval '30 days' WHERE entry_id=$1`, [first.entry.id]);
    await store.prepare("cleanup");
    const reconnected = new Pool({ connectionString, max: 1 });
    try {
      expect(await new BirthdayMemoStore(reconnected, schema).trashOwnEntry(first.input, "returning-visitor")).toMatchObject({ status: "deleted", duplicate: false });
    } finally { await reconnected.end(); }
    expect((await store.submit(first.token, first.entry.nickname, first.entry.message, "writer")).entry).toEqual(first.entry);
  });

  it("records simultaneous retries once and never re-deletes after administrator restore or show", async () => {
    const first = await post();
    const results = await Promise.all(Array.from({ length: 8 }, () => store.trashOwnEntry(first.input, "writer")));
    expect(results.filter(result => !result.duplicate)).toHaveLength(1);
    expect(results.every(result => result.status === "deleted" && result.moderationRevision === "1")).toBe(true);
    expect((await pool.query(`SELECT count(*)::int AS n FROM ${schema}.owner_events`)).rows[0].n).toBe(1);
    const restored = await change(await managed(first.entry.id), "restore");
    expect(await store.trashOwnEntry(first.input, "writer")).toEqual({ ok: true, duplicate: true, entryId: first.entry.id, status: "hidden", moderationRevision: restored.moderationRevision });
    const shown = await change(restored.entry, "show");
    expect(await store.trashOwnEntry(first.input, "writer")).toMatchObject({ duplicate: true, status: "visible", moderationRevision: shown.moderationRevision });
    expect((await store.feed()).entries).toEqual([first.entry]);
    expect((await managed(first.entry.id)).version).toBe(shown.entry.version);
    expect(await store.trashOwnEntry({ ...first.input, requestId: requestId() }, "writer")).toMatchObject({ duplicate: false, status: "deleted", moderationRevision: "4" });
  });

  it("consumes an already-deleted no-op without changing its version, and later retries remain harmless", async () => {
    const first = await post();
    const trashed = await change(await managed(first.entry.id), "trash");
    expect(await store.trashOwnEntry(first.input, "writer")).toMatchObject({ duplicate: false, status: "deleted", moderationRevision: "1" });
    expect((await managed(first.entry.id)).version).toBe(trashed.entry.version);
    expect((await pool.query(`SELECT count(*)::int AS n FROM ${schema}.owner_events`)).rows[0].n).toBe(0);
    const restored = await change(trashed.entry, "restore");
    expect(await store.trashOwnEntry(first.input, "writer")).toMatchObject({ duplicate: true, status: "hidden", moderationRevision: restored.moderationRevision });
    expect(await store.trashOwnEntry({ ...first.input, requestId: requestId() }, "writer")).toMatchObject({ duplicate: false, status: "deleted" });
  });

  it("rejects reuse of one request ID for another owned entry", async () => {
    const first = await post(); const second = await post();
    await store.trashOwnEntry(first.input, "writer");
    await expect(store.trashOwnEntry({ ...second.input, requestId: first.input.requestId }, "writer")).rejects.toMatchObject({ code: "delete_request_conflict", status: 409 });
    expect((await store.feed()).entries).toEqual([second.entry]);
  });

  it("rolls back row, idempotency receipt, audit and board revision together on a failed audit write", async () => {
    const first = await post();
    await pool.query(`ALTER TABLE ${schema}.owner_events ADD CONSTRAINT test_reject_event CHECK (false)`);
    try { await expect(store.trashOwnEntry(first.input, "writer")).rejects.toMatchObject({ code: "23514" }); }
    finally { await pool.query(`ALTER TABLE ${schema}.owner_events DROP CONSTRAINT test_reject_event`); }
    expect((await managed(first.entry.id)).version).toBe("1");
    expect((await store.feed()).moderationRevision).toBe("0");
    expect((await pool.query(`SELECT count(*)::int AS n FROM ${schema}.owner_deletion_requests`)).rows[0].n).toBe(0);
    expect(await store.trashOwnEntry(first.input, "writer")).toMatchObject({ duplicate: false, status: "deleted" });
  });

  it("does not wait on a consumed token lock and serializes with administrator edits", async () => {
    const first = await post();
    const locker = await pool.connect();
    try {
      await locker.query("BEGIN");
      await locker.query(`SELECT token_hash FROM ${schema}.tokens WHERE entry_id=$1 FOR UPDATE`, [first.entry.id]);
      expect(await store.trashOwnEntry(first.input, "writer")).toMatchObject({ status: "deleted" });
    } finally { await locker.query("ROLLBACK"); locker.release(); }
    const second = await post();
    const original = await managed(second.entry.id);
    const results = await Promise.allSettled([
      store.trashOwnEntry(second.input, "writer"),
      management.mutate({ action: "update", id: original.id, version: original.version, nickname: "관리자", message: "검토" }, "123"),
      post("new visitor", "independent submission"),
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[2].status).toBe("fulfilled");
    if (results[1].status === "rejected") expect(results[1].reason).toMatchObject({ code: "version_conflict", status: 409 });
    expect((await managed(second.entry.id)).status).toBe("deleted");
  });

  it("rate-limits rejected ownership requests through the delete-specific persistent bucket", async () => {
    const first = await post();
    const address = "limited";
    const clientKey = createHash("sha256").update(`birthday-memo:${address}`).digest("hex");
    await pool.query(`INSERT INTO ${schema}.rate_limits(bucket,client_key,window_start,hits) VALUES('delete',$1,date_trunc('minute',now()),59)`, [clientKey]);
    await expect(store.trashOwnEntry({ ...first.input, token: "0".repeat(64) }, address)).rejects.toMatchObject({ status: 403 });
    await expect(store.trashOwnEntry(first.input, address)).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    expect((await store.feed()).entries).toEqual([first.entry]);
    const globalKey = createHash("sha256").update("birthday-memo:global").digest("hex");
    await pool.query(`UPDATE ${schema}.rate_limits SET hits=240 WHERE bucket='delete' AND client_key=$1`, [globalKey]);
    await expect(store.trashOwnEntry(first.input, "different-client")).rejects.toMatchObject({ status: 429 });
  });

  it("can reapply the additive migration without altering existing messages or deletion receipts", async () => {
    const first = await post(); await store.trashOwnEntry(first.input, "writer");
    const before = await managed(first.entry.id);
    const sql = await readFile(new URL("../src/lib/birthday-memo-owner-deletion-migration.sql", import.meta.url), "utf8");
    await pool.query(sql.replaceAll("birthday_memo", schema));
    expect(await managed(first.entry.id)).toEqual(before);
    expect(await store.trashOwnEntry(first.input, "writer")).toMatchObject({ duplicate: true, status: "deleted", moderationRevision: "1" });
    expect((await pool.query(`SELECT version FROM ${schema}.schema_migrations ORDER BY version`)).rows.map(row => row.version)).toEqual([1, 2, 3]);
  });
});
