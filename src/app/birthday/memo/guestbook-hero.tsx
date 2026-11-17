"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { MEMO_MESSAGE_LIMIT, MEMO_NICKNAME_LIMIT } from "@/lib/birthday-memo-validation";
import photo from "./birthday-world.webp";
import styles from "./guestbook.module.css";

export default function GuestbookHero() {
  const router = useRouter();
  const title = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useLayoutEffect(() => {
    const heading = title.current;
    if (!heading || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      if (sessionStorage.getItem("undery.birthday-memo.intro")) return;
      sessionStorage.setItem("undery.birthday-memo.intro", "1");
    } catch { /* Storage can be disabled. Still show the entrance on this visit. */ }
    heading.animate([
      { clipPath: "inset(0 100% 0 0)", transform: "translateX(-0.22em)", opacity: 0 },
      { clipPath: "inset(0 0% 0 0)", transform: "translateX(0)", opacity: 1 },
    ], { duration: 900, easing: "cubic-bezier(.22,.72,.24,1)" });
  }, []);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setError("");
    try {
      const key = JSON.stringify([nickname, message]);
      if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
      const response = await fetch("/birthday/memo/web-submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, message, requestId: attempt.current.id }),
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        setError(result.message || "등록을 확인하지 못했어요. 다시 시도해 주세요.");
        return;
      }
      attempt.current = null;
      setMessage("");
      setNotice("축하 메시지를 등록했어요.");
      dialog.current?.close();
      router.refresh();
    } catch {
      setError("등록 결과를 확인하지 못했어요. 같은 내용으로 다시 시도해 주세요.");
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <section className={styles.hero} aria-labelledby="birthday-title">
      <Image className={styles.photo} src={photo} alt="" fill preload unoptimized />
      <div className={styles.heading}>
        <h1 ref={title} id="birthday-title" lang="en">HAPPY<br />BIRTHDAY</h1>
        <time dateTime="2000-11-22">2000.11.22</time>
      </div>
      <div className={styles.invite}>
        <p role="status">{notice || "축하 메시지를 보내주세요! 월드에 등록됩니다."}</p>
        <button type="button" className={styles.open} aria-haspopup="dialog" onClick={() => {
          setError("");
          dialog.current?.showModal();
        }}>
          축하 메시지 보내기
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
            <path d="m21 3-6.2 18-3.7-8.1L3 9.2 21 3Z M11.1 12.9 16 8" />
          </svg>
        </button>
      </div>
      <dialog className={styles.dialog} ref={dialog} aria-labelledby="write-title" onCancel={event => {
        if (sending.current) event.preventDefault();
      }}>
        <form onSubmit={send}>
          <h2 id="write-title">축하 메시지 보내기</h2>
          <label htmlFor="memo-name">VRChat 표시 이름</label>
          <input id="memo-name" value={nickname} onChange={e => setNickname(e.target.value)} required
            aria-describedby="name-help" readOnly={pending} spellCheck={false} autoCapitalize="none" />
          <p id="name-help">VRChat에 표시된 이름을 대소문자와 공백까지 그대로 입력해 주세요. 최대 {MEMO_NICKNAME_LIMIT}자예요.</p>
          <label htmlFor="memo-body">축하 메시지</label>
          <textarea id="memo-body" value={message} onChange={e => setMessage(e.target.value)} required
            readOnly={pending} rows={4} aria-describedby="body-help" />
          <p id="body-help">월드와 이 페이지에 공개됩니다. {[...message].length} / {MEMO_MESSAGE_LIMIT}자</p>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button type="button" onClick={() => dialog.current?.close()} disabled={pending}>닫기</button>
            <button type="submit" disabled={pending}>{pending ? "확인 중…" : "보내기"}</button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
