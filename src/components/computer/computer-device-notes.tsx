import Link from "next/link";
import { getComputerCategory } from "@/lib/computer-categories";
import type { TopologyDevice } from "./computer-topology-devices";
import { ComputerNotesPanel } from "./computer-notes-panel";

type Question = { title: string; answer: string; article?: { href: string; label: string } };
const notes: Record<TopologyDevice, { caption: string; questions: Question[] }> = {
  router: {
    caption: "Cisco ISR 4331",
    questions: [
      { title: "라우터란", answer: "라우터는 서로 다른 IP 네트워크를 연결합니다. 패킷의 목적지 IP 주소를 보고 라우팅 테이블에서 다음에 보낼 곳을 찾습니다." },
      { title: "Routing (라우팅)", answer: "목적지 네트워크까지 패킷을 보낼 경로를 정하는 과정입니다. 관리자가 직접 경로를 지정하거나 라우터끼리 경로 정보를 교환할 수 있습니다.",
        article: { href: "/computer/routing", label: "라우팅 실습" } },
    ],
  },
  switch: {
    caption: "Cisco Catalyst C9200L-24T-4G",
    questions: [
      { title: "스위치란", answer: "스위치는 같은 LAN의 장비를 이더넷으로 연결합니다. 프레임을 받으면 출발지 MAC 주소와 포트를 기억하고, 목적지 MAC 주소를 이미 알면 해당 포트로 전달합니다." },
      { title: "VLAN이란", answer: "VLAN은 스위치에 연결된 장비를 논리적으로 나눈 네트워크입니다. 같은 스위치에 연결돼 있어도 서로 다른 VLAN 사이에서 통신하려면 라우팅이 필요합니다.",
        article: { href: "/computer/vlan", label: "VLAN 실습" } },
    ],
  },
  asa: {
    caption: "Cisco ASA 5506-X",
    questions: [
      { title: "ASA란", answer: "Cisco ASA는 네트워크 경계에서 트래픽을 검사하는 방화벽입니다. 출발지와 목적지, 서비스 등의 조건을 확인해 설정된 정책에 따라 통신을 허용하거나 차단합니다." },
      { title: "상태 기반 검사란", answer: "방화벽이 허용한 연결의 상태를 기록하는 방식입니다. 예를 들어 웹 서버에서 응답이 돌아오면, 방화벽은 그 패킷이 앞서 허용한 TCP 연결에 속하는지 확인합니다." },
    ],
  },
  server: {
    caption: "타워형 서버",
    questions: [
      { title: "DNS 서버란", answer: "도메인 이름에 관한 정보를 알려 주는 서버입니다. 브라우저는 DNS를 조회해 사이트 이름에 대응하는 IP 주소를 찾을 수 있습니다.",
        article: { href: "/computer/dns", label: "DNS 실습" } },
      { title: "DHCP 서버란", answer: "네트워크에 접속한 장비에 IP 주소를 일정 시간 임대합니다. 주소와 함께 기본 게이트웨이와 DNS 서버 주소도 알려 줄 수 있습니다.",
        article: { href: "/computer/dhcp", label: "DHCP 실습" } },
    ],
  },
  linux: {
    caption: "데스크톱 PC",
    questions: [
      { title: "리눅스란", answer: "Linux는 CPU 시간과 메모리 같은 자원을 관리하는 커널입니다. Debian과 Ubuntu 같은 배포판은 이 커널에 시스템 도구를 더해 운영체제로 제공합니다." },
      { title: "컨테이너란", answer: "프로그램을 필요한 파일과 함께 분리된 환경에서 실행하는 방식입니다. 같은 리눅스 호스트에서 실행하는 컨테이너들은 호스트의 커널을 공유합니다." },
    ],
  },
  "windows-server": {
    caption: "데스크톱 PC",
    questions: [
      { title: "Windows Server란", answer: "Microsoft의 서버 운영체제입니다. 필요한 서버 역할을 설치해 조직의 파일을 공유하거나 DNS와 웹 서비스를 제공할 수 있습니다." },
      { title: "도메인 서비스란", answer: "Active Directory 도메인 서비스는 사용자와 컴퓨터의 정보를 저장하고 로그인을 인증합니다. 관리자는 그룹 정책을 통해 도메인에 가입한 컴퓨터에 공통 설정을 적용할 수 있습니다." },
    ],
  },
};

export function ComputerDeviceNotes({ device }: { device: TopologyDevice | null }) {
  if (!device) return null;
  const entry = notes[device];
  return (
    <ComputerNotesPanel key={device} data-device-notes={device} id={`device-notes-${device}`}
      title={getComputerCategory(device)!.label} caption={entry.caption}
      items={entry.questions.map(({ title, answer, article }) => ({
        title,
        body: <>
          <p>{answer}</p>
          {article && <Link href={article.href}>{article.label}</Link>}
        </>,
      }))}
    />
  );
}
