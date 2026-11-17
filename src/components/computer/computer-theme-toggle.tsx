"use client";

import { useSyncExternalStore } from "react";
import {
  COMPUTER_DARK_MEDIA,
  COMPUTER_THEME_EVENT,
  COMPUTER_THEME_KEY,
  type ComputerTheme,
} from "@/lib/computer-theme";
import "./computer-theme.css";

// Keeps a choice usable for this visit even if browser storage is unavailable.
let sessionTheme: ComputerTheme | null = null;

function storedTheme(): ComputerTheme | null {
  try {
    const value = localStorage.getItem(COMPUTER_THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function currentTheme(): ComputerTheme {
  return document.documentElement.dataset.computerTheme === "dark" ? "dark" : "light";
}

function serverTheme(): ComputerTheme {
  return "light";
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(COMPUTER_DARK_MEDIA);
  const synchronize = () => {
    document.documentElement.dataset.computerTheme = sessionTheme ?? storedTheme() ?? (media.matches ? "dark" : "light");
    onChange();
  };
  const onSystemChange = () => {
    if (!sessionTheme && !storedTheme()) synchronize();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === COMPUTER_THEME_KEY || event.key === null) {
      sessionTheme = null;
      synchronize();
    }
  };

  window.addEventListener(COMPUTER_THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystemChange);
  synchronize();

  return () => {
    window.removeEventListener(COMPUTER_THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSystemChange);
  };
}

function chooseTheme(theme: ComputerTheme) {
  document.documentElement.dataset.computerTheme = theme;
  try {
    localStorage.setItem(COMPUTER_THEME_KEY, theme);
    sessionTheme = null;
  } catch {
    sessionTheme = theme;
  }
  window.dispatchEvent(new Event(COMPUTER_THEME_EVENT));
}

export function ComputerThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, serverTheme);

  return (
    <div className="computer-theme-controls" role="group" aria-label="화면 테마">
      <button type="button" className="computer-theme-light" aria-label="라이트 모드" aria-pressed={theme === "light"} title="라이트 모드" onClick={() => chooseTheme("light")}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </svg>
      </button>
      <button type="button" className="computer-theme-dark" aria-label="다크 모드" aria-pressed={theme === "dark"} title="다크 모드" onClick={() => chooseTheme("dark")}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.6 13.1A8.7 8.7 0 0 1 10.9 3.4 8.7 8.7 0 1 0 20.6 13.1Z" />
        </svg>
      </button>
    </div>
  );
}
