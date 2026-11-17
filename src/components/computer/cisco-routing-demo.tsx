"use client";

import { useId, useMemo, useState } from "react";
import { ROUTING_CATALOG, type RoutingFamily } from "@/lib/routing-catalog";
import { DEFAULT_ROUTING_INPUT, getRoutingMethodSimulation, type RoutingLabInput, type RoutingMethod } from "@/lib/routing-methods";
import { CurrentStep, PlaybackControls, SimulationSteps } from "./network-controls";
import { useNetworkPlayback } from "./network-playback";
import { NetworkScene } from "./network-scene";
import { CISCO_ROUTING_TOPOLOGY } from "./network-topologies";
import base from "./network-demo.module.css";
import styles from "./cisco-routing-demo.module.css";

const METHODS: { id: RoutingMethod; name: string; hint: string; description: string }[] = [
  { id: "static", name: "정적", hint: "설정한 다음 홉", description: "관리자가 지정한 경로를 사용합니다. 예비 경로를 준비한 경우와 원격 장애를 알아채지 못하는 경우를 비교합니다." },
  { id: "rip", name: "RIP", hint: "적은 홉 수", description: "RIPv2가 목적지까지의 홉 수를 비교합니다. 위 경로는 2홉, 아래 경로는 3홉입니다." },
  { id: "ospf", name: "OSPF", hint: "낮은 누적 Cost", description: "같은 Area 0 안에서 OSPFv2가 링크 상태를 공유하고 SPF로 경로를 계산합니다. 각 링크의 Cost를 바꿔 보십시오." },
  { id: "eigrp", name: "EIGRP", hint: "대역폭과 지연", description: "기본 K 값의 classic metric으로 후보를 비교합니다. 경로의 최소 대역폭과 전체 지연이 선택에 영향을 줍니다." },
  { id: "isis", name: "IS-IS", hint: "낮은 누적 메트릭", description: "같은 Level 2 안에서 링크 상태를 공유하고 SPF로 누적 메트릭이 낮은 경로를 계산합니다." },
  { id: "bgp", name: "BGP", hint: "속성과 운영 정책", description: "두 유효한 BGP 후보의 LOCAL_PREF와 AS_PATH를 비교합니다. 더 높은 우선순위의 속성은 동일한 조건입니다." },
  { id: "pbr", name: "PBR", hint: "트래픽 조건", description: "정책에 일치하는 트래픽은 지정한 다음 홉으로 보냅니다. 미일치하면 일반 라우팅 테이블을 조회합니다." },
];

const methodName = (method: RoutingFamily) => METHODS.find((item) => item.id === method)!.name;

export function CiscoRoutingDemo({ initialMethod = "ospf" }: { initialMethod?: RoutingMethod }) {
  const id = useId();
  const [input, setInput] = useState<RoutingLabInput>(() => ({ ...DEFAULT_ROUTING_INPUT, method: initialMethod }));
  const simulation = useMemo(() => getRoutingMethodSimulation(input), [input]);
  const playback = useNetworkPlayback(simulation.steps.length);
  const step = simulation.steps[Math.min(playback.stepIndex, simulation.steps.length - 1)];
  const method = METHODS.find((item) => item.id === input.method)!;
  const source = ROUTING_CATALOG.find((item) => item.lab === input.method);
  const spf = input.method === "ospf" || input.method === "isis";

  function update(patch: Partial<RoutingLabInput>) {
    playback.reset();
    setInput((current) => ({ ...current, ...patch }));
  }

  function reset() {
    playback.reset();
    setInput({ ...DEFAULT_ROUTING_INPUT, method: input.method });
  }

  return (
    <section className={base.demo} aria-labelledby={`${id}-title`}>
      <header className={base.demoHeader}>
        <p className={base.eyebrow}>CISCO ROUTING LAB / CONTROL → FORWARDING</p>
        <h3 id={`${id}-title`}>같은 목적지, 다른 경로 선택</h3>
        <p>라우팅 방식을 고르고 비용이나 링크 상태를 바꿉니다. 경로를 결정하는 과정과 패킷이 이동하는 과정을 순서대로 살펴봅니다.</p>
      </header>

      <div className={styles.methods} role="group" aria-label="라우팅 방식 선택">
        {METHODS.map((item, index) => (
          <button key={item.id} type="button" aria-label={`${item.name} 실습`} aria-pressed={input.method === item.id} onClick={() => update({ method: item.id })}>
            <small>{String(index + 1).padStart(2, "0")}</small><strong>{item.name}</strong><span>{item.hint}</span>
          </button>
        ))}
      </div>

      <div className={styles.methodIntro}>
        <span className={styles.protocolCode}>{simulation.routeCode}</span>
        <p><strong>{method.name}</strong>{method.description}</p>
        {source && <a href={source.sourceUrl} target="_blank" rel="noreferrer">공식 문서 ↗</a>}
      </div>

      <div className={base.demoGrid}>
        <div className={base.visualColumn}>
          <div className={base.packetStrip}>
            <span><small>목적지 네트워크</small><strong>192.0.2.0/24</strong></span>
            <span><small>R1에서 선택한 다음 홉</small><strong>{simulation.selectedPath === "upper" ? "10.0.12.2 · R2" : simulation.selectedPath === "lower" ? "10.0.13.3 · R3" : "사용 가능한 경로 없음"}</strong></span>
          </div>
          <NetworkScene topology={CISCO_ROUTING_TOPOLOGY} step={step} paused={playback.motionPaused} failedEdgeIds={simulation.failedEdgeIds} showPacket={step.state !== "ready"}>
            <div className={base.routeReadout}>
              <span>{step.frameLabel}</span>
              <strong>{simulation.selectedPath === "upper" ? "R1 → R2 → R4" : simulation.selectedPath === "lower" ? "R1 → R3 → R5 → R4" : "R1 · 전달 경로 없음"}</strong>
            </div>
          </NetworkScene>
          <div className={styles.pathLegend}>
            <span><b>위 경로</b> R1 → R2 → R4 · 2홉{spf && ` · 합계 ${simulation.candidates[0].spfCost}`}</span>
            <span><b>아래 경로</b> R1 → R3 → R5 → R4 · 3홉{spf && ` · 합계 ${simulation.candidates[1].spfCost}`}</span>
          </div>
          <CurrentStep step={step} index={playback.stepIndex} total={simulation.steps.length} />
        </div>

        <aside className={base.controls} aria-label="Cisco 라우팅 실습 설정">
          <h4>경로 선택 조건</h4>
          <div className={base.field}>
            <label htmlFor={`${id}-failure`}>링크 상태</label>
            <select id={`${id}-failure`} value={input.failure} onChange={(event) => update({ failure: event.target.value as RoutingLabInput["failure"] })}>
              <option value="none">모든 링크 정상</option>
              <option value="upper-local">R1–R2 장애 · 바로 연결된 링크</option>
              <option value="upper-remote">R2–R4 장애 · 원격 링크</option>
              <option value="both">R1의 두 출력 링크 장애</option>
            </select>
          </div>

          {input.method === "static" && <>
            <div className={base.field}>
              <label htmlFor={`${id}-static-path`}>주 정적 경로 · AD 1</label>
              <select id={`${id}-static-path`} value={input.staticPath} onChange={(event) => update({ staticPath: event.target.value as RoutingLabInput["staticPath"] })}>
                <option value="upper">위 경로 · 다음 홉 R2</option><option value="lower">아래 경로 · 다음 홉 R3</option>
              </select>
            </div>
            <label className={base.defaultToggle}><input type="checkbox" checked={input.floatingBackup} onChange={(event) => update({ floatingBackup: event.target.checked })} /><span><strong>플로팅 정적 경로 추가</strong><small>반대 경로를 AD 10으로 구성</small></span></label>
            <p className={base.fieldHint}>주 경로의 다음 홉을 사용할 수 없으면 예비 경로가 설치됩니다. 이 실습에는 원격 장애를 감지하는 IP SLA 추적이 없습니다.</p>
            <div className={styles.presets}>
              <button type="button" onClick={() => update({ staticPath: "upper", floatingBackup: true, failure: "upper-local" })}>백업 전환 보기</button>
              <button type="button" onClick={() => update({ staticPath: "upper", floatingBackup: true, failure: "upper-remote" })}>원격 장애 비교</button>
            </div>
          </>}

          {input.method === "rip" && <>
            <div className={styles.metricNote}><span>RIPv2 HOP COUNT</span><strong>위 2홉 / 아래 3홉</strong><p>대역폭과 Cost는 RIP의 비교 기준에 포함되지 않습니다. 장애가 반영된 뒤 도달 가능한 후보에서 적은 홉을 선택합니다.</p></div>
            <div className={styles.presets}><button type="button" onClick={() => update({ failure: "none" })}>정상 경로 비교</button><button type="button" onClick={() => update({ failure: "upper-local" })}>장애 후 우회</button></div>
          </>}

          {spf && <>
            {(["upper", "lower"] as const).map((path) => {
              const key = path === "upper" ? "upperCost" : "lowerCost";
              return <div key={path} className={styles.rangeField}>
                <label htmlFor={`${id}-${key}`}>{path === "upper" ? "위 경로" : "아래 경로"}의 링크당 {input.method === "ospf" ? "Cost" : "메트릭"}<output htmlFor={`${id}-${key}`}>{input[key]}</output></label>
                <input id={`${id}-${key}`} type="range" min="1" max="40" step="1" value={input[key]} onChange={(event) => update({ [key]: Number(event.target.value) })} />
              </div>;
            })}
            <p className={base.fieldHint}>각 경로의 라우터 사이 링크에 같은 값을 적용합니다. 목적지 LAN의 비용 1을 더해 비교합니다.</p>
            <div className={styles.presets}>
              <button type="button" onClick={() => update({ upperCost: 25, lowerCost: 10, failure: "none" })}>홉보다 비용이 낮은 경로</button>
              <button type="button" onClick={() => update({ upperCost: 15, lowerCost: 10, failure: "none" })}>동일 비용 · ECMP</button>
            </div>
          </>}

          {input.method === "eigrp" && <>
            <div className={styles.metricFields}>
              {(["upper", "lower"] as const).map((path) => {
                const bandwidth = path === "upper" ? "upperBandwidth" : "lowerBandwidth";
                const delay = path === "upper" ? "upperDelay" : "lowerDelay";
                return <fieldset key={path} className={base.fieldset}>
                  <legend>{path === "upper" ? "위 경로" : "아래 경로"}</legend>
                  <div className={base.field}><label htmlFor={`${id}-${bandwidth}`}>최소 대역폭</label><select id={`${id}-${bandwidth}`} value={input[bandwidth]} onChange={(event) => update({ [bandwidth]: Number(event.target.value) })}>
                    <option value="1000">1 Mbps</option><option value="10000">10 Mbps</option><option value="100000">100 Mbps</option><option value="1000000">1 Gbps</option>
                  </select></div>
                  <div className={styles.rangeField}><label htmlFor={`${id}-${delay}`}>누적 지연<output htmlFor={`${id}-${delay}`}>{input[delay]} μs</output></label><input id={`${id}-${delay}`} type="range" min="100" max="1000" step="10" value={input[delay]} onChange={(event) => update({ [delay]: Number(event.target.value) })} /></div>
                </fieldset>;
              })}
            </div>
            <p className={base.fieldHint}>Classic metric · K1=K3=1, 나머지 K=0. 256 × (10⁷ / 최소 kbps + 지연 μs / 10)</p>
            <div className={styles.presets}><button type="button" onClick={() => update({ upperBandwidth: 10000, lowerBandwidth: 100000, upperDelay: 200, lowerDelay: 300, failure: "none" })}>아래 경로 대역폭 개선</button></div>
          </>}

          {input.method === "bgp" && <>
            {(["upper", "lower"] as const).map((path) => {
              const key = path === "upper" ? "upperLocalPref" : "lowerLocalPref";
              return <div key={path} className={base.field}><label htmlFor={`${id}-${key}`}>{path === "upper" ? "위 경로" : "아래 경로"} LOCAL_PREF</label><select id={`${id}-${key}`} value={input[key]} onChange={(event) => update({ [key]: Number(event.target.value) })}>
                {[0, 100, 200, 300].map((value) => <option key={value} value={value}>{value}</option>)}
              </select></div>;
            })}
            <div className={styles.asPaths}><span>위 AS_PATH <b>65010 65040</b></span><span>아래 AS_PATH <b>65020 65030 65040</b></span></div>
            <p className={base.fieldHint}>WEIGHT 등 선행 조건은 동일합니다. LOCAL_PREF가 같을 때 AS_PATH 길이를 비교합니다. AS_PATH는 AS 목록이며 물리 라우터 수를 뜻하지 않습니다. 링크 장애는 해당 후보의 철회가 반영된 상태로 단순화합니다.</p>
            <div className={styles.presets}><button type="button" onClick={() => update({ upperLocalPref: 100, lowerLocalPref: 200, failure: "none" })}>LOCAL_PREF 우선</button><button type="button" onClick={() => update({ upperLocalPref: 100, lowerLocalPref: 100, failure: "none" })}>AS_PATH 비교</button></div>
          </>}

          {input.method === "pbr" && <>
            <label className={base.defaultToggle}><input type="checkbox" checked={input.policyMatch} onChange={(event) => update({ policyMatch: event.target.checked })} /><span><strong>트래픽이 정책 조건과 일치</strong><small>출발지 조건을 만족한 예제 패킷</small></span></label>
            <div className={`${base.field} ${styles.policyField}`}><label htmlFor={`${id}-policy-path`}>정책의 다음 홉</label><select id={`${id}-policy-path`} value={input.policyPath} onChange={(event) => update({ policyPath: event.target.value as RoutingLabInput["policyPath"] })}>
              <option value="upper">위 경로 · R2</option><option value="lower">아래 경로 · R3</option>
            </select></div>
            <p className={base.fieldHint}>일반 라우팅 테이블에는 R2를 향하는 정적 경로만 있습니다. 정책 미일치 또는 정책 다음 홉의 로컬 도달 불가 시 이 테이블을 조회합니다.</p>
            <div className={styles.presets}><button type="button" onClick={() => update({ policyMatch: true, policyPath: "lower", failure: "none" })}>아래 경로로 정책 지정</button><button type="button" onClick={() => update({ policyMatch: false, failure: "none" })}>정책 미일치</button></div>
          </>}

          <PlaybackControls {...playback} stepCount={simulation.steps.length} onStep={playback.goTo} onPlay={playback.togglePlay} onReset={reset} unit="패킷" />
          <div className={base.prediction} data-success={simulation.success}>
            <span className={base.eyebrow}>설정에 따른 최종 결과</span><strong>{simulation.title}</strong><p>{simulation.summary}</p>
          </div>
        </aside>
      </div>

      <div className={styles.decision}>
        <span className={base.eyebrow}>WHY THIS PATH?</span><p>{simulation.selectionBasis}</p>
        {simulation.equalCostPaths.length > 1 && <p className={styles.ecmp}>동일 비용 경로 2개를 함께 유지합니다. 3D 화면은 그중 위 경로를 이용하는 한 패킷을 보여 줍니다.</p>}
      </div>
      <div className={base.routeTableWrapper}>
        <table className={`${base.routeTable} ${styles.candidateTable}`}>
          <caption>R1의 후보 경로 비교<span>같은 목적지 192.0.2.0/24 · {method.name} 방식의 선택 기준</span></caption>
          <thead><tr><th scope="col">후보 경로</th><th scope="col">다음 홉</th><th scope="col">비교 값</th><th scope="col">결과와 이유</th></tr></thead>
          <tbody>{simulation.candidates.map((candidate) => <tr key={candidate.id} data-selected={candidate.selected} data-disabled={!candidate.available}>
            <th scope="row">{candidate.label}<small>{candidate.id === "upper" ? "R1 → R2 → R4" : "R1 → R3 → R5 → R4"}</small></th>
            <td><code>{candidate.nextHop}</code></td>
            <td>{candidate.metricLabel}</td>
            <td><span className={candidate.selected ? base.selectedRoute : base.routeMatch}>{candidate.id === simulation.selectedPath ? simulation.equalCostPaths.length > 1 ? "ECMP · 시연 경로" : "선택된 경로" : simulation.equalCostPaths.includes(candidate.id) ? "ECMP · 함께 설치" : !candidate.available ? "후보에서 제외" : "대기 후보"}</span><p>{candidate.reason}</p></td>
          </tr>)}</tbody>
        </table>
      </div>
      <SimulationSteps steps={simulation.steps} stepIndex={playback.stepIndex} onStep={playback.goTo} />
      <details className={styles.assumptions}><summary>실습의 구성과 생략한 동작</summary><ul>{simulation.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul><p>IPv6 버전·멀티캐스트·역사적 프로토콜은 전체 종류 및 본문에서 비교합니다. 실제 패킷을 보내거나 Cisco 장비를 설정하지 않습니다.</p></details>
    </section>
  );
}

export function RoutingCatalog({ onExplore }: { onExplore: (method: RoutingFamily) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("전체");
  const groups = ["전체", ...new Set(ROUTING_CATALOG.map((item) => item.group))];
  const normalized = query.trim().toLocaleLowerCase();
  const results = ROUTING_CATALOG.filter((item) => (group === "전체" || item.group === group) && [item.name, item.group, item.summary, item.criterion, item.routeCode, ...item.variants].join(" ").toLocaleLowerCase().includes(normalized));

  return <section className={base.demo} aria-labelledby={`${id}-catalog-title`}>
    <header className={base.demoHeader}><p className={base.eyebrow}>CISCO IP ROUTING / FIELD GUIDE</p><h3 id={`${id}-catalog-title`}>라우팅 종류를 한곳에서</h3><p>경로의 출처부터 동적 프로토콜, 정책 기능과 역사적 기술까지 구분해 살펴봅니다. 실제 지원 기능은 Cisco 장비·운영체제·버전·라이선스에 따라 달라집니다.</p></header>
    <div className={styles.catalogFilters}>
      <div><label htmlFor={`${id}-search`}>종류와 기술 검색</label><input id={`${id}-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="OSPF, IPv6, 기본 경로, VRF…" /></div>
      <div><label htmlFor={`${id}-group`}>분류</label><select id={`${id}-group`} value={group} onChange={(event) => setGroup(event.target.value)}>{groups.map((value) => <option key={value}>{value}</option>)}</select></div>
    </div>
    <p className={styles.catalogCount} role="status" aria-live="polite">{results.length} / {ROUTING_CATALOG.length}개 항목</p>
    {results.length === 0 ? <div className={styles.empty}>조건에 맞는 종류가 없습니다.<button type="button" onClick={() => { setQuery(""); setGroup("전체"); }}>검색 조건 초기화</button></div> : <div className={styles.catalogGrid}>
      {results.map((item) => <article key={item.id} className={styles.catalogCard}>
        <p className={base.eyebrow}>{item.group}</p><h4>{item.name}</h4><p>{item.summary}</p>
        <div className={styles.variants}>{item.variants.map((variant) => <span key={variant}>{variant}</span>)}</div>
        <dl><div><dt>기준</dt><dd>{item.criterion}</dd></div><div><dt>Cisco 표시</dt><dd>{item.routeCode}</dd></div></dl>
        <footer>{item.lab && <button type="button" onClick={() => onExplore(item.lab!)}>{methodName(item.lab)} 비교 실습 →</button>}<a href={item.sourceUrl} target="_blank" rel="noreferrer">공식 출처 ↗</a></footer>
      </article>)}
    </div>}
  </section>;
}
