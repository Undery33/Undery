"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { computerCategories, type ComputerCategory } from "@/lib/computer-categories";
import { ComputerTopology } from "./computer-topology";
import type { TopologyView } from "./computer-topology-webgl";
import styles from "./computer-topology-scene.module.css";

type Props = { hrefs: Record<ComputerCategory, string>; selected: string };

export function ComputerTopologyScene({ hrefs, selected }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const view = useRef<TopologyView | null>(null);
  const [ready, setReady] = useState(false);
  const instructions = useId();

  useEffect(() => {
    const stage = host.current;
    const links = labels.current;
    if (!stage || !links) return;
    let mounted = true;
    function fallback() {
      if (!mounted) return;
      view.current?.dispose();
      view.current = null;
      setReady(false);
    }
    import("./computer-topology-webgl").then(({ createTopologyView }) => {
      if (!mounted) return;
      view.current = createTopologyView(stage, links, fallback);
      setReady(Boolean(view.current));
    }).catch(fallback);
    return () => {
      mounted = false;
      view.current?.dispose();
      view.current = null;
    };
  }, []);

  function useCameraKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = Math.PI / 12;
    switch (event.key) {
      case "ArrowLeft": view.current?.orbit(-step, 0); break;
      case "ArrowRight": view.current?.orbit(step, 0); break;
      case "ArrowUp": view.current?.orbit(0, step); break;
      case "ArrowDown": view.current?.orbit(0, -step); break;
      case "Home": view.current?.reset(); break;
      default: return;
    }
    event.preventDefault();
  }

  return (
    <div className={styles.scene} data-computer-topology="" data-topology-renderer={ready ? "webgl" : "svg"}>
      <div className={styles.fallback} hidden={ready}><ComputerTopology hrefs={hrefs} selected={selected} /></div>
      <div className={styles.live} aria-hidden={!ready}>
        <div ref={host} className={styles.host} role="group" tabIndex={ready ? 0 : -1}
          aria-label="3D 네트워크 구성도" aria-describedby={instructions} onKeyDown={useCameraKey} />
        <span className={styles.srOnly} id={instructions}>드래그하거나 방향키로 시점을 회전합니다. Home 키로 기본 시점을 복원합니다.</span>
        <div className={styles.labels} ref={labels}>
          {computerCategories.map(({ id, label }) => (
            <Link key={id} href={hrefs[id]} data-topology-device={id} aria-label={label + " 글 보기"}
              className={styles.label} aria-current={selected === id ? "true" : undefined}>{label}</Link>
          ))}
        </div>
        <div className={styles.controls} role="group" aria-label="구성도 시점 조작">
          <button type="button" aria-label="왼쪽으로 회전" title="왼쪽으로 회전" onClick={() => view.current?.orbit(-Math.PI / 12, 0)}>←</button>
          <button type="button" aria-label="오른쪽으로 회전" title="오른쪽으로 회전" onClick={() => view.current?.orbit(Math.PI / 12, 0)}>→</button>
          <button type="button" aria-label="기본 시점으로 복원" title="기본 시점으로 복원" onClick={() => view.current?.reset()}>초기화</button>
        </div>
      </div>
    </div>
  );
}
