"use client";

import { useState } from "react";
import { ArchiveError, Header, useArchive, type Message } from "../archive";

export default function Messages() {
  const { data, failed } = useArchive<Message[]>("messages");
  const [query, setQuery] = useState("");
  const term = query.normalize("NFC").trim().toLocaleLowerCase();
  const rows = data?.filter(entry => [entry.nickname, entry.message].some(value =>
    value.normalize("NFC").toLocaleLowerCase().includes(term)));
  return <><Header title="MASSAGE" /><div className="archive-inner">
    <label className="birthday-search"><input type="search" placeholder="닉네임 및 메시지 단어를 입력해주세요." aria-label="닉네임 및 메시지 검색"
      value={query} onChange={event => setQuery(event.target.value)} /><span aria-hidden="true"/></label>
    {rows && <p className="birthday-count" aria-live="polite">총 {rows.length}개</p>}
    <div className="birthday-message-list">{rows?.map(entry => <article key={entry.id}>
      <h2>{entry.nickname}</h2><p>{entry.message}</p></article>)}</div>
    {failed && <ArchiveError />}</div></>;
}
