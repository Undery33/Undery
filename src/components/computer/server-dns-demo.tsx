"use client";

import { useId, useState } from "react";
import {
  advanceDnsQuery, advanceDnsTime, changeDnsAuthority, clearDnsCache, createDnsState,
  dnsDomain, dnsTtlSeconds, isDnsInProgress, remainingSeconds, startDnsQuery,
  type DnsPhase, type DnsState,
} from "@/lib/server-demos";
import styles from "./server-demo.module.css";

const labels: Record<DnsPhase, string> = {
  ready: "질의 준비", "client-query": "클라이언트 → 재귀 리졸버", "cache-miss": "캐시 MISS",
  "cache-hit": "캐시 HIT", "root-query": "리졸버 → 루트 서버", "root-referral": "루트 서버 → 리졸버",
  "tld-query": "리졸버 → .com 서버", "tld-referral": ".com 서버 → 리졸버",
  "authoritative-query": "리졸버 → 권한 서버", "authoritative-answer": "권한 서버 → 리졸버", complete: "리졸버 → 클라이언트",
};

function describeStep(state: DnsState) {
  switch (state.phase) {
    case "ready": return "example.com의 A 레코드를 조회합니다. 질의를 시작한 뒤 단계별로 메시지를 따라가십시오.";
    case "client-query": return "클라이언트가 재귀 리졸버에 최종 답을 요청했습니다. 먼저 리졸버의 캐시를 확인합니다.";
    case "cache-miss": return "사용할 수 있는 A 레코드가 없습니다. 리졸버가 위임 정보를 따라 권한 서버를 찾습니다.";
    case "cache-hit": return `캐시된 주소는 ${state.answer}입니다. 루트·TLD·권한 서버에 질의하지 않습니다.`;
    case "root-query": return "리졸버가 루트 서버에 질의합니다. 이 예시의 루트 서버는 .com을 담당하는 서버를 안내합니다.";
    case "root-referral": return ".com 네임서버에 대한 위임 응답입니다. example.com의 최종 A 레코드는 아직 받지 않았습니다.";
    case "tld-query": return "리졸버가 안내받은 .com 네임서버에 example.com의 정보를 묻습니다.";
    case "tld-referral": return "example.com의 권한 네임서버를 안내하는 위임 응답입니다. 최종 A 레코드 응답과 구분합니다.";
    case "authoritative-query": return "리졸버가 example.com의 레코드를 관리하는 권한 서버에 A 레코드를 요청합니다.";
    case "authoritative-answer": return `권한 서버가 A 레코드 ${state.answer}, TTL ${dnsTtlSeconds}초를 응답했습니다. 리졸버가 결과를 캐시합니다.`;
    case "complete": return `클라이언트가 주소 ${state.answer}에 대한 응답을 받았습니다. 다시 질의하거나 가상 시간을 진행해 캐시 동작을 비교하십시오.`;
  }
}

const nodes = [
  { id: "client", x: 20, y: 151, width: 180, label: "클라이언트", detail: "A 레코드 질의" },
  { id: "resolver", x: 280, y: 151, width: 210, label: "재귀 리졸버", detail: "질의 수행 · 캐시" },
  { id: "root", x: 620, y: 20, width: 230, label: "루트 서버  .", detail: ".com 서버로 위임" },
  { id: "tld", x: 620, y: 151, width: 230, label: "TLD 서버  .com", detail: "example.com 서버로 위임" },
  { id: "authority", x: 620, y: 282, width: 230, label: "권한 서버", detail: "example.com 레코드 관리" },
] as const;

function activeConnection(phase: DnsPhase) {
  switch (phase) {
    case "client-query": return { path: "M200 189H280", participants: ["client", "resolver"] };
    case "root-query": return { path: "M490 189H550V58H620", participants: ["resolver", "root"] };
    case "root-referral": return { path: "M620 58H550V189H490", participants: ["root", "resolver"] };
    case "tld-query": return { path: "M490 189H620", participants: ["resolver", "tld"] };
    case "tld-referral": return { path: "M620 189H490", participants: ["tld", "resolver"] };
    case "authoritative-query": return { path: "M490 189H550V320H620", participants: ["resolver", "authority"] };
    case "authoritative-answer": return { path: "M620 320H550V189H490", participants: ["authority", "resolver"] };
    case "complete": return { path: "M280 189H200", participants: ["resolver", "client"] };
    case "cache-hit":
    case "cache-miss": return { path: "", participants: ["resolver"] };
    default: return { path: "", participants: [] };
  }
}

export function DnsDemo() {
  const id = useId();
  const [state, setState] = useState(createDnsState);
  const busy = isDnsInProgress(state);
  const ttl = state.cache ? remainingSeconds(state.cache.expiresAt, state.now) : 0;
  const connection = activeConnection(state.phase);
  const arrowId = `${id}-dns-arrow`;

  return (
    <section className={styles.demo} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>DNS / QUERY LAB</p><h3 id={`${id}-title`}>이름이 주소가 되는 경로</h3></div>
        <span className={styles.badge}>문서 기반 시뮬레이션</span>
      </header>
      <p className={styles.intro}>실제 DNS 서버에 접속하지 않습니다. 예제 레코드와 가상 시간을 조작해 위임 응답과 캐시를 확인합니다.</p>

      <div className={styles.toolbar}>
        <label className={styles.field} htmlFor={`${id}-domain`}>질의할 이름<input id={`${id}-domain`} value={dnsDomain} readOnly /></label>
        <div className={styles.staticField}><span>레코드</span><strong>A · IPv4</strong></div>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={() => setState((previous) => isDnsInProgress(previous) ? advanceDnsQuery(previous) : startDnsQuery(previous))}>
            {busy ? "다음 단계" : state.phase === "complete" ? "다시 질의" : "질의 시작"}<span aria-hidden="true"> →</span>
          </button>
          <button type="button" onClick={() => setState(createDnsState())}>초기화</button>
        </div>
      </div>

      <div className={styles.workspace}>
        <div className={styles.visualPanel}>
          <div className={styles.panelHeading}><span>질의 경로</span><span>{state.history.length ? `${state.history.length}단계` : "대기"}</span></div>
          <svg className={styles.networkDesktop} viewBox="0 0 890 380" role="img" aria-labelledby={`${id}-graph-title`}>
            <title id={`${id}-graph-title`}>{`클라이언트와 리졸버, 루트·TLD·권한 서버의 질의 경로. 현재: ${labels[state.phase]}`}</title>
            <defs><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="currentColor" /></marker></defs>
            <path className={styles.wire} d="M200 189H280 M490 189H620 M490 189H550V58H620 M550 189V320H620" />
            {connection.path && <path className={styles.activeWire} d={connection.path} markerEnd={`url(#${arrowId})`} />}
            {nodes.map((node) => (
              <g className={connection.participants.includes(node.id) ? styles.nodeActive : styles.node} key={node.id}>
                <rect x={node.x} y={node.y} width={node.width} height="76" />
                <text x={node.x + 17} y={node.y + 31} className={styles.nodeTitle}>{node.label}</text>
                <text x={node.x + 17} y={node.y + 54} className={styles.nodeDetail}>{node.detail}</text>
              </g>
            ))}
          </svg>
          <ul className={styles.networkMobile} aria-label="DNS 참여 서버">
            {nodes.map((node) => <li className={connection.participants.includes(node.id) ? styles.mobileNodeActive : undefined} key={node.id}><strong>{node.label}</strong><span>{node.detail}</span></li>)}
          </ul>
          <div className={styles.status} role="status" aria-live="polite" aria-atomic="true">
            <p className={styles.statusTitle}>{labels[state.phase]}</p>
            <p>{describeStep(state)}</p>
            <p className={styles.statusMeta}>가상 시간 {state.now}초 · 캐시 TTL {ttl}초 · 권한 서버 주소 {state.authoritativeAddress}</p>
          </div>
        </div>

        <aside className={styles.cachePanel} aria-label="DNS 캐시 상태">
          <div className={styles.panelHeading}><span>리졸버의 A 레코드 캐시</span><span className={styles.mono}>{state.cache ? ttl > 0 ? "VALID" : "EXPIRED" : "EMPTY"}</span></div>
          <dl className={styles.record}>
            <div><dt>이름</dt><dd>{dnsDomain}</dd></div>
            <div><dt>캐시 주소</dt><dd>{state.cache?.address ?? "저장된 레코드 없음"}</dd></div>
            <div><dt>남은 TTL</dt><dd className={styles.ttlValue}>{ttl}<span>초</span></dd></div>
          </dl>
          <progress className={styles.ttl} max={dnsTtlSeconds} value={ttl} aria-label={`캐시 TTL ${ttl}초 남음`} />
          <div className={styles.counters}><span>HIT <strong>{state.cacheHits}</strong></span><span>MISS <strong>{state.cacheMisses}</strong></span></div>
          <div className={styles.clock}><span>가상 시간</span><strong>{state.now}초</strong></div>
          <div className={styles.stackActions}>
            <button type="button" disabled={busy} onClick={() => setState((previous) => advanceDnsTime(previous, 30))}>30초 경과</button>
            <button type="button" disabled={busy || !state.cache} onClick={() => setState(clearDnsCache)}>캐시 비우기</button>
          </div>
          <div className={styles.authorityRecord}>
            <span>권한 서버의 현재 A 레코드</span><strong>{state.authoritativeAddress}</strong>
            <button type="button" disabled={busy} onClick={() => setState(changeDnsAuthority)}>원본 레코드 변경</button>
            <small>원본을 바꿔도 남은 TTL 동안 캐시 주소를 응답합니다.</small>
          </div>
        </aside>
      </div>

      {state.history.length > 0 && <ol className={styles.eventList} aria-label="이번 질의의 진행 기록">{state.history.map((phase, index) => <li key={`${phase}-${index}`} aria-current={index === state.history.length - 1 ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{labels[phase]}</li>)}</ol>}
      <p className={styles.note}>TTL은 버튼으로만 흐릅니다. 이 모형은 A 레코드 캐시에 집중하며 위임 정보의 캐시, CNAME, DNSSEC, 만료 레코드의 예외적 응답 정책은 생략합니다. 203.0.113.0/24는 문서용 주소입니다.</p>
    </section>
  );
}
