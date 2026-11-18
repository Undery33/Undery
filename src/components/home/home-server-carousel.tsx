"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import jenkins from "./assets/jenkins.webp";
import kubernetes from "./assets/kubernetes.webp";
import linux from "./assets/linux.webp";
import windowsServer from "./assets/windows-server.webp";
import styles from "./home-stack.module.css";

const cards = [
  { name: "Linux", image: linux },
  { name: "Windows Server", image: windowsServer },
  { name: "Kubernetes", image: kubernetes },
  { name: "Jenkins", image: jenkins },
];
const reducedMotion = "(prefers-reduced-motion: reduce)";

export function HomeServerCarousel() {
  const [first, setFirst] = useState(0);
  const track = useRef<HTMLUListElement>(null);
  const animation = useRef<Animation | null>(null);
  const pending = useRef(0);

  useEffect(() => {
    const preference = window.matchMedia(reducedMotion);
    function finishIfReduced() {
      if (preference.matches) animation.current?.finish();
    }
    preference.addEventListener("change", finishIfReduced);
    return () => {
      preference.removeEventListener("change", finishIfReduced);
      if (animation.current) {
        animation.current.onfinish = null;
        animation.current.cancel();
      }
      animation.current = null;
      pending.current = 0;
    };
  }, []);

  function advance() {
    const list = track.current;
    if (!list || animation.current || !pending.current) return;
    if (window.matchMedia(reducedMotion).matches || !list.animate) {
      const steps = pending.current;
      pending.current = 0;
      setFirst((index) => (index + steps) % cards.length);
      return;
    }
    pending.current -= 1;
    const slide = list.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(calc(0px - var(--card-step)))" }],
      { duration: 280, easing: "ease-in-out", fill: "forwards" },
    );
    animation.current = slide;
    slide.onfinish = () => {
      // Commit the matching order before dropping the transform or starting another slide.
      flushSync(() => setFirst((index) => (index + 1) % cards.length));
      slide.cancel();
      animation.current = null;
      advance();
    };
  }

  const ordered = cards.slice(first).concat(cards.slice(0, first));
  return (
    <div className={styles.serverRow}>
      <div className={styles.viewport}>
        <ul className={`${styles.cards} ${styles.track}`} ref={track} id="server-cards">
          {[...ordered, ordered[0]].map(({ name, image }, position) => {
            const duplicate = position === cards.length;
            return (
              <li key={duplicate ? "wrap" : name} aria-hidden={duplicate || undefined}>
                <Image src={image} alt="" className={styles.tile} unoptimized />
                {name}
              </li>
            );
          })}
        </ul>
      </div>
      <button
        type="button"
        className={styles.next}
        aria-label="다음 서버 카드 보기"
        aria-controls="server-cards"
        onClick={() => { pending.current += 1; advance(); }}
      />
      <span role="status" className={styles.status}>첫 번째 서버 카드 {cards[first].name}</span>
    </div>
  );
}
