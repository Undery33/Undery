"use client";

import { useId, useMemo, useState } from "react";
import { getVlanSimulation, type NetworkStep, type VlanSimulationInput } from "@/lib/network-demos";
import { CurrentStep, PlaybackControls, SimulationSteps } from "./network-controls";
import { useNetworkPlayback } from "./network-playback";
import { NetworkScene } from "./network-scene";
import { VLAN_TOPOLOGY } from "./network-topologies";
import styles from "./network-demo.module.css";

const initialSettings: VlanSimulationInput = {
  scenario: "same-vlan",
  sourceVlan: 10,
  linkMode: "trunk",
  accessVlan: 10,
  nativeVlan: 1,
  allowVlan10: true,
  allowVlan20: true,
};

function FrameInspector({ step }: { step: NetworkStep }) {
  const internal = step.wireFormat === "internal";
  return (
    <div className={styles.frameInspector} data-state={step.state}>
      <div className={styles.frameHeading}>
        <span className={styles.eyebrow}>{internal ? "SWITCH INTERNAL" : "ETHERNET FRAME"}</span>
        <span className={styles.frameBadge} data-tagged={step.wireFormat === "802.1Q"}>{step.frameLabel}</span>
      </div>
      {internal ? (
        <div className={styles.internalFrame}>
          <strong>VLAN {step.frameVlan}</strong>
          <span>포트 또는 태그에서 확인한 내부 소속 정보</span>
        </div>
      ) : (
        <div className={styles.frameFields} aria-label={step.wireFormat === "802.1Q" ? `802.1Q VLAN ${step.frameVlan} 태그가 있는 프레임` : "802.1Q 태그가 없는 프레임"}>
          <span>목적지 MAC</span><span>출발지 MAC</span>
          {step.wireFormat === "802.1Q" && <span className={styles.tagField}>802.1Q <b>VLAN {step.frameVlan}</b><small>4 bytes</small></span>}
          <span>Type</span><span className={styles.payloadField}>데이터</span><span>FCS</span>
        </div>
      )}
      <p>{internal ? "내부 VLAN 소속과 케이블 위의 태그 유무는 별개입니다." : "핵심 필드를 단순화한 도식입니다. 태그 유무는 현재 전송 구간을 나타냅니다."}</p>
    </div>
  );
}

export function VlanDemo() {
  const id = useId();
  const [settings, setSettings] = useState<VlanSimulationInput>(initialSettings);
  const simulation = useMemo(() => getVlanSimulation(settings), [settings]);
  const playback = useNetworkPlayback(simulation.steps.length);
  const step = simulation.steps[Math.min(playback.stepIndex, simulation.steps.length - 1)];
  const destinationVlan = settings.scenario === "same-vlan" ? settings.sourceVlan : settings.sourceVlan === 10 ? 20 : 10;

  function changeSetting<K extends keyof VlanSimulationInput>(key: K, value: VlanSimulationInput[K]) {
    playback.reset();
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setSettings(initialSettings);
    playback.reset();
  }

  return (
    <section className={styles.demo} aria-labelledby={`${id}-title`}>
      <header className={styles.demoHeader}>
        <p className={styles.eyebrow}>INTERACTIVE LAB / ETHERNET</p>
        <h3 id={`${id}-title`}>프레임이 건너는 VLAN 경계</h3>
        <p>포트 모드를 바꾸고 프레임을 보냅니다. 같은 프레임이 access 구간과 trunk 구간에서 어떤 모습인지 확인합니다.</p>
      </header>

      <div className={styles.demoGrid}>
        <div className={styles.visualColumn}>
          <div className={styles.portStrip} aria-label="현재 포트 구성">
            <span><small>PC → SW-A</small><b>ACCESS</b> VLAN {settings.sourceVlan}</span>
            <span className={styles.uplinkBadge}><small>SW-A ↔ SW-B</small><b>{settings.linkMode.toUpperCase()}</b> {settings.linkMode === "trunk" ? `Native ${settings.nativeVlan}` : `VLAN ${settings.accessVlan}`}</span>
            <span><small>SW-B → PC</small><b>ACCESS</b> VLAN {destinationVlan}</span>
          </div>
          <NetworkScene topology={VLAN_TOPOLOGY} step={step} paused={playback.motionPaused}>
            <FrameInspector step={step} />
          </NetworkScene>
          <CurrentStep step={step} index={playback.stepIndex} total={simulation.steps.length} />
        </div>

        <aside className={styles.controls} aria-label="VLAN 실습 설정">
          <h4>연결 조건</h4>
          <div className={styles.field}>
            <label htmlFor={`${id}-source`}>출발 PC의 VLAN</label>
            <select id={`${id}-source`} value={settings.sourceVlan} onChange={(event) => changeSetting("sourceVlan", Number(event.target.value) as 10 | 20)}>
              <option value={10}>PC-A10 · VLAN 10</option><option value={20}>PC-A20 · VLAN 20</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-destination`}>목적지 PC</label>
            <select id={`${id}-destination`} value={settings.scenario} onChange={(event) => changeSetting("scenario", event.target.value as VlanSimulationInput["scenario"])}>
              <option value="same-vlan">같은 VLAN · PC-B{settings.sourceVlan}</option>
              <option value="different-vlan">다른 VLAN · PC-B{settings.sourceVlan === 10 ? 20 : 10}</option>
            </select>
          </div>
          <fieldset className={styles.fieldset}>
            <legend>스위치 간 포트 모드</legend>
            <div className={styles.segmented}>
              {(["access", "trunk"] as const).map((mode) => (
                <button key={mode} type="button" aria-pressed={settings.linkMode === mode} onClick={() => changeSetting("linkMode", mode)}>{mode === "access" ? "Access" : "Trunk"}</button>
              ))}
            </div>
          </fieldset>
          {settings.linkMode === "access" ? (
            <div className={styles.field}>
              <label htmlFor={`${id}-access`}>스위치 간 Access VLAN</label>
              <select id={`${id}-access`} value={settings.accessVlan} onChange={(event) => changeSetting("accessVlan", Number(event.target.value) as 10 | 20)}>
                <option value={10}>VLAN 10</option><option value={20}>VLAN 20</option>
              </select>
              <p className={styles.fieldHint}>양쪽 포트는 같은 access VLAN입니다. 이 링크는 한 VLAN의 태그 없는 프레임만 운반합니다.</p>
            </div>
          ) : (
            <>
              <fieldset className={styles.fieldset}>
                <legend>트렁크 허용 VLAN</legend>
                <div className={styles.checkRow}>
                  <label><input type="checkbox" checked={settings.allowVlan10} onChange={(event) => changeSetting("allowVlan10", event.target.checked)} /> VLAN 10</label>
                  <label><input type="checkbox" checked={settings.allowVlan20} onChange={(event) => changeSetting("allowVlan20", event.target.checked)} /> VLAN 20</label>
                </div>
              </fieldset>
              <div className={styles.field}>
                <label htmlFor={`${id}-native`}>Native VLAN</label>
                <select id={`${id}-native`} value={settings.nativeVlan} onChange={(event) => changeSetting("nativeVlan", Number(event.target.value) as 1 | 10)}>
                  <option value={1}>VLAN 1 · 데이터 VLAN과 다름</option><option value={10}>VLAN 10 · 태그 없는 예외</option>
                </select>
                <p className={styles.fieldHint}>양쪽 스위치의 native VLAN은 같습니다. Native VLAN 태깅 옵션은 끈 상태입니다.</p>
              </div>
            </>
          )}
          <PlaybackControls {...playback} stepCount={simulation.steps.length} onStep={playback.goTo} onPlay={playback.togglePlay} onReset={reset} unit="프레임" />
          <div className={styles.prediction} data-success={simulation.success}>
            <span className={styles.eyebrow}>예상 결과</span>
            <strong>{simulation.title}</strong>
            <p>{simulation.summary}</p>
          </div>
        </aside>
      </div>
      <SimulationSteps steps={simulation.steps} stepIndex={playback.stepIndex} onStep={playback.goTo} />
      <p className={styles.labNote}>브라우저 안에서 동작하는 전달 규칙 시뮬레이션입니다. 실제 프레임을 전송하지 않습니다. MAC 학습·ARP·STP는 생략하며 VLAN 간 L3 장비는 없습니다.</p>
    </section>
  );
}
