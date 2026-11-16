"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { computerCategories, getComputerCategory, type ComputerCategory } from "@/lib/computer-categories";
import { ComputerFigure } from "./computer-figure";
import styles from "./computer.module.css";

type Scene = ComputerCategory | "overview";

/** The text remains server-rendered; only the shared figure follows the viewport. */
export function ComputerShowcase({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Scene>("overview");

  useEffect(() => {
    const sections = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-computer-section]") || []);
    let frame = 0;
    const update = () => {
      frame = 0;
      const focusLine = window.innerHeight * (window.matchMedia("(max-width: 960px)").matches ? 0.7 : 0.5);
      let closest: Scene = "overview";
      let distance = Infinity;
      for (const section of sections) {
        const bounds = section.getBoundingClientRect();
        const nextDistance = Math.abs(bounds.top + bounds.height / 2 - focusLine);
        const value = section.dataset.computerSection;
        if (nextDistance < distance && (value === "overview" || getComputerCategory(value))) {
          distance = nextDistance;
          closest = value as Scene;
        }
      }
      setActive((previous) => previous === closest ? previous : closest);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const field = getComputerCategory(active);
  const number = field ? String(computerCategories.findIndex((item) => item.id === active) + 1).padStart(2, "0") : "00";

  return (
    <div className={styles.showcase} ref={root}>
      <aside className={styles.visual} aria-label="기술 분야 모형">
        <div className={styles.visualHeading}><span>ONE SYSTEM. THREE PERSPECTIVES.</span><span>FIG. {number}</span></div>
        <div className={styles.figureFrame}><ComputerFigure active={active} /></div>
        <div className={styles.visualCaption}><span><span className={styles.captionDot} />{field?.english || "Connected knowledge"}</span><span>{field?.label || "세 분야, 하나의 연결"}</span></div>
        <nav className={styles.figureNav} aria-label="모형의 기술 분야 선택">
          {computerCategories.map((item, index) => <a href={"#" + item.id} key={item.id} aria-current={active === item.id ? "location" : undefined} aria-label={item.label + " 설명으로 이동"}><span>{String(index + 1).padStart(2, "0")}</span><span>{item.label}</span></a>)}
        </nav>
      </aside>
      <div className={styles.story}>{children}</div>
    </div>
  );
}
