import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { getBirthdayMemoPool, type MemoEntry } from "./birthday-memo-store";
import { MemoError, parseMemoPage, validateMemo } from "./birthday-memo-validation";

export type MemoStatus = "visible" | "hidden" | "deleted";
export type ManagedMemo = MemoEntry & { status: MemoStatus; version: string; updatedAt: string };
export type MemoAction = "create" | "update" | "hide" | "show" | "trash" | "restore";
export type MemoMutation = { action: MemoAction; requestId?: string; id?: string; version?: string; nickname?: string; message?: string; status?: "visible" | "hidden" };
export type ManagementQuery = { page: number; q: string; status: MemoStatus | "all" };
export type ManagedMemoPage = { ok: true; entries: ManagedMemo[]; page: number; pageSize: number; total: number; totalPages: number; counts: Record<MemoStatus, number>; moderationRevision: string };
type Row = { id: string; nickname: string; message: string; created_at: Date; updated_at: Date; status: MemoStatus; version: string };
const columns = "id::text,nickname,message,created_at,updated_at,status,version::text";
const fromRow = (row: Row): ManagedMemo => ({ id: row.id, nickname: row.nickname, message: row.message, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), status: row.status, version: row.version });
const invalid = () => new MemoError("invalid_request", 400, "입력 내용을 확인해 주세요.");
type MutationReceipt = { ok: true; entry: ManagedMemo; moderationRevision: string; changed: boolean; duplicate: boolean };

export class MemoConflictError extends MemoError {
  constructor(public readonly current: ManagedMemo) {
    super("version_conflict", 409, "다른 화면에서 메시지가 변경되었습니다. 최신 내용과 작성 중인 내용을 비교해 주세요.");
  }
}

function positiveDecimal(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/u.test(value) && BigInt(value) <= 9223372036854775807n;
}

export function parseManagementQuery(params: URLSearchParams): ManagementQuery {
  for (const key of params.keys()) if (!["page", "q", "status"].includes(key) || params.getAll(key).length !== 1) throw invalid();
  const q = params.get("q") ?? "";
  if (Array.from(q).length > 100 || /[\p{Cc}\p{Cs}]/u.test(q)) throw invalid();
  const status = params.get("status") ?? "all";
  if (!["all", "visible", "hidden", "deleted"].includes(status)) throw invalid();
  return { page: parseMemoPage(params.get("page")), q, status: status as ManagementQuery["status"] };
}

export function parseMemoMutation(value: unknown): MemoMutation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const input = value as Record<string, unknown>;
  if (typeof input.action !== "string" || !["create", "update", "hide", "show", "trash", "restore"].includes(input.action)) throw invalid();
  const action = input.action as MemoAction;
  const allowed = action === "create" ? ["action", "requestId", "nickname", "message", "status"] : action === "update" ? ["action", "id", "version", "nickname", "message"] : ["action", "id", "version"];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw invalid();
  if (action !== "create" && (!positiveDecimal(input.id) || !positiveDecimal(input.version))) throw invalid();
  if (action === "create" || action === "update") {
    if (typeof input.nickname !== "string" || typeof input.message !== "string") throw invalid();
    validateMemo(input.nickname, input.message);
  }
  if (action === "create" && input.status !== "visible" && input.status !== "hidden") throw invalid();
  if (action === "create" && (typeof input.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(input.requestId))) throw invalid();
  return input as MemoMutation;
}

export class BirthdayMemoManagement {
  constructor(private readonly pool: Pool, private readonly schema = "birthday_memo") {
    if (!/^birthday_memo(?:_test_[a-f0-9]{12})?$/u.test(schema)) throw new Error("Invalid memo schema");
  }

  async list(query: ManagementQuery): Promise<ManagedMemoPage> {
    const checked = parseManagementQuery(new URLSearchParams({ page: String(query.page), q: query.q, status: query.status }));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const where = "($1='all' OR status=$1) AND ($2='' OR strpos(lower(nickname),lower($2))>0 OR strpos(lower(message),lower($2))>0)";
      const values = [checked.status, checked.q];
      const count = await client.query<{ total: string }>(`SELECT count(*)::text AS total FROM ${this.schema}.entries WHERE ${where}`, values);
      const states = await client.query<{ status: MemoStatus; total: string }>(`SELECT status,count(*)::text AS total FROM ${this.schema}.entries GROUP BY status`);
      const rows = await client.query<Row>(`SELECT ${columns} FROM ${this.schema}.entries WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET $3`, [...values, checked.page * 50]);
      const board = await client.query<{ revision: string }>(`SELECT moderation_revision::text AS revision FROM ${this.schema}.board_state WHERE singleton=true`);
      await client.query("COMMIT");
      const total = Number(count.rows[0].total);
      const counts = { visible: 0, hidden: 0, deleted: 0 };
      for (const row of states.rows) counts[row.status] = Number(row.total);
      return { ok: true, entries: rows.rows.map(fromRow), page: checked.page, pageSize: 50, total, totalPages: Math.ceil(total / 50), counts, moderationRevision: board.rows[0].revision };
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async mutate(value: MemoMutation, actorId: string) {
    const input = parseMemoMutation(value);
    if (!/^[1-9][0-9]*$/u.test(actorId)) throw new MemoError("forbidden", 403, "관리자 권한이 필요합니다.");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1),1)", [this.schema]);
      const payloadHash = createHash("sha256").update(JSON.stringify([input.nickname, input.message, input.status])).digest("hex");
      if (input.action === "create") {
        const saved = await client.query<{ actor_id: string; payload_hash: string; receipt: MutationReceipt }>(`SELECT actor_id,payload_hash,receipt FROM ${this.schema}.management_requests WHERE request_id=$1`, [input.requestId]);
        if (saved.rows[0]) {
          if (saved.rows[0].actor_id !== actorId || saved.rows[0].payload_hash !== payloadHash) throw new MemoError("request_conflict", 409, "이미 사용한 작성 요청입니다. 입력 내용을 다시 확인해 주세요.");
          await client.query("COMMIT");
          return { ...saved.rows[0].receipt, changed: false, duplicate: true };
        }
      }
      let result: Row;
      let changed = true;
      if (input.action === "create") {
        const inserted = await client.query<Row>(`INSERT INTO ${this.schema}.entries(nickname,message,status,created_at)
          VALUES($1,$2,$3,GREATEST(clock_timestamp(),COALESCE((SELECT max(created_at)+interval '1 microsecond' FROM ${this.schema}.entries),clock_timestamp()))) RETURNING ${columns}`, [input.nickname, input.message, input.status]);
        result = inserted.rows[0];
      } else {
        const existing = await client.query<Row>(`SELECT ${columns} FROM ${this.schema}.entries WHERE id=$1 FOR UPDATE`, [input.id]);
        const row = existing.rows[0];
        if (!row) throw new MemoError("not_found", 404, "메시지를 찾을 수 없습니다.");
        if (row.version !== input.version) throw new MemoConflictError(fromRow(row));
        let status = row.status;
        if (input.action === "update" && status === "deleted") throw new MemoError("restore_required", 409, "휴지통에서 복구한 뒤 수정해 주세요.");
        if (input.action === "hide") { if (status === "deleted") throw invalid(); status = "hidden"; }
        if (input.action === "show") { if (status === "deleted") throw invalid(); status = "visible"; }
        if (input.action === "trash") status = "deleted";
        if (input.action === "restore") { if (status !== "deleted") throw invalid(); status = "hidden"; }
        const nickname = input.action === "update" ? input.nickname! : row.nickname;
        const message = input.action === "update" ? input.message! : row.message;
        changed = nickname !== row.nickname || message !== row.message || status !== row.status;
        if (changed) {
          // Older receipts are frozen before editing. Replaying a visitor's URL
          // continues to acknowledge their original upload and never undoes moderation.
          const original: MemoEntry = { id: row.id, nickname: row.nickname, message: row.message, createdAt: row.created_at.toISOString() };
          await client.query(`UPDATE ${this.schema}.tokens SET receipt=$2::jsonb WHERE entry_id=$1 AND receipt IS NULL`, [row.id, JSON.stringify(original)]);
          const updated = await client.query<Row>(`UPDATE ${this.schema}.entries SET nickname=$2,message=$3,status=$4,version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING ${columns}`, [row.id, nickname, message, status]);
          result = updated.rows[0];
        } else result = row;
      }
      if (changed) {
        await client.query(`INSERT INTO ${this.schema}.management_events(entry_id,action,actor_id,entry_version) VALUES($1,$2,$3,$4)`, [result.id, input.action, actorId, result.version]);
        await client.query(`UPDATE ${this.schema}.board_state SET moderation_revision=moderation_revision+1 WHERE singleton=true`);
      }
      const board = await client.query<{ revision: string }>(`SELECT moderation_revision::text AS revision FROM ${this.schema}.board_state WHERE singleton=true`);
      const receipt: MutationReceipt = { ok: true, entry: fromRow(result), moderationRevision: board.rows[0].revision, changed, duplicate: false };
      if (input.action === "create") await client.query(`INSERT INTO ${this.schema}.management_requests(request_id,actor_id,payload_hash,entry_id,receipt) VALUES($1,$2,$3,$4,$5::jsonb)`, [input.requestId, actorId, payloadHash, result.id, JSON.stringify(receipt)]);
      await client.query("COMMIT");
      return receipt;
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}

export const getBirthdayMemoManagement = () => new BirthdayMemoManagement(getBirthdayMemoPool());
