import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BirthdayMemoStore } from "@/lib/birthday-memo-store";
import { BirthdayMemoManagement, type ManagedMemo, type MemoAction } from "@/lib/birthday-memo-management";

const connectionString = process.env.BIRTHDAY_MEMO_TEST_DATABASE_URL;
const schema = `birthday_memo_test_${randomBytes(6).toString("hex")}`;
let pool: Pool;
let publicStore: BirthdayMemoStore;
let management: BirthdayMemoManagement;
let created = false;
const change = (entry: ManagedMemo, action: MemoAction) => management.mutate({ action, id: entry.id, version: entry.version }, "123");

describe.skipIf(!connectionString)("message management actual PostgreSQL", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000, query_timeout: 10000, application_name: "undery-message-management-tests" });
    if (!/^birthday_memo_test_[a-f0-9]{12}$/u.test(schema)) throw new Error("Unsafe test schema");
    for (const name of ["birthday-memo-migration.sql", "birthday-memo-management-migration.sql"]) {
      const sql = await readFile(new URL(`../src/lib/${name}`, import.meta.url), "utf8");
      await pool.query(sql.replaceAll("birthday_memo", schema));
      created = true;
    }
    publicStore = new BirthdayMemoStore(pool, schema);
    management = new BirthdayMemoManagement(pool, schema);
  });
  beforeEach(async () => {
    await pool.query(`TRUNCATE ${schema}.tokens,${schema}.entries,${schema}.rate_limits,${schema}.management_events RESTART IDENTITY CASCADE`);
    await pool.query(`UPDATE ${schema}.board_state SET moderation_revision=0`);
  });
  afterAll(async () => {
    try { if (created && /^birthday_memo_test_[a-f0-9]{12}$/u.test(schema)) await pool.query(`DROP SCHEMA ${schema} CASCADE`); }
    finally { await pool?.end(); }
  });

  it("creates, searches and edits text without changing another message", async () => {
    const first = await management.mutate({ action: "create", requestId: randomUUID(), nickname: "친구🎂", message: "문자 %_ 그대로", status: "visible" }, "123");
    const second = await management.mutate({ action: "create", requestId: randomUUID(), nickname: "other", message: "unchanged", status: "hidden" }, "123");
    const found = await management.list({ page: 0, status: "all", q: "%_" });
    expect(found.entries.map(entry => entry.id)).toEqual([first.entry.id]);
    expect(found.counts).toEqual({ visible: 1, hidden: 1, deleted: 0 });
    const edited = await management.mutate({ action: "update", id: first.entry.id, version: first.entry.version, nickname: "수정 이름", message: "수정\r\n🎉" }, "123");
    expect(edited.entry).toMatchObject({ id: first.entry.id, version: "2", message: "수정\r\n🎉" });
    expect((await management.list({ page: 0, status: "hidden", q: "" })).entries).toEqual([second.entry]);
    expect((await publicStore.feed()).entries).toEqual([{ id: first.entry.id, nickname: "수정 이름", message: "수정\r\n🎉", createdAt: first.entry.createdAt }]);
  });
  it("preserves original upload receipts through edits, hide and trash", async () => {
    const prepared = await publicStore.prepare("receipt-writer");
    const receipt = await publicStore.submit(prepared.token, "원래 이름", "원문\r\n🎂", "receipt-writer");
    const original = (await management.list({ page: 0, q: "", status: "all" })).entries[0];
    const edited = await management.mutate({ action: "update", id: original.id, version: original.version, nickname: "관리자 수정", message: "바뀐 표시 내용" }, "123");
    const hidden = await change(edited.entry, "hide");
    await change(hidden.entry, "trash");
    expect((await publicStore.feed()).entries).toEqual([]);
    expect(await publicStore.submit(prepared.token, "원래 이름", "원문\r\n🎂", "receipt-writer")).toEqual({ ...receipt, duplicate: true });
    await expect(publicStore.submit(prepared.token, "관리자 수정", "바뀐 표시 내용", "receipt-writer")).rejects.toMatchObject({ status: 409 });
    expect((await publicStore.feed()).entries).toEqual([]);
  });
  it("restores trash to hidden state and increments moderation only on actual changes", async () => {
    const createdMemo = await management.mutate({ action: "create", requestId: randomUUID(), nickname: "owner", message: "safe", status: "visible" }, "123");
    expect(createdMemo.moderationRevision).toBe("1");
    const unchanged = await change(createdMemo.entry, "show");
    expect(unchanged).toMatchObject({ changed: false, moderationRevision: "1" });
    const trashed = await change(createdMemo.entry, "trash");
    const restored = await change(trashed.entry, "restore");
    expect(restored.entry.status).toBe("hidden");
    expect((await publicStore.feed()).entries).toEqual([]);
    const shown = await change(restored.entry, "show");
    expect(shown.moderationRevision).toBe("4");
    expect((await publicStore.feed()).entries).toHaveLength(1);
    const prepared = await publicStore.prepare("ordinary-writer");
    await publicStore.submit(prepared.token, "visitor", "append", "ordinary-writer");
    expect((await publicStore.feed()).moderationRevision).toBe("4");
  });
  it("rejects competing stale edits instead of silently overwriting", async () => {
    const createdMemo = await management.mutate({ action: "create", requestId: randomUUID(), nickname: "owner", message: "original", status: "visible" }, "123");
    const results = await Promise.allSettled(["first", "second"].map(message => management.mutate({ action: "update", id: createdMemo.entry.id, version: "1", nickname: "owner", message }, "123")));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "version_conflict", status: 409 } });
    expect((await management.list({ page: 0, q: "", status: "all" })).entries[0].version).toBe("2");
    const conflict = results.find(result => result.status === "rejected");
    if (conflict?.status !== "rejected") throw new Error("Expected a version conflict");
    const current = conflict.reason.current as ManagedMemo;
    const retried = await management.mutate({ action: "update", id: current.id, version: current.version, nickname: "owner", message: "explicitly preserved draft" }, "123");
    expect(retried.entry).toMatchObject({ version: "3", message: "explicitly preserved draft" });
  });
  it("creates one message for concurrent/retried admin requests and rejects changed payload reuse", async () => {
    const input = { action: "create" as const, requestId: randomUUID(), nickname: "retry", message: "same request", status: "visible" as const };
    const receipts = await Promise.all(Array.from({ length: 6 }, () => management.mutate(input, "123")));
    expect(new Set(receipts.map(receipt => receipt.entry.id)).size).toBe(1);
    expect(receipts.filter(receipt => !receipt.duplicate)).toHaveLength(1);
    expect((await publicStore.feed()).total).toBe(1);
    expect((await publicStore.feed()).moderationRevision).toBe("1");
    await expect(management.mutate({ ...input, message: "changed" }, "123")).rejects.toMatchObject({ code: "request_conflict", status: 409 });
    await change(receipts[0].entry, "hide");
    expect((await management.mutate(input, "123")).entry).toEqual(receipts[0].entry);
    expect((await publicStore.feed()).entries).toEqual([]);
  });
  it("returns a new moderation revision on now-empty later pages", async () => {
    await pool.query(`INSERT INTO ${schema}.entries(nickname,message,created_at) SELECT 'seed',i::text,timestamptz '2000-01-01' + i*interval '1 second' FROM generate_series(1,151) i`);
    expect((await publicStore.feed(1)).entries).toHaveLength(1);
    const latest = (await management.list({ page: 0, q: "", status: "all" })).entries[0];
    await change(latest, "hide");
    expect(await publicStore.feed(1)).toMatchObject({ entries: [], moderationRevision: "1", total: 150, totalPages: 1 });
  });
  it("backfills legacy receipts before moderation and records metadata-only audit events", async () => {
    const prepared = await publicStore.prepare("legacy-writer");
    const receipt = await publicStore.submit(prepared.token, "legacy", "original", "legacy-writer");
    await pool.query(`UPDATE ${schema}.tokens SET receipt=NULL`);
    const migration = await readFile(new URL("../src/lib/birthday-memo-management-migration.sql", import.meta.url), "utf8");
    await pool.query(migration.replaceAll("birthday_memo", schema));
    const entry = (await management.list({ page: 0, q: "", status: "all" })).entries[0];
    await management.mutate({ action: "update", id: entry.id, version: entry.version, nickname: "updated", message: "edited" }, "123");
    expect((await publicStore.submit(prepared.token, "legacy", "original", "legacy-writer")).entry).toEqual(receipt.entry);
    const audit = await pool.query(`SELECT action,actor_id,entry_version::text FROM ${schema}.management_events`);
    expect(audit.rows).toEqual([{ action: "update", actor_id: "123", entry_version: "2" }]);
  });
});
