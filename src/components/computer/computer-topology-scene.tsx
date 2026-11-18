"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { computerCategories, type ComputerCategory } from "@/lib/computer-categories";
import { ComputerTopology } from "./computer-topology";
import { LinuxArchitecture } from "./linux-architecture";
import type { TopologyView } from "./computer-topology-webgl";
import styles from "./computer-topology-scene.module.css";

type Props = { hrefs: Record<ComputerCategory, string>; selected: string; returnHref?: string };
type Phase = "overview" | "entering" | "linux" | "leaving";
const deviceStages = ["router", "asa", "switch", "server", "linux", "windows-server"] as const satisfies readonly ComputerCategory[];
const linuxStages = ["kubernetes", "jenkins", "docker"] as const;

export function ComputerTopologyScene({ hrefs, selected, returnHref = "/computer#computer-screen" }: Props) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const glass = useRef<HTMLDivElement>(null);
  const view = useRef<TopologyView | null>(null);
  const destination = useRef(selected === "linux");
  const pendingNavigation = useRef<(() => void) | null>(null);
  const focusAfter = useRef(false);
  const [phase, setPhase] = useState<Phase>(selected === "linux" ? "linux" : "overview");
  const [ready, setReady] = useState(false);
  const instructions = useId();

  const settle = useCallback(() => {
    setPhase(destination.current ? "linux" : "overview");
    const navigate = pendingNavigation.current;
    pendingNavigation.current = null;
    navigate?.();
  }, []);
  const travel = useCallback((linux: boolean) => {
    destination.current = linux;
    if (view.current) {
      setPhase(linux ? "entering" : "leaving");
      view.current.setLinux(linux, true, settle);
    } else { settle(); }
  }, [settle]);

  useEffect(() => {
    const stage = host.current;
    const links = labels.current;
    const screen = glass.current;
    if (!stage || !links || !screen) return;
    let mounted = true;
    function fallback() {
      if (!mounted) return;
      view.current?.dispose();
      view.current = null;
      setReady(false);
      settle();
    }
    import("./computer-topology-webgl").then(({ createTopologyView }) => {
      if (!mounted) return;
      view.current = createTopologyView(stage, links, screen, destination.current, fallback);
      setReady(Boolean(view.current));
    }).catch(fallback);
    return () => {
      mounted = false;
      pendingNavigation.current = null;
      view.current?.dispose();
      view.current = null;
    };
  }, [settle]);

  useEffect(() => {
    const linux = selected === "linux";
    if (destination.current !== linux) travel(linux);
  }, [selected, travel]);

  useEffect(() => {
    const scene = root.current;
    const track = scene?.closest<HTMLElement>("[data-topology-track]");
    const panel = scene?.closest<HTMLElement>("[data-topology-panel]");
    if (!scene || !panel || !track) return;
    track.dataset.scrollReady = "";
    let frame = 0;
    let previous: string | null | undefined = null;
    const paint = () => {
      frame = 0;
      const distance = -track.getBoundingClientRect().top;
      const travel = track.offsetHeight - panel.offsetHeight;
      const steps = phase === "linux" ? linuxStages : deviceStages;
      const index = Math.min(steps.length - 1, Math.floor(distance * steps.length / Math.max(travel, 1)));
      const active = travel > 0 && distance > 2 && (phase === "linux" || phase === "overview");
      const stage = active ? steps[index] : undefined;
      if (previous === stage) return;
      previous = stage;
      if (stage) scene.dataset.scrollHighlight = stage;
      else delete scene.dataset.scrollHighlight;
      view.current?.setHighlight(active && phase === "overview" ? deviceStages[index] : null);
    };
    function schedule() { if (!frame) frame = requestAnimationFrame(paint); }
    paint();
    const observer = new ResizeObserver(schedule);
    observer.observe(panel);
    observer.observe(track);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
      delete track.dataset.scrollReady;
      delete scene.dataset.scrollHighlight;
    };
  }, [phase, ready]);

  useEffect(() => {
    // Finish the camera trip before a route replacement can discard the active Three.js scene.
    // The underlying links still handle new tabs, no-JS navigation and the static fallback.
    function activate(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      const local = url.origin === window.location.origin && url.pathname === window.location.pathname;
      const linux = url.searchParams.get("category") === "linux";
      if (!local || url.hash !== "#computer-screen" || (!linux && !anchor.hasAttribute("data-topology-return"))) {
        if (pendingNavigation.current) {
          pendingNavigation.current = null;
          focusAfter.current = false;
          travel(new URL(window.location.href).searchParams.get("category") === "linux");
        }
        return;
      }
      event.preventDefault();
      const track = root.current?.closest<HTMLElement>("[data-topology-track]");
      if (track && Math.abs(track.getBoundingClientRect().top) > 2) track.scrollIntoView({ block: "start", behavior: "instant" });
      if (destination.current === linux) {
        if (pendingNavigation.current) { focusAfter.current = true; return; }
        if (url.href !== window.location.href) router.replace(url.pathname + url.search + url.hash, { scroll: false });
        (linux ? glass.current : root.current)?.focus({ preventScroll: true });
        return;
      }
      focusAfter.current = true;
      pendingNavigation.current = () => router.push(url.pathname + url.search + url.hash, { scroll: false });
      travel(linux);
    }
    function followHistory() {
      pendingNavigation.current = null;
      const linux = new URL(window.location.href).searchParams.get("category") === "linux";
      focusAfter.current = Boolean(root.current?.contains(document.activeElement));
      if (destination.current !== linux) travel(linux);
    }
    document.addEventListener("click", activate, true);
    window.addEventListener("popstate", followHistory);
    return () => {
      document.removeEventListener("click", activate, true);
      window.removeEventListener("popstate", followHistory);
    };
  }, [router, travel]);

  useEffect(() => {
    if (!focusAfter.current || (phase !== "linux" && phase !== "overview")) return;
    focusAfter.current = false;
    const target = phase === "linux" ? glass.current : ready
      ? labels.current?.querySelector<HTMLElement>('[data-topology-device="linux"]')
      : root.current?.querySelector<HTMLElement>('[data-topology-fallback] a[data-topology-device="linux"]');
    (target || root.current)?.focus({ preventScroll: true });
  }, [phase, ready]);

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
    <div id="computer-screen" tabIndex={-1} ref={root} className={styles.scene} data-computer-topology=""
      data-topology-renderer={ready ? "webgl" : "svg"} data-topology-view={phase}>
      <div className={styles.fallback} hidden={ready || phase !== "overview"}><ComputerTopology hrefs={hrefs} selected={selected} /></div>
      <div className={styles.live} inert={!ready || phase !== "overview"} aria-hidden={!ready || phase !== "overview"}>
        <div ref={host} className={styles.host} role="group" tabIndex={ready && phase === "overview" ? 0 : -1}
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
      <div ref={glass} className={styles.glass} role="region" aria-label="Linux 아키텍처" tabIndex={-1}
        aria-hidden={phase !== "linux"} inert={phase !== "linux"}>
        {phase !== "overview" && <LinuxArchitecture />}
      </div>
      {phase === "linux" && <Link className={styles.returnLink} href={returnHref} data-topology-return=""
        aria-label="전체 구성도로 돌아가기">
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12H4m6-6-6 6 6 6" /></svg>
      </Link>}
    </div>
  );
}
