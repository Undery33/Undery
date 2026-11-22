"use client";

import { useState } from "react";
import { ArchiveError, Header, Photo, useArchive, type Album } from "../archive";

const download = "/api/vrchat/birthday/download";
export default function Photos() {
  const { data, failed } = useArchive<Album>("album");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ids = Array.from(selected);
  return <><Header title="PHOTO ZONE" /><div className="archive-inner album-inner">
    <div className="album-toolbar"><span aria-live="polite">({selected.size}/{data?.photos.length ?? "…"})</span>
      <a aria-disabled={!ids.length} href={ids.length ? download + "?ids=" + ids.join(",") : undefined} download>선택 다운로드</a>
      <a aria-disabled={!data?.photos.length} href={data?.photos.length ? download : undefined} download>일괄 다운로드</a>
    </div>
    <div className="album-grid">{data?.photos.map(photo => <label key={photo.id}>
      <Photo src={photo.thumbnail} alt={photo.alt} loading="lazy" />
      <input type="checkbox" checked={selected.has(photo.id)} aria-label={photo.alt + " 선택"} onChange={event => {
        const checked = event.target.checked;
        setSelected(previous => { const next = new Set(previous); if (checked) next.add(photo.id); else next.delete(photo.id); return next; });
      }} />
    </label>)}</div>{failed && <ArchiveError />}</div></>;
}
