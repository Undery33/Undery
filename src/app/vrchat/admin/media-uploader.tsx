"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import styles from "./upload.module.css";

const tags = ["배경", "캐릭터", "친구"];
const accept = ".jpg,.jpeg,.png,.webp,.mp4,.webm,image/jpeg,image/png,image/webp,video/mp4,video/webm";
const mib = 1024 * 1024;
type Upload = {
  id: string;
  name: string;
  size: number;
  file: File | null;
  state: "ready" | "uploading" | "done" | "failed" | "invalid";
  message?: string;
  tags?: string[];
};

function addFile(file: File): Upload {
  // The server reads the file bytes. Dragged files can have a missing or inaccurate MIME type.
  let message = "";
  if (!file.size) message = "내용이 비어 있는 파일입니다.";
  else if (file.size > 256 * mib) message = "파일당 256 MiB까지 올릴 수 있습니다.";
  return { id: crypto.randomUUID(), name: file.name, size: file.size, file: message ? null : file,
    state: message ? "invalid" : "ready", message };
}

function formatSize(bytes: number) {
  return bytes >= mib ? `${(bytes / mib).toLocaleString("ko-KR", { maximumFractionDigits: 1 })} MiB`
    : `${Math.ceil(bytes / 1024).toLocaleString("ko-KR")} KiB`;
}

const statusText = { ready: "대기", uploading: "업로드 중…", done: "등록 완료", failed: "업로드 실패", invalid: "선택 오류" };

export function MediaUploader({ csrfToken, album }: { csrfToken: string; album?: "birthday" | "birthday-art" }) {
  const [items, setItems] = useState<Upload[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const active = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => () => active.current?.abort(), []);

  function selectFiles(files: FileList | null) {
    if (!files?.length || active.current) return;
    const entries = Array.from(files, addFile);
    setItems(current => [...current, ...entries]);
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    selectFiles(event.dataTransfer.files);
  }

  function update(id: string, fields: Partial<Upload>) {
    setItems(current => current.map(item => item.id === id ? { ...item, ...fields } : item));
  }

  async function upload(batch: Upload[]) {
    if (!batch.length || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    try {
      for (const item of batch) {
        if (controller.signal.aborted) return;
        if (!item.file) continue;
        // Retry with the original request ID and tags if the connection dropped after saving.
        const batchTags = item.tags ?? [...selectedTags];
        update(item.id, { state: "uploading", tags: batchTags, message: "" });
        const data = new FormData();
        data.set("file", item.file);
        data.set("requestId", item.id);
        data.set("tags", JSON.stringify(album ? [...batchTags, album] : batchTags));
        if (album) data.set("alt", item.name);
        try {
          const response = await fetch("/api/vrchat/media", {
            method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": csrfToken },
            body: data, signal: controller.signal, redirect: "error",
          });
          const result = await response.json().catch(() => null);
          if (response.ok && result?.ok && typeof result.item?.id === "string") {
            update(item.id, { state: "done", file: null });
          } else {
            const message = typeof result?.message === "string" ? result.message : response.status === 413
              ? "파일 용량이 업로드 한도를 넘었습니다." : "파일을 등록하지 못했습니다. 다시 시도해 주세요.";
            update(item.id, { state: "failed", message });
          }
        } catch {
          if (controller.signal.aborted) return;
          update(item.id, { state: "failed", message: "서버 응답을 받지 못했습니다. 연결을 확인하고 다시 시도해 주세요." });
        }
      }
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const ready = items.filter(item => item.state === "ready");
  const completed = items.filter(item => item.state === "done").length;
  return (
    <div className={styles.uploader}>
      <label className={styles.drop} data-dragging={dragging} data-busy={busy}
        onDragEnter={event => {
          event.preventDefault();
          if (event.dataTransfer.types.includes("Files") && !busy) {
            dragDepth.current++;
            setDragging(true);
          }
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        }}
        onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? "none" : "copy"; }}
        onDrop={drop}>
        <input type="file" aria-label="사진·영상 파일 선택" accept={accept} multiple disabled={busy}
          onChange={event => { selectFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
        <strong>{dragging ? "여기에 놓으세요" : "파일을 선택하거나 여기에 끌어다 놓으세요"}</strong>
        <span>JPG · PNG · WebP (32 MiB) / MP4 · WebM (256 MiB)</span>
      </label>

      <fieldset disabled={busy} className={styles.tags}>
        <legend>공통 태그 <span>(선택)</span></legend>
        {tags.map(tag => <label key={tag}>
          <input type="checkbox" checked={selectedTags.includes(tag)}
            onChange={event => {
              const checked = event.currentTarget.checked;
              setSelectedTags(current => checked ? [...current, tag] : current.filter(value => value !== tag));
            }} />{tag}
        </label>)}
      </fieldset>

      <div className={styles.actions}>
        <button type="button" disabled={!ready.length || busy} onClick={() => void upload(ready)}>
          {busy ? "업로드 중…" : ready.length ? `${ready.length}개 파일 업로드` : "파일 업로드"}
        </button>
        <span role="status">{items.length > 0 && `전체 ${items.length}개 · 완료 ${completed}개`}</span>
      </div>
      {items.length > 0 && <ul className={styles.queue} aria-label="파일별 업로드 상태">
        {items.map(item => <li key={item.id}>
          <div className={styles.file}>
            <strong>{item.name}</strong>
            <small>{formatSize(item.size)} · {statusText[item.state]}</small>
            {item.message && <p role="alert">{item.message}</p>}
          </div>
          <div className={styles.rowActions}>
            {item.state === "failed" && <button type="button" disabled={busy} aria-label={item.name + " 다시 시도"}
              onClick={() => void upload([item])}>다시 시도</button>}
            {item.state !== "done" && item.state !== "uploading" && <button type="button" disabled={busy}
              aria-label={item.name + " 선택 해제"} onClick={() => setItems(current => current.filter(row => row.id !== item.id))}>선택 해제</button>}
          </div>
        </li>)}
      </ul>}
    </div>
  );
}
