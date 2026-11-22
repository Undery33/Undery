"use client";

import { useEffect, useState } from "react";
import type { BirthdayPhoto } from "@/lib/birthday-album";
import type { MemoEntry } from "@/lib/birthday-memo-store";

export const birthday = "/vrchat/birthday";
export type Message = Pick<MemoEntry, "id" | "nickname" | "message">;
export type Album = { photos: BirthdayPhoto[]; art: Record<string, string> };

export function useArchive<T>(endpoint: "album" | "messages") {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/vrchat/birthday/" + endpoint, { cache: "no-store", signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<T>;
      }).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [endpoint]);
  return { data, failed };
}

export function Header({ title }: { title: string }) {
  return <header className="archive-head"><a href={birthday} aria-label="생일 페이지로 돌아가기">←</a><h1 lang="en">{title}</h1></header>;
}

export function ArchiveError() {
  return <p role="alert" className="archive-error">불러오지 못했습니다. 새로고침해 주세요.</p>;
}

/* Plain image elements keep server-hosted originals and gallery thumbnails on their native URLs. */
/* eslint-disable-next-line @next/next/no-img-element */
export const Photo = (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />;
