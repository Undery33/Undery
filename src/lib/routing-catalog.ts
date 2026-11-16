export type RoutingFamily = "static" | "rip" | "ospf" | "eigrp" | "isis" | "bgp" | "pbr";

export type RoutingCatalogItem = {
  id: string;
  name: string;
  group: "직접 연결" | "정적 라우팅" | "동적 IGP" | "BGP" | "정책·분리·멀티캐스트" | "오버레이·SD-WAN" | "역사·특수 목적";
  summary: string;
  variants: string[];
  criterion: string;
  routeCode: string;
  /** A representative family lab, not an emulator of every listed variant. */
  lab?: RoutingFamily;
  sourceUrl: string;
};

/** Cisco's IP routing taxonomy, with protocols separated from route forms and supporting features. */
export const ROUTING_CATALOG: RoutingCatalogItem[] = [
  {
    id: "connected-local", name: "직접 연결 · 로컬 경로", group: "직접 연결",
    summary: "C는 인터페이스에 연결된 네트워크입니다. L은 라우터 자신의 인터페이스 주소를 가리킵니다. 이웃과 경로를 교환하는 프로토콜이 아닙니다.",
    variants: ["Connected", "Local", "IPv4 /32", "IPv6 /128"], criterion: "인터페이스 주소와 동작 상태", routeCode: "C / L",
    sourceUrl: "https://www.cisco.com/c/en/us/support/docs/ip/ip-routing/116264-technote-ios-00.html",
  },
  {
    id: "static", name: "정적 라우팅", group: "정적 라우팅",
    summary: "관리자가 목적지 프리픽스와 다음 홉 또는 출력 인터페이스를 지정합니다. IPv4와 IPv6의 네트워크 경로·호스트 경로를 구성할 수 있습니다.",
    variants: ["Static", "네트워크 경로", "호스트 경로", "재귀 조회", "출력 인터페이스", "Fully specified", "IPv6 static"], criterion: "수동 설정 · 유효한 다음 홉", routeCode: "S", lab: "static",
    sourceUrl: "https://www.cisco.com/c/en/us/support/docs/dial-access/floating-static-route/118263-technote-nexthop-00.html",
  },
  {
    id: "default", name: "기본 경로", group: "정적 라우팅",
    summary: "IPv4 0.0.0.0/0과 IPv6 ::/0입니다. 더 구체적으로 일치하는 경로가 없을 때 사용합니다. 정적으로 만들거나 동적 프로토콜로 배울 수 있습니다.",
    variants: ["Default route", "0.0.0.0/0", "::/0", "Gateway of last resort"], criterion: "최장 프리픽스 일치의 마지막 후보", routeCode: "예: S* · 출처에 따라 다름",
    sourceUrl: "https://www.rfc-editor.org/rfc/rfc1812.html#section-5.2.4.3",
  },
  {
    id: "floating-static", name: "플로팅 정적 경로", group: "정적 라우팅",
    summary: "주 경로보다 높은 관리 거리로 구성한 예비 정적 경로입니다. 주 경로가 라우팅 테이블에서 빠져야 사용됩니다. 원격 장애 감지에는 별도 추적이 필요할 수 있습니다.",
    variants: ["Floating static", "Administrative distance", "IP SLA", "Object tracking"], criterion: "주 경로 철회 후 예비 경로 설치", routeCode: "S", lab: "static",
    sourceUrl: "https://www.cisco.com/c/en/us/support/docs/dial-access/floating-static-route/118263-technote-nexthop-00.html",
  },
  {
    id: "summary-discard", name: "요약 · 폐기 경로", group: "정적 라우팅",
    summary: "요약 경로는 여러 프리픽스를 묶습니다. Null0로 향하는 경로가 선택되면 패킷을 폐기합니다. 요약 범위 안의 미사용 목적지로 발생하는 루프를 막는 데 사용할 수 있습니다.",
    variants: ["Summary route", "Aggregate", "Null0", "Discard", "Blackhole"], criterion: "프리픽스 집계 · 의도한 폐기", routeCode: "정적 구성은 S",
    sourceUrl: "https://www.cisco.com/c/en/us/support/docs/ip/ip-routed-protocols/14956-route-to-null-interface.html",
  },
  {
    id: "ripv2", name: "RIPv2", group: "동적 IGP",
    summary: "홉 수로 IPv4 경로를 비교하는 거리 벡터 프로토콜입니다. 서브넷 마스크를 전달하며 15홉까지 유효합니다. 16은 도달 불가능을 뜻합니다.",
    variants: ["RIP version 2", "거리 벡터", "Hop count", "VLSM"], criterion: "최소 홉 수", routeCode: "R", lab: "rip",
    sourceUrl: "https://www.rfc-editor.org/rfc/rfc2453.html",
  },
  {
    id: "ripng", name: "RIPng", group: "동적 IGP",
    summary: "IPv6를 위한 RIP 계열입니다. 홉 수를 사용하는 방식은 이어지지만 RIPv2와는 별도의 IPv6 메시지 형식과 프로세스를 사용합니다.",
    variants: ["RIP for IPv6", "RIP v6", "IPv6", "거리 벡터"], criterion: "최소 홉 수 · 16은 도달 불가능", routeCode: "R",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-routing/b-ip-routing/m_ip6-rip-xe.html",
  },
  {
    id: "ospfv2", name: "OSPFv2", group: "동적 IGP",
    summary: "링크 상태를 공유하고 SPF로 IPv4 경로를 계산합니다. 같은 경로 유형 안에서 누적 Cost를 비교합니다. 홉 수나 화면 속 케이블 길이로 고르지 않습니다.",
    variants: ["OSPF", "링크 상태", "SPF", "Area 0", "Intra-area", "Inter-area", "External", "NSSA"], criterion: "경로 유형 · 누적 Cost", routeCode: "O / O IA / O E1·E2 / O N1·N2", lab: "ospf",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr3-fwd/ospf/ospf-configuration-guide/ospf.html",
  },
  {
    id: "ospfv3", name: "OSPFv3", group: "동적 IGP",
    summary: "IPv6에서 사용하는 OSPF 계열입니다. Cisco의 OSPFv3 Address Families 기능을 지원하는 구성에서는 IPv4 경로도 처리할 수 있습니다.",
    variants: ["IPv6 OSPF", "IPv4 address family", "IPv6 address family", "링크 상태"], criterion: "주소 계열별 LSDB와 SPF", routeCode: "O 계열",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-routing/b-ip-routing/m_ip6-route-ospfv3-add-fam-xe.html",
  },
  {
    id: "eigrp", name: "EIGRP", group: "동적 IGP",
    summary: "DUAL을 사용하는 고급 거리 벡터 프로토콜입니다. 기본 K 값의 메트릭은 경로의 최소 대역폭과 누적 지연에 기반합니다. IPv4와 IPv6 주소 계열을 지원합니다.",
    variants: ["IPv4", "IPv6", "DUAL", "Successor", "Feasible successor", "Internal", "External", "Classic / Wide metric"], criterion: "복합 메트릭 · 루프 없는 경로 계산", routeCode: "D / D EX", lab: "eigrp",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-routing/b-ip-routing/m_ire-enhanced-igrp.html",
  },
  {
    id: "isis", name: "Integrated IS-IS", group: "동적 IGP",
    summary: "링크 상태를 공유하고 SPF로 경로를 계산합니다. L1은 영역 내부를 담당하고 L2는 영역 사이를 연결합니다. IPv4·IPv6 및 단일·다중 토폴로지 구성이 있습니다.",
    variants: ["IS-IS", "Level 1", "Level 2", "L1/L2", "IPv4", "IPv6", "Single topology", "Multi-topology"], criterion: "레벨 · 누적 링크 메트릭", routeCode: "i L1 / i L2 / i ia", lab: "isis",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr3-fwd/isis/is-is-configuration-guide/is-is.html",
  },
  {
    id: "bgp", name: "BGP · eBGP / iBGP", group: "BGP",
    summary: "AS 경로와 여러 속성 및 운영 정책으로 경로를 선택합니다. 서로 다른 AS 사이는 eBGP입니다. 같은 AS 안에서 BGP 경로를 교환하면 iBGP입니다.",
    variants: ["BGP-4", "eBGP", "iBGP", "Path vector", "Weight", "Local Preference", "AS_PATH", "MED"], criterion: "정책과 BGP 속성의 우선순위", routeCode: "B", lab: "bgp",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/iosxr/cisco8000/bgp/bgp-config-cisco8000/r-wrapper-bgp-path-selection-and-route-preference.html",
  },
  {
    id: "mp-bgp", name: "MP-BGP · MBGP", group: "BGP",
    summary: "BGP가 여러 주소 계열의 도달 정보를 운반하도록 확장합니다. eBGP·iBGP와 다른 분류 축입니다. IPv6나 VPN 경로를 전달할 때도 사용합니다.",
    variants: ["Multiprotocol BGP", "IPv4", "IPv6", "VPNv4", "VPNv6", "L2VPN EVPN", "AFI / SAFI"], criterion: "주소 계열별 BGP 경로와 정책", routeCode: "B",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9600/software/release/17-18/configuration_guide/rtng/b_1718_rtng_9600_cg/implementing_multiprotocol_bgp_for_ipv6.html",
  },
  {
    id: "pbr", name: "정책 기반 라우팅 · PBR", group: "정책·분리·멀티캐스트",
    summary: "출발지 주소나 트래픽 조건을 route-map으로 검사해 지정한 다음 홉을 적용합니다. 별도 경로 학습 프로토콜이 아닙니다. 정책 미일치 시 일반 목적지 기반 조회를 사용합니다.",
    variants: ["Policy-Based Routing", "Route-map", "ACL", "Source-based policy"], criterion: "match 조건과 set 동작", routeCode: "별도 경로 코드 없음", lab: "pbr",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr3-fwd/pbr/policy-based-routing-configuration-guide/policy-based-routing.html",
  },
  {
    id: "vrf", name: "VRF · VRF-Lite", group: "정책·분리·멀티캐스트",
    summary: "한 장비에서 라우팅·전달 테이블을 분리합니다. 각 VRF 안에서 정적 경로와 동적 프로토콜을 사용할 수 있습니다. VRF 자체가 경로를 학습하는 것은 아닙니다.",
    variants: ["Virtual Routing and Forwarding", "VRF-Lite", "분리된 RIB / FIB", "Route leaking"], criterion: "소속 VRF의 테이블 조회", routeCode: "각 VRF의 경로 출처 코드",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/IIOT/switches/ie3x00/config/ip-routing/ip-routing/g_configuring-vrf-lite/vrf-lite_configuration_guidelines.html",
  },
  {
    id: "multicast", name: "멀티캐스트 라우팅 · PIM", group: "정책·분리·멀티캐스트",
    summary: "멀티캐스트 수신자에게 트리를 따라 패킷을 전달합니다. PIM-SM·SSM·BIDIR·Dense Mode는 서로 다른 동작을 사용합니다. 유니캐스트 최장 프리픽스 조회와 구분합니다.",
    variants: ["PIM-SM", "PIM-SSM", "BIDIR-PIM", "PIM-DM", "Sparse-dense mode", "RPF", "IGMP / MLD"], criterion: "그룹·송신원 상태와 RPF", routeCode: "show ip mroute / show ipv6 mroute",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/ipmulti_pim/configuration/xe-16-11/imc-pim-xe-16-11-book.pdf",
  },
  {
    id: "omp", name: "OMP · Cisco SD-WAN", group: "오버레이·SD-WAN",
    summary: "Cisco Catalyst SD-WAN의 컨트롤러와 에지 장비가 오버레이 프리픽스·TLOC 및 정책 정보를 교환합니다. 실제 사용자 데이터 전달과 제어 정보 교환은 구분합니다.",
    variants: ["Overlay Management Protocol", "vRoute", "TLOC", "Cisco Catalyst SD-WAN"], criterion: "OMP 경로 속성과 제어 정책", routeCode: "IOS XE 범례: m",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/routers/sdwan/26x-later/routing/routing-configuration-guide/OMP-routing-protocol-ref/omp-route-advertisements.html",
  },
  {
    id: "nhrp-dmvpn", name: "NHRP · DMVPN", group: "오버레이·SD-WAN",
    summary: "터널 주소와 NBMA 주소의 대응을 해석합니다. DMVPN에서 허브 등록과 스포크 간 터널 탐색에 사용합니다. OSPF·EIGRP 등의 경로 교환과 함께 동작하는 기능입니다.",
    variants: ["Next Hop Resolution Protocol", "DMVPN", "mGRE", "IPsec", "NHRP Redirect / Shortcut"], criterion: "주소 매핑과 터널 다음 홉 해석", routeCode: "IOS XE 범례: H / G / g",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/security-vpn/security-vpn/m_sec-conn-dmvpn-dmvpn-0.html",
  },
  {
    id: "lisp", name: "LISP · 위치와 식별자 분리", group: "오버레이·SD-WAN",
    summary: "종단 식별자 EID와 라우팅 위치 RLOC를 분리합니다. 매핑 시스템으로 목적지의 위치를 찾고 터널 라우터가 캡슐화해 전달합니다. 일반 IGP와 다른 아키텍처입니다.",
    variants: ["Locator ID Separation Protocol", "EID", "RLOC", "ITR / ETR", "Map server / resolver"], criterion: "EID와 RLOC 매핑 및 위치 우선순위", routeCode: "IOS XE 범례: l",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-routing/b-ip-routing/m_irl-cfg-lisp.html",
  },
  {
    id: "mpls-l3vpn", name: "MPLS L3VPN", group: "오버레이·SD-WAN",
    summary: "VRF로 고객 경로를 분리하고 PE 사이에서 MP-BGP로 VPN 경로를 교환합니다. 코어의 전달은 MPLS 라벨을 사용합니다. 하나의 새로운 IGP 이름이 아닌 서비스 구성입니다.",
    variants: ["MPLS Layer 3 VPN", "PE / CE", "VRF", "MP-BGP", "VPNv4 / VPNv6", "RD / RT", "Label forwarding"], criterion: "VPN 경로 정책과 MPLS 라벨 전달", routeCode: "경로 출처 코드와 라벨 테이블",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/mpls/mpls-configuration-guide/mpls-layer-3-vpn.html",
  },
  {
    id: "segment-routing", name: "Segment Routing · SR-TE", group: "오버레이·SD-WAN",
    summary: "SID 목록으로 전달할 세그먼트 순서를 표현합니다. SR-MPLS와 SRv6가 있으며 SR-TE 정책은 명시적 경로나 계산된 후보 경로로 트래픽을 보낼 수 있습니다.",
    variants: ["Segment Routing", "SR-MPLS", "SRv6", "SR-TE", "Traffic Engineering", "SID list", "Explicit / Dynamic path"], criterion: "세그먼트와 TE 정책의 후보 경로", routeCode: "경로 출처·정책별로 다름",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/cloud-systems-management/crosswork-network-controller/7-2/CNC-Traffic-Engineering/b-cnc-traffic-engineering-7-2/sr-mpls-and-srv6/sr-mpls-and-srv6_2.html",
  },
  {
    id: "ripv1", name: "RIPv1 · 레거시", group: "역사·특수 목적",
    summary: "클래스 기반 IPv4 거리 벡터 프로토콜입니다. 업데이트에 서브넷 마스크를 싣지 않습니다. RIPv2와의 차이를 이해하기 위한 역사적 항목입니다.",
    variants: ["RIP version 1", "Classful", "홉 수"], criterion: "최소 홉 수 · 마스크 정보 없음", routeCode: "R",
    sourceUrl: "https://www.rfc-editor.org/rfc/rfc2453.html",
  },
  {
    id: "igrp", name: "IGRP · 레거시", group: "역사·특수 목적",
    summary: "Cisco가 개발한 과거의 클래스 기반 거리 벡터 프로토콜입니다. EIGRP의 이전 계열이며 Cisco는 IGRP를 obsolete로 설명합니다. 현재 장비의 지원을 전제하지 않습니다.",
    variants: ["Interior Gateway Routing Protocol", "Classful", "EIGRP 이전"], criterion: "과거의 복합 메트릭", routeCode: "과거 IOS: I",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/IIOT/routers/embedded/6300/software/config/b_ESR6300_config/b_ESR6300_config_chapter_010.html",
  },
  {
    id: "egp", name: "EGP · 역사적 프로토콜", group: "역사·특수 목적",
    summary: "BGP 이전의 Exterior Gateway Protocol입니다. AS 간 프로토콜을 뜻하는 일반 분류 EGP와 같은 이름이므로 구분해야 합니다. 역사적 프로토콜 EGP는 BGP로 대체되었습니다.",
    variants: ["Exterior Gateway Protocol", "RFC 904", "Inter-AS"], criterion: "역사적 AS 간 도달 정보 교환", routeCode: "과거 IOS: E",
    sourceUrl: "https://www.rfc-editor.org/rfc/rfc1812.html#section-7.3.1",
  },
  {
    id: "odr", name: "ODR · On-Demand Routing", group: "역사·특수 목적",
    summary: "허브와 스텁 구성에서 CDP로 최소한의 경로 정보를 교환합니다. 스텁은 연결 프리픽스를 알리고 허브는 기본 경로 정보를 제공합니다. 일반 IGP와 다른 특수 목적 기능입니다.",
    variants: ["On-Demand Routing", "CDP", "Hub and spoke", "Stub"], criterion: "CDP로 전달한 프리픽스", routeCode: "o",
    sourceUrl: "https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-routing/b-ip-routing/m_ird-odrconfg-0.html",
  },
  {
    id: "mtr", name: "다중 토폴로지 라우팅 · MTR", group: "역사·특수 목적",
    summary: "하나의 물리망에 서로 다른 논리 토폴로지와 전달 테이블을 구성합니다. 트래픽 분류에 따라 다른 토폴로지로 전달하는 기능이며 독립된 IGP 이름이 아닙니다.",
    variants: ["Multi-Topology Routing", "Class-based forwarding", "독립 전달 테이블"], criterion: "트래픽 분류와 토폴로지별 경로", routeCode: "토폴로지별 경로 출처 코드",
    sourceUrl: "https://www.cisco.com/en/US/docs/ios-xml/ios/mtr/configuration/15-0s/multi-topo-routing.html",
  },
  {
    id: "oer-pfr", name: "OER · PfR", group: "역사·특수 목적",
    summary: "경로의 성능 측정과 정책에 따라 트래픽의 출구를 제어하는 Cisco 기능 계열입니다. PfR은 OER에서 발전했습니다. 일반 IGP의 Cost 비교와 동일한 기능이 아닙니다.",
    variants: ["Optimized Edge Routing", "Performance Routing", "측정 기반 정책"], criterion: "네트워크·애플리케이션 성능 정책", routeCode: "적용 방식에 따라 다름",
    sourceUrl: "https://www.cisco.com/c/en/us/products/collateral/ios-nx-os-software/performance-routing-pfr/product_data_sheet0900aecd806c4ee4.html",
  },
  {
    id: "drp-director", name: "DRP · Director Response", group: "역사·특수 목적",
    summary: "과거 DistributedDirector가 라우터의 BGP·IGP 메트릭을 조회해 서버 선택에 사용한 UDP 기반 기능입니다. 라우터 사이의 일반 경로 학습 프로토콜과 다릅니다.",
    variants: ["Director Response Protocol", "DistributedDirector", "DRP Server Agent"], criterion: "서버 선택에 사용할 라우팅 메트릭 조회", routeCode: "경로 출처 코드 없음",
    sourceUrl: "https://www.cisco.com/en/US/docs/ios/netmgmt/configuration/guide/nm_dd_drp_agent_external_docbase_0900e4b180620f10_4container_external_docbase_0900e4b181b561ec.html",
  },
  {
    id: "cidr", name: "CIDR · 프리픽스 표기", group: "역사·특수 목적",
    summary: "주소와 프리픽스 길이로 네트워크 범위를 표현하는 방식입니다. 클래스 경계에 얽매이지 않는 집계와 경로 표현에 사용하며 경로를 교환하는 프로토콜은 아닙니다.",
    variants: ["Classless Inter-Domain Routing", "VLSM", "Longest prefix match", "최장 프리픽스 일치"], criterion: "주소 범위 표현과 집계", routeCode: "해당 없음",
    sourceUrl: "https://www.rfc-editor.org/rfc/rfc4632.html",
  },
];
