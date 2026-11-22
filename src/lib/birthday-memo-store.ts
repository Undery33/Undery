import { createHash, randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { MemoError, MEMO_PAGE_SIZE, MEMO_TOKEN_LIFETIME_SECONDS, type MemoOrder, type MemoOwnerDeletion, validateMemo, validateMemoOwnerDeletion, validateToken } from "./birthday-memo-validation";

export type MemoEntry = { id: string; nickname: string; message: string; createdAt: string };
export type MemoOwnerDeletionReceipt = { ok: true; duplicate: boolean; entryId: string; status: "visible" | "hidden" | "deleted"; moderationRevision: string };
type EntryRow = { id: string; nickname: string; message: string; created_at: Date };
export type MemoFeed = {
  ok: true;
  revision: string;
  moderationRevision: string;
  entries: MemoEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  order: MemoOrder;
};

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const entryFromRow = (row: EntryRow): MemoEntry => ({ id: String(row.id), nickname: row.nickname, message: row.message, createdAt: row.created_at.toISOString() });

export class BirthdayMemoStore {
  private readonly schema: string;
  constructor(private readonly pool: Pool, schema = "birthday_memo") {
    // The optional isolated namespace is only used by integration tests. Never
    // interpolate a request value or arbitrary environment value as an identifier.
    if (!/^birthday_memo(?:_test_[a-f0-9]{12})?$/u.test(schema)) throw new Error("Invalid birthday memo schema");
    this.schema = schema;
  }

  private async rateLimit(bucket: "prepare" | "submit" | "delete" | "web", address: string) {
    // Shared database counters survive process restarts and work across replicas.
    // Do not store raw IP addresses. The trusted proxy contract is handled separately.
    const client = digest(`birthday-memo:${address}`);
    for (const [key, limit] of [[client, bucket === "web" ? 6 : 60], [digest("birthday-memo:global"), bucket === "web" ? 20 : 240]] as const) {
      const result = await this.pool.query<{ hits: number }>(
        `INSERT INTO ${this.schema}.rate_limits(bucket, client_key, window_start, hits)
         VALUES ($1, $2, date_trunc('minute', now()), 1)
         ON CONFLICT (bucket, client_key, window_start)
         DO UPDATE SET hits = LEAST(${this.schema}.rate_limits.hits + 1, $3 + 1)
         RETURNING hits`, [bucket, key, limit],
      );
      if (result.rows[0].hits > limit) throw new MemoError("rate_limited", 429, "요청이 많습니다. 1분 뒤 다시 시도해 주세요.");
    }
  }

  async prepare(address: string) {
    await this.rateLimit("prepare", address);
    const token = randomBytes(32).toString("hex");
    const result = await this.pool.query<{ expires_at: Date }>(
      `INSERT INTO ${this.schema}.tokens(token_hash, expires_at)
       VALUES ($1, now() + make_interval(secs => $2)) RETURNING expires_at`,
      [digest(token), MEMO_TOKEN_LIFETIME_SECONDS],
    );
    // Expired unused tokens and rate counters are disposable; posted entries never are.
    await this.pool.query(`DELETE FROM ${this.schema}.tokens WHERE entry_id IS NULL AND expires_at < now() - interval '1 day'`);
    await this.pool.query(`DELETE FROM ${this.schema}.rate_limits WHERE window_start < now() - interval '2 days'`);
    return { ok: true as const, token, expiresAt: result.rows[0].expires_at.toISOString() };
  }

  async submit(token: string, nickname: string, message: string, address: string) {
    validateToken(token);
    const payload = validateMemo(nickname, message);
    await this.rateLimit("submit", address);
    return this.saveMemo(digest(token), payload, false);
  }

  async submitWeb(input: { requestId: string; nickname: string; message: string }, address: string) {
    await this.rateLimit("web", address);
    // Separate from world tokens. A retried web submission reuses its original receipt.
    const hash = digest("web:" + input.requestId);
    return this.saveMemo(hash, input, true);
  }

  private async saveMemo(hash: string, payload: { nickname: string; message: string }, web: boolean) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      if (web) {
        await client.query(
          `INSERT INTO ${this.schema}.tokens(token_hash, expires_at) VALUES ($1, now() + interval '10 minutes')
           ON CONFLICT (token_hash) DO NOTHING`, [hash],
        );
      }
      const found = await client.query<{ entry_id: string | null; expired: boolean; receipt: MemoEntry | null }>(
        `SELECT entry_id, receipt, expires_at <= now() AS expired FROM ${this.schema}.tokens WHERE token_hash = $1 FOR UPDATE`, [hash],
      );
      const saved = found.rows[0];
      if (!saved) throw new MemoError("token_not_found", 410, "등록 주소가 만료되었거나 유효하지 않습니다. 생성 버튼을 다시 눌러 주세요.");
      if (saved.entry_id !== null) {
        const entry = saved.receipt ?? await this.findEntry(client, saved.entry_id);
        if (entry.nickname !== payload.nickname || entry.message !== payload.message) {
          throw new MemoError("token_used", 409, "이미 사용한 등록 주소입니다. 생성 버튼을 다시 눌러 주세요.");
        }
        await client.query("COMMIT");
        return { ok: true as const, duplicate: true, entry };
      }
      if (saved.expired) throw new MemoError("token_expired", 410, "등록 주소의 유효 시간이 지났습니다. 생성 버튼을 다시 눌러 주세요.");
      // PostgreSQL sequences are allocated before commit. Without a board lock,
      // page 1 could expose a newer committed row while an older row is in flight.
      // Serializing inserts through commit gives the oldest-first feed an append-only
      // order, including when two clients submit different tokens concurrently.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), 1)", [this.schema]);
      const inserted = await client.query<EntryRow>(
        `INSERT INTO ${this.schema}.entries(nickname, message, created_at)
         VALUES ($1, $2, GREATEST(clock_timestamp(), COALESCE((SELECT max(created_at) + interval '1 microsecond' FROM ${this.schema}.entries), clock_timestamp())))
         RETURNING id, nickname, message, created_at`,
        [payload.nickname, payload.message],
      );
      const entry = entryFromRow(inserted.rows[0]);
      await client.query(`UPDATE ${this.schema}.tokens SET entry_id = $1, receipt = $3::jsonb WHERE token_hash = $2`, [entry.id, hash, JSON.stringify(entry)]);
      await client.query("COMMIT");
      return { ok: true as const, duplicate: false, entry };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async findEntry(client: PoolClient, id: string) {
    const result = await client.query<EntryRow>(`SELECT id, nickname, message, created_at FROM ${this.schema}.entries WHERE id = $1`, [id]);
    if (!result.rows[0]) throw new MemoError("storage_unavailable", 503, "저장소를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    return entryFromRow(result.rows[0]);
  }

  async trashOwnEntry(input: MemoOwnerDeletion, address: string): Promise<MemoOwnerDeletionReceipt> {
    const checked = validateMemoOwnerDeletion(input.entryId, input.token, input.requestId, input.confirm);
    await this.rateLimit("delete", address);
    const tokenHash = digest(checked.token);
    const denied = () => new MemoError("delete_forbidden", 403, "이 메시지의 삭제 권한을 확인할 수 없습니다. 등록할 때 받은 비밀 코드를 확인해 주세요.");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      // Use the same board-before-entry order as administration. Do not lock a
      // token here: new submissions lock their token before waiting on the board.
      // A consumed token's entry_id is immutable and consumed tokens are retained.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), 1)", [this.schema]);
      const ownership = await client.query<{ entry_id: string | null }>(
        `SELECT entry_id::text FROM ${this.schema}.tokens WHERE token_hash=$1`, [tokenHash],
      );
      if (ownership.rows[0]?.entry_id !== checked.entryId) throw denied();
      // The prepare expiry only limits first submission, not ownership recovery.
      const previous = await client.query<{ entry_id: string; token_hash: string }>(
        `SELECT entry_id::text,token_hash FROM ${this.schema}.owner_deletion_requests WHERE request_id=$1`, [checked.requestId],
      );
      const saved = previous.rows[0];
      if (saved && (saved.entry_id !== checked.entryId || saved.token_hash !== tokenHash)) {
        throw new MemoError("delete_request_conflict", 409, "이미 사용한 삭제 요청입니다. 삭제 주소를 다시 만들어 주세요.");
      }
      const found = await client.query<{ status: MemoOwnerDeletionReceipt["status"]; version: string }>(
        `SELECT status,version::text FROM ${this.schema}.entries WHERE id=$1 FOR UPDATE`, [checked.entryId],
      );
      const row = found.rows[0];
      if (!row) throw denied();
      let status = row.status;
      if (!saved) {
        // Remember even an already-deleted no-op. Replaying this URL after an
        // administrator restores the entry must never send it back to trash.
        await client.query(
          `INSERT INTO ${this.schema}.owner_deletion_requests(request_id,entry_id,token_hash) VALUES($1,$2,$3)`,
          [checked.requestId, checked.entryId, tokenHash],
        );
        if (row.status !== "deleted") {
          const updated = await client.query<{ version: string }>(
            `UPDATE ${this.schema}.entries SET status='deleted',version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING version::text`, [checked.entryId],
          );
          await client.query(
            `INSERT INTO ${this.schema}.owner_events(entry_id,request_id,action,entry_version) VALUES($1,$2,'trash',$3)`,
            [checked.entryId, checked.requestId, updated.rows[0].version],
          );
          await client.query(`UPDATE ${this.schema}.board_state SET moderation_revision=moderation_revision+1 WHERE singleton=true`);
          status = "deleted";
        }
      }
      const board = await client.query<{ revision: string }>(`SELECT moderation_revision::text AS revision FROM ${this.schema}.board_state WHERE singleton=true`);
      if (!board.rows[0]) throw new MemoError("storage_unavailable", 503, "저장소를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      await client.query("COMMIT");
      // Return current state, not a historical success receipt. A duplicate may
      // now be hidden/visible after administrator restoration.
      return { ok: true, duplicate: Boolean(saved), entryId: checked.entryId, status, moderationRevision: board.rows[0].revision };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async visibleMessages() {
    const result = await this.pool.query<Pick<MemoEntry, "id" | "nickname" | "message">>(
      `SELECT id::text AS id, nickname, message FROM ${this.schema}.entries
       WHERE status='visible' ORDER BY created_at DESC, entries.id DESC`,
    );
    return result.rows;
  }

  async feed(page = 0, order: MemoOrder = "oldest"): Promise<MemoFeed> {
    if (!Number.isSafeInteger(page) || page < 0 || page > 9999999) throw new MemoError("invalid_page", 400, "페이지 번호가 올바르지 않습니다.");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const counts = await client.query<{ total: string; revision: string }>(`SELECT count(*) FILTER (WHERE status='visible') AS total, COALESCE(max(id), 0)::text AS revision FROM ${this.schema}.entries`);
      const board = await client.query<{ revision: string }>(`SELECT moderation_revision::text AS revision FROM ${this.schema}.board_state WHERE singleton=true`);
      const total = Number(counts.rows[0].total);
      const result = await client.query<EntryRow>(
        `SELECT id, nickname, message, created_at FROM ${this.schema}.entries WHERE status='visible' ORDER BY created_at ${order === "oldest" ? "ASC" : "DESC"}, id ${order === "oldest" ? "ASC" : "DESC"} LIMIT $1 OFFSET $2`,
        [MEMO_PAGE_SIZE, page * MEMO_PAGE_SIZE],
      );
      await client.query("COMMIT");
      const totalPages = Math.ceil(total / MEMO_PAGE_SIZE);
      return { ok: true, revision: counts.rows[0].revision, moderationRevision: board.rows[0].revision, entries: result.rows.map(entryFromRow), page, pageSize: MEMO_PAGE_SIZE, total, totalPages, hasMore: page + 1 < totalPages, order };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

let store: BirthdayMemoStore | undefined;
let sharedPool: Pool | undefined;
export function getBirthdayMemoPool() {
  if (sharedPool) return sharedPool;
  const connectionString = process.env.BIRTHDAY_MEMO_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString && !(process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER)) {
    throw new MemoError("storage_unavailable", 503, "메시지 저장소가 아직 연결되지 않았습니다.");
  }
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000, lock_timeout: 5000, query_timeout: 12000, application_name: "undery-birthday-memo" });
  // Avoid an unhandled idle-connection error without ever logging DSNs or payloads.
  pool.on("error", () => { console.error("Birthday memo database connection unavailable."); });
  sharedPool = pool;
  return sharedPool;
}

export function getBirthdayMemoStore() {
  if (process.env.BIRTHDAY_MEMO_ENABLED === "false") throw new MemoError("service_unavailable", 503, "메시지 등록을 잠시 쉬고 있습니다.");
  return store ??= new BirthdayMemoStore(getBirthdayMemoPool());
}
