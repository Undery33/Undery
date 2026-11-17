"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { NetworkStep } from "@/lib/network-demos";
import type { NetworkTopology } from "./network-topologies";
import type { NetworkSceneHandle, SceneSnapshot } from "./network-webgl";
import styles from "./network-demo.module.css";

const NO_FAILED_EDGES: string[] = [];

function TopologyFallback({ topology, step, failedEdgeIds }: { topology: NetworkTopology; step: NetworkStep; failedEdgeIds: string[] }) {
  const markerId = useId().replaceAll(":", "");
  const point = (id: string) => {
    const node = topology.nodes.find((item) => item.id === id)!;
    return { x: (node.position[0] + 8.5) * 46, y: (node.position[1] + 5.5) * 39 };
  };
  return (
    <svg className={styles.fallback} viewBox="0 0 820 460" role="img" aria-label={`${topology.label}. 강조 경로: ${step.title}`}>
      <defs>
        <marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto-start-reverse">
          <path d="M0 0 8 4 0 8Z" fill="currentColor" />
        </marker>
      </defs>
      {topology.edges.map((edge) => {
        const start = point(edge.from);
        const end = point(edge.to);
        const failed = failedEdgeIds.includes(edge.id);
        const active = !failed && step.edgeIds.includes(edge.id);
        const bend = (start.x + end.x) / 2;
        return (
          <g key={edge.id}>
            <path className={failed ? styles.fallbackFailedEdge : active ? styles.fallbackActiveEdge : styles.fallbackEdge} d={`M${start.x} ${start.y} C${bend} ${start.y} ${bend} ${end.y} ${end.x} ${end.y}`} markerEnd={active ? `url(#${markerId})` : undefined} />
            {failed && <text className={styles.fallbackFailureMark} x={bend} y={(start.y + end.y) / 2 - 8}>×</text>}
          </g>
        );
      })}
      {topology.nodes.map((node) => {
        const position = point(node.id);
        const active = step.nodeIds.includes(node.id);
        return (
          <g key={node.id} transform={`translate(${position.x},${position.y})`} className={active ? styles.fallbackActiveNode : styles.fallbackNode}>
            <rect x="-49" y="-30" width="98" height="60" rx={node.kind === "router" || node.kind === "gateway" ? 28 : 6} />
            <text y="-3">{node.label}</text>
            <text y="17" className={styles.fallbackDetail}>{node.detail}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function NetworkScene({ topology, step, paused = false, failedEdgeIds = NO_FAILED_EDGES, showPacket = true, children }: { topology: NetworkTopology; step: NetworkStep; paused?: boolean; failedEdgeIds?: string[]; showPacket?: boolean; children?: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<NetworkSceneHandle | null>(null);
  const [status, setStatus] = useState<"loading" | "webgl" | "svg" | "fallback">("loading");
  const ready = status === "webgl" || status === "svg";
  const instructionsId = useId();
  const failureId = useId();
  const failedLinks = topology.edges.filter((edge) => failedEdgeIds.includes(edge.id)).map((edge) => {
    const label = (id: string) => topology.nodes.find((node) => node.id === id)?.label ?? id;
    return `${label(edge.from)}–${label(edge.to)}`;
  });
  const snapshot = useMemo<SceneSnapshot>(() => ({
    key: `${topology.id}:${step.id}:${step.nodeIds.join(",")}:${step.edgeIds.join(",")}:${failedEdgeIds.join(",")}:${showPacket}`,
    nodeIds: step.nodeIds,
    edgeIds: step.edgeIds,
    failedEdgeIds,
    showPacket,
    state: step.state,
    tagged: step.wireFormat === "802.1Q",
    paused,
  }), [failedEdgeIds, paused, showPacket, step, topology.id]);
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    snapshotRef.current = snapshot;
    instanceRef.current?.update(snapshot);
  }, [snapshot]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let instance: NetworkSceneHandle | undefined;
    void import("./network-webgl").then(({ createNetworkScene }) => {
      function mount(preferSvg = false) {
        if (cancelled) return;
        try {
          instance = createNetworkScene(host!, topology, (failedMode) => {
            if (cancelled) return;
            instanceRef.current = null;
            // A lost WebGL context is fully disposed before rebuilding with SVG.
            if (failedMode === "webgl") mount(true);
            else setStatus("fallback");
          }, preferSvg);
          instance.update(snapshotRef.current);
          instanceRef.current = instance;
          setStatus(instance.rendererMode);
        } catch {
          instance?.dispose();
          instanceRef.current = null;
          host!.replaceChildren();
          if (!preferSvg) mount(true);
          else setStatus("fallback");
        }
      }
      mount();
    }).catch(() => {
      if (!cancelled) setStatus("fallback");
    });
    return () => {
      cancelled = true;
      instance?.dispose();
      instanceRef.current = null;
    };
  }, [topology]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const model = instanceRef.current;
    if (!model || !ready) return;
    switch (event.key) {
      case "ArrowLeft": model.orbit(-0.14, 0); break;
      case "ArrowRight": model.orbit(0.14, 0); break;
      case "ArrowUp": model.orbit(0, -0.12); break;
      case "ArrowDown": model.orbit(0, 0.12); break;
      case "+": case "=": model.zoom(-0.12); break;
      case "-": model.zoom(0.12); break;
      case "Home": model.resetView(); break;
      default: return;
    }
    event.preventDefault();
  }

  return (
    <div className={styles.scene}>
      <div className={styles.sceneToolbar}>
        <span className={styles.sceneMode}>{ready ? `3D NETWORK · ${status === "svg" ? "SVG" : "WEBGL"}` : "NETWORK MAP"}</span>
        <div className={styles.viewTools} role="group" aria-label="3D 시점 조절">
          <button type="button" disabled={!ready} onClick={() => instanceRef.current?.zoom(-0.18)} aria-label="3D 모형 확대">+</button>
          <button type="button" disabled={!ready} onClick={() => instanceRef.current?.zoom(0.18)} aria-label="3D 모형 축소">−</button>
          <button type="button" disabled={!ready} onClick={() => instanceRef.current?.resetView()}>초기 시점</button>
        </div>
      </div>
      <div className={styles.viewport}>
        <div
          ref={hostRef}
          className={styles.canvasHost}
          data-ready={ready}
          role="group"
          tabIndex={ready ? 0 : -1}
          aria-label="회전과 확대가 가능한 3D 네트워크 모형"
          aria-describedby={failedLinks.length ? `${instructionsId} ${failureId}` : instructionsId}
          onKeyDown={onKeyDown}
        />
        {!ready && <TopologyFallback topology={topology} step={step} failedEdgeIds={failedEdgeIds} />}
      </div>
      {failedLinks.length > 0 && <p className={styles.sceneFailure} id={failureId}><span aria-hidden="true">×</span> 장애 링크: {failedLinks.join(" · ")}</p>}
      {children}
      <p className={styles.sceneHelp} id={instructionsId}>
        {ready
          ? `${status === "svg" ? "SVG 소프트웨어 렌더링 · " : ""}드래그로 회전 · 휠/두 손가락으로 확대 · 모형에 포커스 후 방향키로 회전, +/−로 확대, Home으로 초기화`
          : status === "loading"
            ? "3D 모형을 준비 중입니다. 준비되는 동안 아래 단계와 네트워크 도식을 확인할 수 있습니다."
            : "현재 환경에서 3D 렌더러를 시작할 수 없어 도식으로 표시합니다. 경로 선택과 단계별 결과는 동일하게 동작합니다."}
      </p>
    </div>
  );
}
