"use client";

import { useId, useMemo, useRef, useState } from "react";
import { findBestRoute, getRoutingSimulation, ROUTES, ROUTING_DESTINATIONS } from "@/lib/network-demos";
import { CurrentStep, PlaybackControls, SimulationSteps } from "./network-controls";
import { useNetworkPlayback } from "./network-playback";
import { NetworkScene } from "./network-scene";
import { ROUTING_TOPOLOGY } from "./network-topologies";
import { CiscoRoutingDemo, RoutingCatalog } from "./cisco-routing-demo";
import { ROUTING_CATALOG, type RoutingFamily } from "@/lib/routing-catalog";
import styles from "./network-demo.module.css";
import routingStyles from "./cisco-routing-demo.module.css";

const initialDestination = "10.20.3.7";

export function RoutingDemo() {
  const [view, setView] = useState<"methods" | "forwarding" | "catalog">("methods");
  const [initialMethod, setInitialMethod] = useState<RoutingFamily>("ospf");
  const workbenchRef = useRef<HTMLDivElement>(null);
  const methodsButtonRef = useRef<HTMLButtonElement>(null);
  function explore(method: RoutingFamily) {
    setInitialMethod(method);
    setView("methods");
    workbenchRef.current?.scrollIntoView({ block: "start" });
    methodsButtonRef.current?.focus({ preventScroll: true });
  }
  return <div className={routingStyles.workbench} ref={workbenchRef}>
    <div className={routingStyles.views} role="group" aria-label="라우팅 실습 화면 선택">
      <button ref={methodsButtonRef} type="button" aria-pressed={view === "methods"} onClick={() => setView("methods")}>라우팅 방식 · 3D</button>
      <button type="button" aria-pressed={view === "forwarding"} onClick={() => setView("forwarding")}>최장 프리픽스 일치</button>
      <button type="button" aria-pressed={view === "catalog"} onClick={() => setView("catalog")}>전체 종류 · {ROUTING_CATALOG.length}</button>
    </div>
    {view === "methods" && <CiscoRoutingDemo initialMethod={initialMethod} />}
    {view === "forwarding" && <Ipv4ForwardingDemo />}
    {view === "catalog" && <RoutingCatalog onExplore={explore} />}
  </div>;
}

function Ipv4ForwardingDemo() {
  const id = useId();
  const [destination, setDestination] = useState(initialDestination);
  const [includeDefault, setIncludeDefault] = useState(true);
  const simulation = useMemo(() => getRoutingSimulation(destination, includeDefault), [destination, includeDefault]);
  const playback = useNetworkPlayback(simulation.steps.length);
  const step = simulation.steps[Math.min(playback.stepIndex, simulation.steps.length - 1)];

  function reset() {
    setDestination(initialDestination);
    setIncludeDefault(true);
    playback.reset();
  }

  return (
    <section className={styles.demo} aria-labelledby={`${id}-title`}>
      <header className={styles.demoHeader}>
        <p className={styles.eyebrow}>INTERACTIVE LAB / IPv4 FORWARDING</p>
        <h3 id={`${id}-title`}>목적지 하나, 가장 구체적인 경로 하나</h3>
        <p>목적지 주소를 바꾸면 일치하는 경로와 선택되는 출력 인터페이스가 달라집니다. 라우터의 결정을 한 단계씩 따라갑니다.</p>
      </header>

      <div className={styles.demoGrid}>
        <div className={styles.visualColumn}>
          <div className={styles.packetStrip}>
            <span><small>목적지 IPv4</small><strong>{destination}</strong></span>
            <span><small>선택된 프리픽스</small><strong>{simulation.route?.destination ?? "일치 경로 없음"}</strong></span>
          </div>
          <NetworkScene topology={ROUTING_TOPOLOGY} step={step} paused={playback.motionPaused}>
            <div className={styles.routeReadout}>
              <span>CLIENT</span><span aria-hidden="true">→</span><span>R1</span><span aria-hidden="true">→</span>
              <strong>{simulation.route ? `${simulation.route.interface} · ${simulation.route.label}` : "DROP · 경로 없음"}</strong>
            </div>
          </NetworkScene>
          <CurrentStep step={step} index={playback.stepIndex} total={simulation.steps.length} />
        </div>

        <aside className={styles.controls} aria-label="라우팅 실습 설정">
          <h4>패킷과 경로표</h4>
          <fieldset className={styles.fieldset}>
            <legend>목적지 주소</legend>
            <div className={styles.destinations}>
              {ROUTING_DESTINATIONS.map((preset) => (
                <label key={preset.id} className={styles.destinationOption} data-selected={destination === preset.address}>
                  <input type="radio" name={`${id}-destination`} value={preset.address} checked={destination === preset.address} onChange={() => { playback.reset(); setDestination(preset.address); }} />
                  <span><strong>{preset.address}</strong><small>{preset.label}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className={styles.defaultToggle}>
            <input type="checkbox" checked={includeDefault} onChange={(event) => { playback.reset(); setIncludeDefault(event.target.checked); }} />
            <span><strong>기본 경로 사용</strong><small>0.0.0.0/0 · Gi0/5</small></span>
          </label>
          <p className={styles.fieldHint}>203.0.113.9를 선택하고 기본 경로를 끄면 일치 경로가 없는 경우를 확인할 수 있습니다.</p>
          <PlaybackControls {...playback} stepCount={simulation.steps.length} onStep={playback.goTo} onPlay={playback.togglePlay} onReset={reset} unit="패킷" />
          <div className={styles.prediction} data-success={simulation.success}>
            <span className={styles.eyebrow}>전달 결정</span>
            <strong>{simulation.title}</strong>
            <p>{simulation.route ? `다음 홉 ${simulation.route.nextHop} · 출력 ${simulation.route.interface}` : "일치하는 경로가 없어 패킷을 폐기합니다."}</p>
          </div>
        </aside>
      </div>

      <div className={styles.routeTableWrapper}>
        <table className={styles.routeTable}>
          <caption>R1의 전달 경로표 <span>목적지 {destination}에 대한 최장 프리픽스 일치</span></caption>
          <thead><tr><th scope="col">목적지 프리픽스</th><th scope="col">다음 홉</th><th scope="col">출력</th><th scope="col">비교 결과</th></tr></thead>
          <tbody>
            {ROUTES.map((route) => {
              const disabled = !includeDefault && route.id === "route-default";
              const matches = !disabled && !!findBestRoute(destination, [route]);
              const selected = !disabled && simulation.route?.id === route.id;
              return (
                <tr key={route.id} data-selected={selected} data-disabled={disabled}>
                  <th scope="row"><code>{route.destination}</code><small>{route.label}</small></th>
                  <td>{route.nextHop}</td><td>{route.interface}</td>
                  <td><span className={selected ? styles.selectedRoute : styles.routeMatch}>{disabled ? "표에서 제외" : selected ? "선택 · 최장 일치" : matches ? "일치 · 덜 구체적" : "불일치"}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SimulationSteps steps={simulation.steps} stepIndex={playback.stepIndex} onStep={playback.goTo} />
      <p className={styles.labNote}>브라우저 안의 IPv4 전달 시뮬레이션입니다. 실제 패킷을 전송하지 않습니다. 라우팅 프로토콜·관리 거리·메트릭·ECMP는 생략하며 현재 라우터의 다음 홉 선택만 보여 줍니다.</p>
    </section>
  );
}
