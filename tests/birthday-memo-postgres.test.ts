import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BirthdayMemoStore } from "@/lib/birthday-memo-store";

// Use the EXISTING PostgreSQL database through an explicitly supplied test URL.
// Only this run's unpredictable test schema is created and removed. Never truncate
// birthday_memo or any application schema. No fake database substitutes for this test.
const connectionString = process.env.BIRTHDAY_MEMO_TEST_DATABASE_URL;
const schema = `birthday_memo_test_${randomBytes(6).toString("hex")}`;
const qualified = (name: string) => `${schema}.${name}`;
let pool: Pool;
let store: BirthdayMemoStore;
let created = false;

describe.skipIf(!connectionString)("birthday memo actual PostgreSQL integration", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000, query_timeout: 10000, application_name: "undery-birthday-memo-tests" });
    const sql = await readFile(new URL("../src/lib/birthday-memo-migration.sql", import.meta.url), "utf8");
    if (!/^birthday_memo_test_[a-f0-9]{12}$/u.test(schema)) throw new Error("Unsafe test schema");
    await pool.query(sql.replaceAll("birthday_memo", schema));
    created = true;
    store = new BirthdayMemoStore(pool, schema);
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE ${qualified("tokens")}, ${qualified("entries")}, ${qualified("rate_limits")} RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    try {
      if (created && /^birthday_memo_test_[a-f0-9]{12}$/u.test(schema)) await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally { await pool?.end(); }
  });

  it("persists exact Korean/Unicode text and restores it through a fresh pool", async () => {
    const prepared = await store.prepare("reader-one");
    const nickname = "\ufeff친구🎂\ufeff";
    const message = "첫 줄\r\n둘째 줄\n<b>태그도 원문</b> & + %";
    const receipt = await store.submit(prepared.token, nickname, message, "reader-one");
    expect(receipt.duplicate).toBe(false);
    expect(receipt.entry).toMatchObject({ id: "1", nickname, message });
    const restoredPool = new Pool({ connectionString, max: 1, application_name: "undery-birthday-memo-tests-restore" });
    try {
      const restored = await new BirthdayMemoStore(restoredPool, schema).feed();
      expect(restored.entries).toEqual([receipt.entry]);
      expect(restored.total).toBe(1);
    } finally { await restoredPool.end(); }
  });

  it("allows a blank message but rejects blank nicknames without inserting", async () => {
    const prepared = await store.prepare("writer-one");
    await expect(store.submit(prepared.token, "\u3000\u200b", "hi", "writer-one")).rejects.toMatchObject({ code: "nickname_required" });
    expect((await store.feed()).total).toBe(0);
    expect((await store.submit(prepared.token, "이름", "", "writer-one")).entry.message).toBe("");
  });

  it("commits concurrent repeats exactly once and rejects edited token replays", async () => {
    const prepared = await store.prepare("writer-two");
    const receipts = await Promise.all(Array.from({ length: 6 }, () => store.submit(prepared.token, "이름", "같은 글", "writer-two")));
    expect(new Set(receipts.map(result => result.entry.id)).size).toBe(1);
    expect(receipts.filter(result => !result.duplicate)).toHaveLength(1);
    expect((await store.feed()).total).toBe(1);
    await expect(store.submit(prepared.token, "이름", "바뀐 글", "writer-two")).rejects.toMatchObject({ code: "token_used", status: 409 });
  });

  it("does not consume an expired or unknown token, but retains a saved receipt", async () => {
    const expired = await store.prepare("writer-three");
    await pool.query(`UPDATE ${qualified("tokens")} SET expires_at = now() - interval '1 second'`);
    await expect(store.submit(expired.token, "이름", "expired", "writer-three")).rejects.toMatchObject({ code: "token_expired", status: 410 });
    await expect(store.submit("f".repeat(64), "이름", "unknown", "writer-three")).rejects.toMatchObject({ code: "token_not_found", status: 410 });
    const valid = await store.prepare("writer-three");
    const saved = await store.submit(valid.token, "이름", "saved", "writer-three");
    await pool.query(`UPDATE ${qualified("tokens")} SET expires_at = now() - interval '1 day'`);
    expect((await store.submit(valid.token, "이름", "saved", "writer-three")).entry).toEqual(saved.entry);
    expect((await store.feed()).total).toBe(1);
  });

  it("paginates oldest-first without dropping older entries when new entries arrive", async () => {
    await pool.query(`INSERT INTO ${qualified("entries")}(nickname, message, created_at)
      SELECT 'seed', i::text, timestamptz '2000-01-01 00:00:00+00' + i * interval '1 second' FROM generate_series(1, 151) i`);
    const first = await store.feed(0, "oldest");
    expect(first.entries).toHaveLength(150);
    expect(first.entries[0].message).toBe("1");
    expect(first.entries[149].message).toBe("150");
    expect(first).toMatchObject({ total: 151, totalPages: 2, hasMore: true, pageSize: 150, order: "oldest" });
    const token = await store.prepare("page-test");
    await store.submit(token.token, "new", "152", "page-test");
    const second = await store.feed(1, "oldest");
    expect(second.entries.map(entry => entry.message)).toEqual(["151", "152"]);
    expect(second.hasMore).toBe(false);
    expect((await store.feed(0, "oldest")).entries).toEqual(first.entries);
    expect((await store.feed(0, "newest")).entries[0].message).toBe("152");
  });

  it("waits for the board transaction before publishing a later insert", async () => {
    const blocker = await pool.connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtext($1), 1)", [schema]);
    const prepared = await store.prepare("blocked-writer");
    let completed = false;
    const pending = store.submit(prepared.token, "이름", "after commit", "blocked-writer").then(value => { completed = true; return value; });
    try {
      // A query on a separate connection observes neither the uncommitted seed nor
      // the later submit while the board owner still holds its transaction lock.
      await blocker.query(`INSERT INTO ${qualified("entries")}(nickname, message, created_at) VALUES ('first', 'before commit', clock_timestamp())`);
      expect((await store.feed()).total).toBe(0);
      expect(completed).toBe(false);
      await blocker.query("COMMIT");
      const saved = await pending;
      expect(saved.entry.id).toBe("2");
      expect((await store.feed()).entries.map(entry => entry.message)).toEqual(["before commit", "after commit"]);
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
      await pending.catch(() => undefined);
    }
  });

  it("keeps rate limits in PostgreSQL across store instances", async () => {
    await pool.query(`INSERT INTO ${qualified("rate_limits")}(bucket,client_key,window_start,hits)
      VALUES ('prepare', $1, date_trunc('minute', now()), 60)`, [createHash("sha256").update("birthday-memo:rate-test").digest("hex")]);
    await expect(new BirthdayMemoStore(pool, schema).prepare("rate-test")).rejects.toMatchObject({ code: "rate_limited", status: 429 });
  });
});
