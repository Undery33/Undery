import Link from "next/link";
import { getComputerCategory } from "@/lib/computer-categories";
import type { TopologyDevice } from "./computer-topology-devices";
import styles from "./computer-device-notes.module.css";

export type OverviewChapter = TopologyDevice | "network-basics";
type Question = { title: string; answer: string; article?: { href: string; label: string } };
const notes: Record<OverviewChapter, { role: string; questions: Question[] }> = {
  "network-basics": {
    role: "IPv4 주소와 통신 범위",
    questions: [
      { title: "IP 주소란", answer: "IP 주소는 네트워크에서 패킷을 주고받는 인터페이스의 주소입니다. 예를 들어 장비에 192.0.2.34/24가 설정되어 있다면 이 인터페이스의 IPv4 주소는 192.0.2.34입니다." },
      { title: "서브넷이란", answer: "같은 네트워크 접두사를 공유하는 주소 범위입니다. 192.0.2.34/24에서 /24는 앞 24비트가 네트워크를 나타낸다는 뜻이며, 이 장비가 속한 서브넷은 192.0.2.0/24입니다." },
      { title: "기본 게이트웨이란", answer: "목적지에 맞는 더 구체적인 경로가 없을 때 패킷을 넘겨줄 라우터입니다. 192.0.2.34/24 장비에 기본 게이트웨이를 192.0.2.1로 설정하면, 별도 경로가 없는 외부 주소로 보낼 패킷은 먼저 이 라우터로 갑니다." },
    ],
  },
  router: {
    role: "데이터 패킷 전송",
    questions: [
      { title: "라우터란", answer: "라우터는 서로 다른 IP 네트워크를 연결합니다. 패킷의 목적지 IP 주소를 보고 라우팅 테이블에서 다음에 보낼 곳을 찾습니다." },
      { title: "라우팅이란", answer: "목적지 네트워크까지 패킷을 보낼 경로를 정하는 과정입니다. 관리자가 직접 경로를 지정하거나 라우터끼리 경로 정보를 교환할 수 있습니다.",
        article: { href: "/computer/routing", label: "라우팅 실습" } },
    ],
  },
  switch: {
    role: "이더넷 프레임 전달",
    questions: [
      { title: "스위치란", answer: "스위치는 같은 LAN의 장비를 이더넷으로 연결합니다. 프레임을 받으면 출발지 MAC 주소와 포트를 기억하고, 목적지 MAC 주소를 이미 알면 해당 포트로 전달합니다." },
      { title: "VLAN이란", answer: "VLAN은 스위치에 연결된 장비를 논리적으로 나눈 네트워크입니다. 같은 스위치에 연결돼 있어도 서로 다른 VLAN 사이에서 통신하려면 라우팅이 필요합니다.",
        article: { href: "/computer/vlan", label: "VLAN 실습" } },
    ],
  },
  asa: {
    role: "방화벽 정책 적용",
    questions: [
      { title: "ASA란", answer: "Cisco ASA는 네트워크 경계에서 트래픽을 검사하는 방화벽입니다. 출발지와 목적지, 서비스 등의 조건을 확인해 설정된 정책에 따라 통신을 허용하거나 차단합니다." },
      { title: "상태 기반 검사란", answer: "방화벽이 허용한 연결의 상태를 기록하는 방식입니다. 예를 들어 웹 서버에서 응답이 돌아오면, 방화벽은 그 패킷이 앞서 허용한 TCP 연결에 속하는지 확인합니다." },
    ],
  },
  server: {
    role: "네트워크 서비스 제공",
    questions: [
      { title: "DNS 서버란", answer: "도메인 이름에 관한 정보를 알려 주는 서버입니다. 브라우저는 DNS를 조회해 사이트 이름에 대응하는 IP 주소를 찾을 수 있습니다.",
        article: { href: "/computer/dns", label: "DNS 실습" } },
      { title: "DHCP 서버란", answer: "네트워크에 접속한 장비에 IP 주소를 일정 시간 임대합니다. 주소와 함께 기본 게이트웨이와 DNS 서버 주소도 알려 줄 수 있습니다.",
        article: { href: "/computer/dhcp", label: "DHCP 실습" } },
    ],
  },
  linux: {
    role: "서버와 컨테이너 운영",
    questions: [
      { title: "리눅스란", answer: "Linux는 CPU 시간과 메모리 같은 자원을 관리하는 커널입니다. Debian과 Ubuntu 같은 배포판은 이 커널에 시스템 도구를 더해 운영체제로 제공합니다." },
      { title: "컨테이너란", answer: "프로그램을 필요한 파일과 함께 분리된 환경에서 실행하는 방식입니다. 같은 리눅스 호스트에서 실행하는 컨테이너들은 호스트의 커널을 공유합니다." },
    ],
  },
  "windows-server": {
    role: "계정과 서버 역할 관리",
    questions: [
      { title: "Windows Server란", answer: "Microsoft의 서버 운영체제입니다. 필요한 서버 역할을 설치해 조직의 파일을 공유하거나 DNS와 웹 서비스를 제공할 수 있습니다." },
      { title: "도메인 서비스란", answer: "Active Directory 도메인 서비스는 사용자와 컴퓨터의 정보를 저장하고 로그인을 인증합니다. 관리자는 그룹 정책을 통해 도메인에 가입한 컴퓨터에 공통 설정을 적용할 수 있습니다." },
    ],
  },
};

export function ComputerDeviceNotes({ device }: { device: OverviewChapter | null }) {
  const entry = device && notes[device];
  const basics = device === "network-basics";
  return (
    <section className={styles.notes} data-device-notes={device ?? ""} hidden={!device}
      aria-labelledby={device ? `device-notes-${device}` : undefined}>
      {device && entry && <>
        <header className={styles.heading}>
          <h2 lang={basics ? "ko" : "en"} id={`device-notes-${device}`}>
            {basics ? "네트워크 기초" : getComputerCategory(device)?.label}
          </h2>
          <p>{entry.role}</p>
        </header>
        <ol key={device} className={styles.questions}>
          {entry.questions.map(({ title, answer, article }, index) => (
            <li key={title}>
              <details>
                <summary><span aria-hidden="true">0{index + 1}.</span> {title}</summary>
                <div className={styles.answer}>
                  <p>{answer}</p>
                  {article && <Link href={article.href}>{article.label}</Link>}
                </div>
              </details>
            </li>
          ))}
        </ol>
      </>}
    </section>
  );
}
