"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import styles from "./upload.module.css";

type Photo = { id: string; alt: string; thumbnail: string; src: string };

export function PhotoList({ photos, csrfToken }: { photos: Photo[]; csrfToken: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  function remove(photo: Photo) {
    startTransition(async () => {
      setMessage("");
      try {
        const response = await fetch("/api/vrchat/media?id=" + encodeURIComponent(photo.id), {
          method: "DELETE", credentials: "same-origin", redirect: "error",
          headers: { "X-CSRF-Token": csrfToken },
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
          setMessage(result.message || "사진을 삭제하지 못했습니다.");
          return;
        }
        setMessage("갤러리에서 사진을 삭제했습니다.");
        setSelected(null);
        router.refresh();
      } catch {
        setMessage("삭제 결과를 확인하지 못했습니다. 새로고침 후 다시 확인해 주세요.");
      }
    });
  }

  return <section className={styles.photos} aria-labelledby="gallery-photos">
    <h2 id="gallery-photos">PHOTO 사진 관리</h2>
    <p role="status">{message}</p>
    {photos.length === 0 ? <p>등록된 사진이 없습니다.</p> :
      <ul className={styles.queue}>{photos.map(photo => <li key={photo.id}>
        <a href={photo.src} target="_blank" rel="noreferrer" aria-label={photo.alt + " 원본 보기"}>
          <Image unoptimized src={photo.thumbnail} alt={photo.alt} width={96} height={72} />
        </a>
        <div className={styles.file}><strong>{photo.alt}</strong>
          {selected === photo.id && <small>이 사진을 공개 갤러리에서 삭제할까요? 서버에 원본은 보관됩니다.</small>}
        </div>
        <div className={styles.rowActions}>
          {selected === photo.id ? <>
            <button type="button" disabled={pending} onClick={() => setSelected(null)}>취소</button>
            <button type="button" disabled={pending} onClick={() => remove(photo)}>{pending ? "삭제 중…" : "삭제 확인"}</button>
          </> : <button type="button" disabled={pending} onClick={() => { setMessage(""); setSelected(photo.id); }}>삭제</button>}
        </div>
      </li>)}</ul>}
  </section>;
}
