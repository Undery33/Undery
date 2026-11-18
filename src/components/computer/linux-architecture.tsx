import { useId, type CSSProperties, type ReactNode } from "react";
import kubernetes from "./linux-architecture-marks/kubernetes.png";
import jenkins from "./linux-architecture-marks/jenkins.png";
import docker from "./linux-architecture-marks/docker.svg";
import styles from "./linux-architecture.module.css";

// Each topology is independent. Kubernetes components: kubernetes.io/docs/concepts/overview/components/
// Distributed builds: jenkins.io/doc/book/scaling/architecting-for-scale/
// Docker architecture: docs.docker.com/get-started/docker-overview/#docker-architecture
function Diagram({ name, label, viewBox, children }: {
  name: string; label: string; viewBox: string; children: ReactNode;
}) {
  const arrow = useId();
  return (
    <svg data-architecture={name} role="img" aria-label={label} viewBox={viewBox}
      className={styles.diagram} style={{ "--arrow": `url(#${arrow})` } as CSSProperties}>
      <defs><marker id={arrow} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
        <path d="m0 .4 4 2.1-4 2.1" fill="none" stroke="currentColor" strokeWidth=".9" />
      </marker></defs>
      {children}
    </svg>
  );
}

function Wire({ d }: { d: string }) {
  return <path data-edge="" d={d} className={styles.wire} />;
}

function Rack() {
  return <g className={styles.equipment}>
    <path d="m-16-12 9-6 23 3-9 6Z" />
    <path d="m7-9 9-6v24l-9 6Z" className={styles.shade} />
    <path d="m-16-12 23 3v24l-23-3Z" />
    {[-6, 0, 6].map(y => <g key={y} transform={`translate(-12 ${y}) skewY(7)`}>
      <path d="M0 0h10m3 0h1.3" className={styles.detail} />
    </g>)}
  </g>;
}

function Database() {
  return <g className={styles.equipment}>
    <path d="M-11-6v15c0 5 22 5 22 0V-6" className={styles.shade} />
    <ellipse cy="-6" rx="11" ry="4" /><path d="M-11-.5c0 5 22 5 22 0M-11 5c0 5 22 5 22 0" fill="none" />
  </g>;
}

function Chip() {
  return <g className={styles.equipment}>
    <path d="M-12-7h-4m4 7h-4m4 7h-4m28-14h4m-4 7h4m-4 7h4M-7-12v-4m7 4v-4m7 4v-4M-7 12v4m7-4v4m7-4v4" fill="none" />
    <rect x="-12" y="-12" width="24" height="24" rx="4" /><rect x="-6" y="-6" width="12" height="12" rx="1" className={styles.shade} />
  </g>;
}

function Cube() {
  return <g className={styles.equipment}>
    <path d="m-9-4 9-5 9 5-9 5Z" /><path d="m-9-4 9 5v11l-9-5Z" />
    <path d="m0 1 9-5V7l-9 5Z" className={styles.shade} />
  </g>;
}

function Pod() {
  return <g className={styles.equipment}>
    <path d="m-14-12 13-5 15 5 5 14-9 12h-20l-9-12Z" />
    <g transform="translate(-6 -1) scale(.65)"><Cube /></g>
    <g transform="translate(5 3) scale(.65)"><Cube /></g>
  </g>;
}

function Worker({ y }: { y: number }) {
  return <g transform={`translate(0 ${y})`}>
    <rect className={styles.enclosure} x="172" y="-26" width="177" height="53" rx="9" />
    <Wire d="M207 3h14v-20h44v5" /><Wire d="M221-17h100v5" />
    <circle className={styles.junction} cx="221" cy="-17" r="2" />
    <g data-node="kubelet" transform="translate(193 3) scale(.87)"><Chip /></g>
    <g data-node="pod" transform="translate(265 5) scale(.92)"><Pod /></g>
    <g data-node="pod" transform="translate(321 5) scale(.92)"><Pod /></g>
  </g>;
}

function Terminal() {
  return <g className={styles.equipment}>
    <rect x="-16" y="-13" width="32" height="23" rx="2" /><path d="M-16-7h32M-10-10h.1m3.2 0h.1" fill="none" />
    <path d="m-9-2 4 3-4 3m8 .5h5" className={styles.detail} />
    <path d="M-4 10v4m8-4v4m-11 1H7" fill="none" />
  </g>;
}

function Folder() {
  return <g className={styles.equipment}>
    <path d="M-14 9V-9h9l3 3h15V9Z" className={styles.shade} />
    <path d="M-15-2h30l-4 13h-23Z" />
    <path d="M-8 2h9" className={styles.detail} />
  </g>;
}

function BuildAgent({ y }: { y: number }) {
  return <g transform={`translate(0 ${y})`}>
    <rect className={styles.enclosure} x="142" y="-23" width="118" height="46" rx="7" />
    <Wire d="M179 1h42" />
    <g data-node="agent" transform="translate(163 0) scale(.9)"><Terminal /></g>
    <g data-node="workspace" transform="translate(237 0)"><Folder /></g>
  </g>;
}

export function LinuxArchitecture() {
  return (
    <div className={styles.screen} data-linux-architecture="">
      <Diagram name="kubernetes" viewBox="0 0 355 131"
        label="Kubernetes (K8s). 컨트롤 플레인의 API 서버가 etcd에 상태를 저장합니다. 각 워커 노드의 kubelet은 API로 Pod 명세를 확인하고 컨테이너 런타임을 통해 Pod를 관리합니다.">
        <rect className={styles.enclosure} x="4" y="15" width="113" height="99" rx="10" />
        <image data-brand="kubernetes" href={kubernetes.src} x="11" y="21" width="37" height="37" />
        <Wire d="M70 70 52 84H42" />
        <g data-node="etcd" transform="translate(30 88)"><Database /></g>
        <g data-node="api-server" transform="translate(80 65) scale(1.14)"><Rack /></g>
        <Wire d="M98 60h44V36h35" /><Wire d="M142 60v39h35" />
        <circle className={styles.junction} cx="142" cy="60" r="2.2" />
        <Worker y={33} /><Worker y={96} />
      </Diagram>
      <Diagram name="jenkins" viewBox="0 0 267 119"
        label="Jenkins. 컨트롤러가 연결된 에이전트에 빌드를 배정합니다. 각 에이전트는 자신의 작업 디렉터리에서 빌드를 실행합니다.">
        <image data-brand="jenkins" href={jenkins.src} x="5" y="35" width="36" height="49" />
        <g data-node="controller" transform="translate(72 61) scale(1.08)"><Rack /></g>
        <Wire d="M89 58h24V32h33" />
        <Wire d="M113 58v30h33" />
        <circle className={styles.junction} cx="113" cy="58" r="2.2" />
        <BuildAgent y={30} /><BuildAgent y={87} />
      </Diagram>
      <Diagram name="docker" viewBox="0 0 260 119"
        label="Docker. CLI의 API 요청을 받은 Docker Engine 데몬은 이미지를 관리하고 그 이미지로 컨테이너를 만들고 실행합니다.">
        <g data-node="cli" transform="translate(24 68)"><Terminal /></g>
        <Wire d="M41 67h63" />
        <rect className={styles.enclosure} x="85" y="8" width="82" height="101" rx="10" />
        <image data-brand="docker" href={docker.src} x="100" y="13" width="52" height="37" />
        <g data-node="engine" transform="translate(126 68) scale(1.15)"><Chip /></g>
        <Wire d="M145 68h36V32h24" /><Wire d="M181 68v23h21" />
        <circle className={styles.junction} cx="181" cy="68" r="2.2" />
        <g data-node="images" transform="translate(227 31)" className={styles.equipment}>
          <path d="m-17 7 17-8 17 8-17 8Z" className={styles.shade} />
          <path d="m-17 2 17-8 17 8-17 8Z" /><path d="m-17-3 17-8 17 8-17 8Z" />
        </g>
        <g data-node="containers" transform="translate(222 88)"><Cube />
          <g transform="translate(14 6)"><Cube /></g>
        </g>
      </Diagram>
    </div>
  );
}
