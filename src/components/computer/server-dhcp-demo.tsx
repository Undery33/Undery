"use client";

import { useId, useState } from "react";
import {
  advanceDhcpExchange, advanceDhcpTime, configureDhcpReservation, createDhcpState,
  dhcpClients, dhcpLeaseSeconds, dhcpPool, getActiveDhcpLeases, isDhcpInProgress,
  remainingSeconds, selectDhcpClient, startDhcpExchange, type DhcpClientId, type DhcpState,
} from "@/lib/server-demos";
import styles from "./server-demo.module.css";

const stages = [
  { id: "discover", letter: "D", name: "Discover", detail: "서버 찾기" },
  { id: "offer", letter: "O", name: "Offer", detail: "주소 제안" },
  { id: "request", letter: "R", name: "Request", detail: "제안 선택" },
  { id: "ack", letter: "A", name: "ACK", detail: "임대 확정" },
] as const;

function messageFor(state: DhcpState) {
  switch (state.phase) {
    case "ready": return { title: "할당 준비", detail: "클라이언트를 선택하고 Discover를 보내십시오. ACK 전에는 확정된 임대가 없습니다.", name: "DORA", direction: "none" };
    case "discover": return { title: "DHCPDISCOVER · 클라이언트 → 서버", detail: "아직 주소가 없는 클라이언트가 로컬 네트워크에 서버를 찾는 메시지를 브로드캐스트했습니다.", name: "DHCPDISCOVER", direction: "right" };
    case "offer": return { title: "DHCPOFFER · 서버 → 클라이언트", detail: `${state.offeredAddress}을 제안했습니다. 이 실습에서는 주소를 잠시 보류하지만 임대 목록에는 아직 기록하지 않습니다.`, name: "DHCPOFFER", direction: "left" };
    case "request": return { title: "DHCPREQUEST · 클라이언트 → 서버", detail: `클라이언트가 선택한 서버와 주소 ${state.offeredAddress}을 알립니다. 이 최초 할당 단계의 Request도 브로드캐스트입니다.`, name: "DHCPREQUEST", direction: "right" };
    case "ack": return { title: "DHCPACK · 서버 → 클라이언트", detail: `${state.offeredAddress}의 ${dhcpLeaseSeconds}초 임대를 확정했습니다. 아래 임대 목록에서 남은 시간을 확인할 수 있습니다.`, name: "DHCPACK", direction: "left" };
    case "exhausted": return { title: "주소 풀 고갈 · Offer 없음", detail: "이 클라이언트에 제안할 주소가 없습니다. 다른 클라이언트의 임대가 만료되면 다시 시도할 수 있습니다. 예약 주소는 예약된 클라이언트에게만 제공합니다.", name: "OFFER 없음", direction: "none" };
    case "nak": return { title: "DHCPNAK · 할당 거절", detail: "요청한 주소를 확정할 수 없습니다. 새 임대를 만들지 않았으며 클라이언트는 다시 할당 절차를 시작해야 합니다.", name: "DHCPNAK", direction: "left" };
  }
}

export function DhcpDemo() {
  const id = useId();
  const [state, setState] = useState(() => createDhcpState());
  const busy = isDhcpInProgress(state);
  const leases = getActiveDhcpLeases(state);
  const currentClient = dhcpClients.find((client) => client.id === state.clientId)!;
  const currentLease = leases.find((lease) => lease.clientId === state.clientId);
  const message = messageFor(state);
  const stepIndex = stages.findIndex((stage) => stage.id === state.phase);
  const buttonLabel = state.phase === "discover" ? "Offer 확인" : state.phase === "offer" ? "Request 보내기" : state.phase === "request" ? "ACK 확인" : currentLease ? "임대 완료" : "Discover 보내기";

  return (
    <section className={styles.demo} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>DHCPv4 / LEASE LAB</p><h3 id={`${id}-title`}>주소 제안에서 임대 확정까지</h3></div>
        <span className={styles.badge}>문서 기반 시뮬레이션</span>
      </header>
      <p className={styles.intro}>가상의 로컬 네트워크 192.168.10.0/24에서 네 주소를 나눠 줍니다. 실제 기기의 네트워크 설정은 바뀌지 않습니다.</p>
      <div className={styles.toolbar}>
        <label className={styles.field} htmlFor={`${id}-client`}>요청할 클라이언트
          <select id={`${id}-client`} value={state.clientId} disabled={busy} onChange={(event) => { const clientId = event.target.value as DhcpClientId; setState((previous) => selectDhcpClient(previous, clientId)); }}>
            {dhcpClients.map((client) => <option key={client.id} value={client.id}>{client.label}{leases.some((lease) => lease.clientId === client.id) ? " · 임대 중" : ""}</option>)}
          </select>
        </label>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" disabled={!busy && Boolean(currentLease)} onClick={() => setState((previous) => isDhcpInProgress(previous) ? advanceDhcpExchange(previous) : startDhcpExchange(previous))}>{buttonLabel}<span aria-hidden="true"> →</span></button>
          <button type="button" onClick={() => setState(createDhcpState())}>초기화</button>
          <button type="button" onClick={() => setState(createDhcpState("full"))}>고갈 예시</button>
        </div>
      </div>

      <label className={styles.reservation} htmlFor={`${id}-reservation`}>
        <input id={`${id}-reservation`} type="checkbox" checked={state.reserveForA} disabled={busy || leases.length > 0} onChange={(event) => { const enabled = event.target.checked; setState((previous) => configureDhcpReservation(previous, enabled)); }} />
        <span>클라이언트 A에 <strong>192.168.10.103</strong> 예약<span className={styles.help}>예약은 임대가 없는 상태에서 설정합니다. 변경하려면 초기화하거나 모든 임대가 만료될 때까지 시간을 진행합니다.</span></span>
      </label>

      <ol className={styles.doraSteps} aria-label="DORA 진행 상태">
        {stages.map((stage, index) => <li key={stage.id} className={index === stepIndex ? styles.stageActive : state.history.includes(stage.id) ? styles.stageDone : undefined} aria-current={index === stepIndex ? "step" : undefined}><span>{stage.letter}</span><div><strong>{stage.name}</strong><small>{stage.detail}</small></div></li>)}
      </ol>

      <div className={styles.exchange} aria-label="현재 DHCP 메시지 흐름">
        <div className={styles.endpoint}><span>CLIENT</span><strong>{currentClient.label}</strong><small>{currentClient.mac}</small></div>
        <div className={styles.packet}><strong>{message.name}</strong><span className={styles.packetArrow} aria-hidden="true">{message.direction === "right" ? "⟶" : message.direction === "left" ? "⟵" : "···"}</span><small>{state.offeredAddress ?? "주소 미확정"}</small></div>
        <div className={styles.endpoint}><span>SERVER</span><strong>DHCP 서버</strong><small>192.168.10.1</small></div>
      </div>
      <div className={styles.status} role="status" aria-live="polite" aria-atomic="true">
        <p className={styles.statusTitle}>{message.title}</p>
        <p>{message.detail}</p>
        <p className={styles.statusMeta}>가상 시간 {state.now}초 · 유효한 임대 {leases.length}개{state.phase === "ack" && !currentLease ? " · 마지막으로 확정한 임대는 만료되었습니다." : currentLease ? ` · ${currentClient.label}의 임대 ${remainingSeconds(currentLease.expiresAt, state.now)}초 남음` : ""}</p>
      </div>

      <div className={styles.leaseWorkspace}>
        <div className={styles.poolPanel}>
          <div className={styles.panelHeading}><span>주소 풀 · 192.168.10.100–103</span><span>4개</span></div>
          <div className={styles.pool}>
            {dhcpPool.map((address) => {
              const lease = leases.find((item) => item.address === address);
              const offered = (state.phase === "offer" || state.phase === "request") && state.offeredAddress === address;
              const reserved = state.reserveForA && address === dhcpPool[3];
              const owner = lease ? dhcpClients.find((client) => client.id === lease.clientId)!.label.replace("클라이언트 ", "") : null;
              const status = lease ? `${owner} 임대 중` : offered ? "제안 중" : reserved ? "A 전용 예약" : "사용 가능";
              return <div key={address} className={`${styles.poolAddress} ${lease ? styles.addressLeased : offered ? styles.addressOffered : reserved ? styles.addressReserved : ""}`} aria-label={`${address}, ${status}`}><strong>.{address.split(".").at(-1)}</strong><span>{status}</span>{lease && <small>{remainingSeconds(lease.expiresAt, state.now)}초</small>}</div>;
            })}
          </div>
          <p className={styles.help}>제안 중인 주소와 확정된 임대를 구분합니다. 예약은 A가 요청할 때 사용할 주소를 지정하는 설정입니다.</p>
          <div className={styles.clock}><span>가상 시간 <strong>{state.now}초</strong></span><button type="button" disabled={busy} onClick={() => setState((previous) => advanceDhcpTime(previous, 60))}>60초 경과</button></div>
        </div>
        <div className={styles.leasePanel}>
          <div className={styles.panelHeading}><span>확정된 임대</span><span>임대 시간 {dhcpLeaseSeconds}초</span></div>
          {leases.length === 0 ? <p className={styles.empty}>현재 유효한 임대가 없습니다.<br />ACK를 받은 주소가 여기에 표시됩니다.</p> : <div className={styles.tableScroll}><table className={styles.leaseTable}><caption className={styles.srOnly}>현재 유효한 DHCP 임대 목록</caption><thead><tr><th scope="col">클라이언트</th><th scope="col">주소</th><th scope="col">남은 시간</th></tr></thead><tbody>{leases.map((lease) => <tr key={lease.address}><td>{dhcpClients.find((client) => client.id === lease.clientId)!.label.replace("클라이언트 ", "")}</td><td>{lease.address}</td><td>{remainingSeconds(lease.expiresAt, state.now)}초</td></tr>)}</tbody></table></div>}
          <div className={styles.options}><span>ACK에 포함하는 예제 설정</span><dl><div><dt>서브넷 마스크</dt><dd>255.255.255.0</dd></div><div><dt>기본 게이트웨이</dt><dd>192.168.10.1</dd></div><div><dt>DNS 서버</dt><dd>192.168.10.53</dd></div></dl></div>
        </div>
      </div>
      <p className={styles.note}>‘고갈 예시’는 A~D가 네 주소를 임대한 상태를 불러옵니다. 가상 시간을 120초 진행하면 주소가 다시 사용 가능해집니다. 최초 IPv4 할당에 집중한 모형이며 재전송, 릴레이, 충돌 검사와 T1/T2 갱신은 생략합니다.</p>
    </section>
  );
}
