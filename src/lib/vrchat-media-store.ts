import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { Pool } from "pg";
import { getBirthdayMemoPool } from "./birthday-memo-store";
import { MemoError } from "./birthday-memo-validation";
import { inspectMedia } from "./vrchat-media-inspect";
import { checkUploadHeaders, receiveMedia } from "./vrchat-media-upload";

export type GalleryItem = {
  id: string; type: "photo" | "video"; alt: string; width: number; height: number;
  date: string | null; tags: string[]; src: string; thumbnail: string;
};

const publicColumns = "id,type,alt,width,height,to_char(taken_on,'YYYY-MM-DD') AS date,tags," +
  "coalesce(static_src,'/api/vrchat/media/files/'||id||'/original') AS src," +
  "coalesce(static_thumbnail,'/api/vrchat/media/files/'||id||'/thumbnail') AS thumbnail";

export function mediaDirectory() {
  const directory = process.env.VRCHAT_MEDIA_DIR || "/var/lib/undery/vrchat-media";
  if (!isAbsolute(directory)) throw new Error("The gallery requires an absolute storage path");
  return directory;
}

export class GalleryStore {
  private readonly table: string;

  constructor(private readonly pool: Pool, private readonly root: string, schema = "vrchat_gallery") {
    if (!/^vrchat_gallery(?:_test_[a-f0-9]{12})?$/u.test(schema)) throw new Error("Invalid gallery schema");
    this.table = schema + ".media";
  }

  async list() {
    const rows = await this.pool.query<GalleryItem>("SELECT " + publicColumns + " FROM " + this.table +
      " ORDER BY taken_on DESC NULLS LAST, created_at DESC, id");
    return rows.rows;
  }

  async file(id: string) {
    const rows = await this.pool.query<{ mime: string }>("SELECT mime FROM " + this.table + " WHERE id=$1 AND request_id IS NOT NULL", [id]);
    return rows.rows[0];
  }

  async upload(request: Request) {
    checkUploadHeaders(request);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const stage = await mkdtemp(join(this.root, ".upload-"));
    let cleanup: string | null = stage;
    try {
      const form = await receiveMedia(request, stage);
      const info = await inspectMedia(stage, form.bytes);
      if (form.type && form.type !== info.type) throw new MemoError("media_type_mismatch", 422, "선택한 분류와 파일 형식이 다릅니다.");
      const alt = form.alt ?? (info.type === "photo" ? "VRChat 사진" : "VRChat 영상");
      const date = form.date ?? info.date;
      const requestId = form.requestId ?? randomUUID();
      const fingerprint = createHash("sha256").update(JSON.stringify([form.sha256, alt, date, form.tags])).digest("hex");
      const db = await this.pool.connect();
      let discardConnection = false;
      try {
        await db.query("BEGIN");
        // The lock covers concurrent retries on other app instances, too.
        await db.query("SELECT pg_advisory_xact_lock(hashtext('vrchat-gallery-upload'),hashtext($1))", [requestId.toLowerCase()]);
        const existing = await db.query<GalleryItem & { fingerprint: string }>("SELECT fingerprint," + publicColumns +
          " FROM " + this.table + " WHERE request_id=$1", [requestId]);
        if (existing.rows.length) {
          const { fingerprint: savedFingerprint, ...item } = existing.rows[0];
          if (savedFingerprint !== fingerprint) throw new MemoError("upload_conflict", 409, "이미 다른 파일 또는 정보로 등록한 요청입니다.");
          await db.query("COMMIT");
          return { item, created: false };
        }
        const id = randomUUID();
        const published = join(this.root, id);
        await rename(stage, published);
        cleanup = published;
        const added = await db.query<GalleryItem>("INSERT INTO " + this.table +
          " (id,request_id,fingerprint,type,mime,alt,width,height,taken_on,tags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING " + publicColumns,
          [id, requestId, fingerprint, info.type, info.mime, alt, info.width, info.height, date, form.tags]);
        // An interrupted COMMIT can have succeeded. Keep its completed files so a
        // retry either finds a usable row or safely starts a new upload.
        cleanup = null;
        await db.query("COMMIT");
        return { item: added.rows[0], created: true };
      } catch (error) {
        try { await db.query("ROLLBACK"); } catch { discardConnection = true; }
        throw error;
      } finally { db.release(discardConnection); }
    } finally {
      if (cleanup) await rm(cleanup, { recursive: true, force: true });
    }
  }
}

export const getGalleryStore = () => new GalleryStore(getBirthdayMemoPool(), mediaDirectory());
