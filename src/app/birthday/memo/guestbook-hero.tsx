"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { hasMemoText, MemoError, validateWebMemoText } from "@/lib/birthday-memo-validation";
import photo from "./birthday-world.webp";
import lettering from "./birthday-lettering.png";
import date from "./birthday-date.png";
import plane from "./paper-plane.png";
import styles from "./guestbook.module.css";

export default function GuestbookHero() {
  const router = useRouter();
  const title = useRef<HTMLHeadingElement>(null);
  const nicknameInput = useRef<HTMLInputElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field?: "nickname" | "message"; text: string } | null>(null);
  const [sent, setSent] = useState(false);

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
    if (sending.current || sent) return;
    try {
      validateWebMemoText(nickname, message);
    } catch (err) {
      if (!(err instanceof MemoError)) throw err;
      const field = err.code.includes("nickname") ? "nickname" : "message";
      setError({ field, text: err.message });
      (field === "nickname" ? nicknameInput : messageInput).current?.focus();
      return;
    }
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      const key = JSON.stringify([nickname, message]);
      if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
      const response = await fetch("/birthday/memo/web-submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, message, requestId: attempt.current.id }),
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || !result.entry?.id ||
          result.entry.nickname !== nickname || result.entry.message !== message) {
        setError({ text: result.message || "등록을 확인하지 못했어요. 다시 시도해 주세요." });
        return;
      }
      attempt.current = null;
      setSent(true);
      router.refresh();
    } catch {
      setError({ text: "등록 결과를 확인하지 못했어요. 같은 내용으로 다시 시도해 주세요." });
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <section className={styles.hero} aria-labelledby="birthday-title">
      <Image className={styles.photo} src={photo} alt="" fill preload unoptimized />
      <div className={styles.heading}>
        <h1 ref={title} id="birthday-title" lang="en"><Image src={lettering} alt="HAPPY BIRTHDAY" unoptimized /></h1>
        <time dateTime="2000-11-22"><Image src={date} alt="2000.11.22" unoptimized /></time>
      </div>
      <form className={styles.invite} onSubmit={send} noValidate data-sent={sent} aria-label="생일 축하 메시지 작성">
        <p id="memo-feedback" role="status" aria-live="polite" aria-atomic="true" className={styles.feedback}>
          {error?.text ?? (sent ? "전송 완료!" : pending ? "전송 중…" : "축하 메시지를 보내주세요! 월드에 등록 됩니다!")}
        </p>
        <input className={styles.nickname} ref={nicknameInput} value={nickname} onChange={event => {
          setNickname(event.target.value);
          setSent(false);
          if (error?.field !== "message" && hasMemoText(event.target.value)) setError(null);
        }} aria-label="닉네임" aria-describedby="memo-feedback" aria-invalid={error?.field === "nickname"}
          placeholder="닉네임 입력" autoComplete="nickname" required readOnly={pending} />
        <div className={styles.messageRow} data-invalid={error?.field === "message"}>
          <textarea ref={messageInput} value={message} onChange={event => {
            setMessage(event.target.value);
            setSent(false);
            if (error?.field !== "nickname" && hasMemoText(event.target.value)) setError(null);
          }} aria-label="축하 메시지" aria-describedby="memo-feedback" aria-invalid={error?.field === "message"}
            placeholder="축하 메시지 보내기" required rows={1} readOnly={pending} />
          <button type="submit" className={styles.send} disabled={pending || sent} aria-label="축하 메시지 보내기" aria-busy={pending}>
            {pending ? <span aria-hidden="true" className={styles.spinner} /> :
              sent ? <span aria-hidden="true" className={styles.check} /> : <Image src={plane} alt="" unoptimized />}
          </button>
        </div>
      </form>
    </section>
  );
}
