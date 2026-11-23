"use client";

import { useRef, useState } from "react";
import { Photo, type Album } from "./archive";

const download = "/api/vrchat/birthday/download";

export function BirthdayGallery({ photos, preview = false }: { photos: Album["photos"]; preview?: boolean }) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [index, setIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const active = index === null ? undefined : photos[index];

  function open(index: number) {
    setIndex(index);
    dialog.current?.showModal();
  }

  function step(direction: number) {
    setIndex(current => current === null ? null : (current + direction + photos.length) % photos.length);
  }

  function togglePhoto(id: string) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return <>
    {!preview && <div className="album-toolbar">
      <span aria-live="polite">({selected.size}/{photos.length})</span>
      <button type="button" aria-pressed={selecting} onClick={() => {
        setSelecting(!selecting);
        setSelected(new Set());
      }}>{selecting ? "선택 취소" : "선택하기"}</button>
      {selecting && <a aria-disabled={!selected.size} href={selected.size ? download + "?ids=" + [...selected].join(",") : undefined} download>선택 다운로드</a>}
      <a aria-disabled={!photos.length} href={photos.length ? download : undefined} download>일괄 다운로드</a>
    </div>}
    <div className={preview ? "birthday-preview" : "album-grid"}>
      {(preview ? photos.slice(0, 9) : photos).map((photo, i) => selecting
        ? <label key={photo.id}>
            <Photo src={photo.thumbnail} alt="" loading="lazy" />
            <input type="checkbox" aria-label={photo.alt + " 선택"} checked={selected.has(photo.id)} onChange={() => togglePhoto(photo.id)} />
          </label>
        : <button key={photo.id} type="button" className="birthday-tile" aria-haspopup="dialog" onClick={() => open(i)}>
            <Photo src={photo.thumbnail} alt={photo.alt} loading="lazy" />
          </button>)}
    </div>
    <dialog ref={dialog} className="birthday-viewer" aria-label="사진 크게 보기"
      onClose={() => { setIndex(null); touchStart.current = null; }}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        step(event.key === "ArrowRight" ? 1 : -1);
      }}
      onTouchStart={event => {
        const point = event.touches[0];
        touchStart.current = event.touches.length === 1 ? { x: point.clientX, y: point.clientY } : null;
      }}
      onTouchCancel={() => { touchStart.current = null; }}
      onTouchEnd={event => {
        const point = event.changedTouches[0];
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || !point || event.touches.length) return;
        const dx = point.clientX - start.x;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(point.clientY - start.y)) step(dx < 0 ? 1 : -1);
      }}>
      {active && <Photo key={active.id} src={active.src} alt={active.alt} />}
      <button type="button" className="viewer-close" aria-label="닫기" onClick={() => dialog.current?.close()}>×</button>
      {photos.length > 1 && <>
        <button type="button" className="viewer-prev" aria-label="이전 사진" onClick={() => step(-1)}>‹</button>
        <button type="button" className="viewer-next" aria-label="다음 사진" onClick={() => step(1)}>›</button>
      </>}
    </dialog>
  </>;
}
