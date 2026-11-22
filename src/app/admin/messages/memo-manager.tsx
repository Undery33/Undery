"use client";

import Link from "next/link";

import { useRef, useState, type FormEvent } from "react";
import type { ManagedMemo, ManagedMemoPage, MemoMutation, MemoStatus } from "@/lib/birthday-memo-management";
import { validateMemo } from "@/lib/birthday-memo-validation";
import styles from "./messages.module.css";
import { AdminLogoutButton } from "./auth-buttons";

const labels: Record<MemoStatus, string> = { visible: "공개", hidden: "숨김", deleted: "휴지통" };
const dateLabel = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
class ManagementRequestError extends Error {
  constructor(message: string, public readonly code: string, public readonly current?: ManagedMemo) { super(message); }
}

export function MemoManager({ initial, csrfToken }: { initial: ManagedMemoPage; csrfToken: string }) {
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [filter, setFilter] = useState<MemoStatus | "all">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loginNeeded, setLoginNeeded] = useState(false);
  const [notice, setNotice] = useState("");
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [newStatus, setNewStatus] = useState<"visible" | "hidden">("visible");
  const [editing, setEditing] = useState<ManagedMemo | null>(null);
  const [editConflict, setEditConflict] = useState<ManagedMemo | null>(null);
  const createRequest = useRef<{ requestId: string; nickname: string; message: string; status: string } | null>(null);
  const [trash, setTrash] = useState<ManagedMemo | null>(null);
  const [trashConfirmed, setTrashConfirmed] = useState(false);

  function reportError(caught: unknown, fallback: string) {
    setError(caught instanceof Error ? caught.message : fallback);
    setLoginNeeded(caught instanceof ManagementRequestError && ["login_required", "invalid_csrf", "auth_unavailable"].includes(caught.code));
  }

  async function request(url: string, input?: MemoMutation) {
    const response = await fetch(url, input ? { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(input), redirect: "error" } : { credentials: "same-origin", cache: "no-store", redirect: "error" });
    const value = await response.json().catch(() => null);
    if (!response.ok || !value?.ok) throw new ManagementRequestError(value?.message || "요청을 완료하지 못했습니다. 입력한 내용은 유지됩니다.", value?.error ?? "request_failed", value?.current);
    return value;
  }

  async function load(page: number, selected = filter, q = appliedQuery) {
    const result = await request(`/admin/messages/entries?${new URLSearchParams({ page: String(page), status: selected, q })}`) as ManagedMemoPage;
    // A mutation can remove the final item on the last filtered page.
    if (page > 0 && result.entries.length === 0) return load(Math.max(0, result.totalPages - 1), selected, q);
    setData(result); setFilter(selected); setAppliedQuery(q);
  }

  async function refresh(page = data.page, selected = filter, q = appliedQuery) {
    if (busy || editing) return;
    setBusy(true); setError(""); setLoginNeeded(false); setNotice("");
    try { await load(page, selected, q); }
    catch (caught) { reportError(caught, "목록을 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function mutate(input: MemoMutation, success: string) {
    if (busy) return;
    setBusy(true); setError(""); setLoginNeeded(false); setNotice("");
    try {
      await request("/admin/messages/entries", input);
      if (input.action === "create") { setNickname(""); setMessage(""); createRequest.current = null; }
      if (input.action === "update") { setEditing(null); setEditConflict(null); }
      setTrash(null); setTrashConfirmed(false); setNotice(success);
      await load(input.action === "create" ? 0 : data.page);
    } catch (caught) {
      if (input.action === "update" && caught instanceof ManagementRequestError && caught.code === "version_conflict" && caught.current) setEditConflict(caught.current);
      reportError(caught, "변경하지 못했습니다. 입력한 내용은 유지됩니다.");
    }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent, entry?: ManagedMemo) {
    event.preventDefault();
    const values = entry ? { nickname: entry.nickname, message: entry.message } : { nickname, message };
    try { validateMemo(values.nickname, values.message); }
    catch (caught) { reportError(caught, "닉네임과 메시지를 확인해 주세요."); return; }
    if (!entry && (!createRequest.current || createRequest.current.nickname !== nickname || createRequest.current.message !== message || createRequest.current.status !== newStatus)) createRequest.current = { requestId: crypto.randomUUID(), nickname, message, status: newStatus };
    void mutate(entry ? { action: "update", id: entry.id, version: entry.version, ...values } : { action: "create", requestId: createRequest.current!.requestId, status: newStatus, ...values }, entry ? "메시지를 수정했습니다. 월드에서 다음 조회 때 반영됩니다." : "메시지를 추가했습니다.");
  }

  return <div className={styles.manager}>
    <div className={styles.toolbar}><Link href="/vrchat/birthday/messages">공개 메시지 보기</Link><AdminLogoutButton csrfToken={csrfToken} className={styles.secondary} /></div>
    <section className={styles.compose} aria-labelledby="new-message-heading">
      <h2 id="new-message-heading">새 메시지</h2>
      <form onSubmit={event => submit(event)}><fieldset disabled={busy || editing !== null}>
        <div className={styles.formGrid}>
          <label>닉네임 <span>{Array.from(nickname).length}/24</span><input value={nickname} onChange={event => setNickname(event.target.value)} maxLength={48} required disabled={busy} autoComplete="off" /></label>
          <label>표시 상태<select value={newStatus} onChange={event => setNewStatus(event.target.value as "visible" | "hidden")} disabled={busy}><option value="visible">바로 공개</option><option value="hidden">숨김으로 보관</option></select></label>
        </div>
        <label>메시지 <span>{Array.from(message).length}/300</span><textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={600} rows={4} disabled={busy} /></label>
        <button type="submit" disabled={busy || editing !== null}>메시지 추가</button></fieldset>
      </form>
    </section>
    <section aria-labelledby="message-list-heading">
      <div className={styles.heading}><h2 id="message-list-heading">저장된 메시지</h2><button type="button" className={styles.secondary} disabled={busy || editing !== null} onClick={() => void refresh()}>새로고침</button></div>
      <div className={styles.filters} aria-label="표시 상태 필터">{(["all", "visible", "hidden", "deleted"] as const).map(status => <button key={status} type="button" disabled={busy || editing !== null} aria-pressed={filter === status} className={filter === status ? styles.selected : styles.secondary} onClick={() => void refresh(0, status)}>{status === "all" ? "전체" : labels[status]} <span>{status === "all" ? Object.values(data.counts).reduce((sum, count) => sum + count, 0) : data.counts[status]}</span></button>)}</div>
      <form className={styles.search} onSubmit={event => { event.preventDefault(); void refresh(0, filter, query); }}><label htmlFor="message-search">닉네임·메시지 검색</label><div><input id="message-search" type="search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} disabled={busy || editing !== null} /><button disabled={busy || editing !== null}>검색</button></div></form>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}{loginNeeded && <> <Link href="/admin/messages">로그인 상태 확인</Link></>}</p>}
      <p className={styles.summary}>{data.total}개 · {data.totalPages ? `${data.page + 1} / ${data.totalPages} 페이지` : "표시할 메시지 없음"}</p>
      <div className={styles.list} aria-busy={busy}>{data.entries.map(entry => <article className={styles.card} key={entry.id}>
        <div className={styles.heading}><h3>{entry.nickname}</h3><span className={`${styles.badge} ${entry.status === "visible" ? styles.visible : ""}`}>{labels[entry.status]}</span></div>
        <p className={styles.message}>{entry.message || "(메시지 없음)"}</p>
        <p className={styles.meta}>등록 {dateLabel(entry.createdAt)} · 번호 {entry.id}{entry.version !== "1" ? ` · 수정 ${dateLabel(entry.updatedAt)}` : ""}</p>
        <div className={styles.actions}>
          {entry.status !== "deleted" && <><button type="button" className={styles.secondary} disabled={busy || editing !== null} onClick={() => { setEditing({ ...entry }); setEditConflict(null); setTrash(null); }}>수정</button><button type="button" className={styles.secondary} disabled={busy || editing !== null} onClick={() => void mutate({ action: entry.status === "visible" ? "hide" : "show", id: entry.id, version: entry.version }, entry.status === "visible" ? "메시지를 숨겼습니다." : "메시지를 공개했습니다.")}>{entry.status === "visible" ? "숨기기" : "공개하기"}</button><button type="button" className={styles.danger} disabled={busy || editing !== null} onClick={() => { setTrash(entry); setTrashConfirmed(false); setEditing(null); }}>휴지통으로 이동</button></>}
          {entry.status === "deleted" && <button type="button" className={styles.secondary} disabled={busy || editing !== null} onClick={() => void mutate({ action: "restore", id: entry.id, version: entry.version }, "숨김 상태로 복구했습니다. 확인 후 공개할 수 있습니다.")}>숨김 상태로 복구</button>}
        </div>
        {trash?.id === entry.id && <div className={styles.confirmation} role="group" aria-label="휴지통 이동 확인"><p>이 메시지를 벽에서 내리고 휴지통으로 옮깁니다. 나중에 복구할 수 있습니다.</p><label className={styles.check}><input type="checkbox" checked={trashConfirmed} onChange={event => setTrashConfirmed(event.target.checked)} disabled={busy} />선택한 메시지를 확인했습니다.</label><div className={styles.actions}><button type="button" className={styles.danger} disabled={busy || !trashConfirmed} onClick={() => void mutate({ action: "trash", id: entry.id, version: entry.version }, "휴지통으로 옮겼습니다. 언제든 복구할 수 있습니다.")}>휴지통 이동 확인</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setTrash(null)}>취소</button></div></div>}
        {editing?.id === entry.id && <form className={styles.editor} onSubmit={event => submit(event, editing)}><h4>메시지 수정</h4><label>닉네임<input value={editing.nickname} maxLength={48} required disabled={busy} onChange={event => setEditing({ ...editing, nickname: event.target.value })} /></label><label>메시지<textarea rows={4} value={editing.message} maxLength={600} disabled={busy} onChange={event => setEditing({ ...editing, message: event.target.value })} /></label>
          {editConflict?.id === entry.id && <aside className={styles.confirmation} aria-label="최신 메시지와 비교"><h4>다른 화면에서 저장한 최신 내용</h4><strong>{editConflict.nickname}</strong><p className={styles.message}>{editConflict.message || "(메시지 없음)"}</p><p>위 입력란의 작성 중인 내용은 유지되었습니다. 다시 저장하면 최신 내용을 현재 입력한 내용으로 바꿉니다. 공개·숨김 상태는 변경하지 않습니다.</p>{editConflict.status === "deleted" ? <p>현재 휴지통에 있습니다. 목록에서 복구한 뒤 다시 수정해 주세요.</p> : <button type="button" disabled={busy} onClick={() => void mutate({ action: "update", id: editing.id, version: editConflict.version, nickname: editing.nickname, message: editing.message }, "비교한 최신 버전을 기준으로 수정했습니다.")}>최신 버전 기준으로 내 수정 내용 저장</button>}</aside>}
          <div className={styles.actions}><button disabled={busy || editConflict?.id === entry.id}>수정 저장</button><button className={styles.secondary} type="button" disabled={busy} onClick={() => { setEditing(null); setEditConflict(null); }}>취소</button></div></form>}
      </article>)}</div>
      {data.entries.length === 0 && <div className="empty-state"><p>조건에 맞는 메시지가 없습니다.</p></div>}
      <nav className={styles.pagination} aria-label="관리 메시지 페이지"><button type="button" className={styles.secondary} disabled={busy || editing !== null || data.page === 0} onClick={() => void refresh(data.page - 1)}>이전</button><button type="button" className={styles.secondary} disabled={busy || editing !== null || data.page + 1 >= data.totalPages} onClick={() => void refresh(data.page + 1)}>다음</button></nav>
      <p className={styles.summary}>숨김·휴지통의 메시지는 월드와 공개 페이지에 표시되지 않습니다. 현재 접속한 월드에는 다음 조회 때 반영됩니다.</p>
    </section>
  </div>;
}
