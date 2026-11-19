"use client";

import { useState } from "react";

type AdminButtonProps = { section?: "vrchat"; className?: string };

function AuthButton({ action, csrfToken, className, section }: AdminButtonProps & { action: "login" | "logout"; csrfToken?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      // A no-referrer document can give native POST forms an opaque Origin.
      // Fetch preserves the exact same-origin checks used by message changes.
      const endpoint = action === "login" ? "/api/auth/github" : "/api/auth/logout";
      const response = await fetch(endpoint + (section === "vrchat" ? "?section=vrchat" : ""), {
        method: "POST", credentials: "same-origin", redirect: "error",
        headers: { Accept: "application/json", "Content-Type": action === "login" ? "application/json" : "application/x-www-form-urlencoded" },
        body: action === "login" ? "{}" : new URLSearchParams({ csrfToken: csrfToken ?? "" }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok || typeof result.redirectTo !== "string") throw new Error(result?.message || "로그인 상태를 변경하지 못했습니다. 다시 시도해 주세요.");
      if (action === "login") {
        const target = new URL(result.redirectTo);
        if (target.origin !== "https://github.com" || target.pathname !== "/login/oauth/authorize" || target.username || target.password) throw new Error("로그인 주소를 확인하지 못했습니다.");
        window.location.assign(target.href);
      } else {
        const page = section === "vrchat" ? "/vrchat/admin" : "/birthday/memo/admin";
        if (result.redirectTo !== page) throw new Error("이동할 화면을 확인하지 못했습니다.");
        // Discard the authenticated document and in-memory drafts after revocation.
        window.location.assign(page);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청을 완료하지 못했습니다."); setBusy(false);
    }
  }
  return <div><button type="button" className={className} disabled={busy} onClick={() => void submit()}>{busy ? "처리 중…" : action === "login" ? "GitHub로 관리자 로그인" : "로그아웃"}</button>{error && <p role="alert" style={{ color: "#8a2d20", fontSize: ".85rem", marginTop: 12 }}>{error}</p>}</div>;
}

export function AdminLoginButton(props: AdminButtonProps) { return <AuthButton action="login" {...props} />; }
export function AdminLogoutButton(props: AdminButtonProps & { csrfToken: string }) { return <AuthButton action="logout" {...props} />; }
