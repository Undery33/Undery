---
title: "라우팅"
description: "Cisco 기준 정적·RIP·OSPF·EIGRP·IS-IS·BGP와 PBR을 비교하고 경로 선택과 장애 대응을 3D로 확인합니다."
publishedAt: "2026-11-16"
tags: ["라우팅", "Cisco", "정적 라우팅", "OSPF", "RIP", "EIGRP", "IS-IS", "BGP", "PBR", "IPv4", "IPv6"]
category: network
draft: false
example: true
---

라우팅은 **경로를 얻는 과정**과 **그 경로로 패킷을 전달하는 과정**으로 나눠 볼 수 있습니다. 관리자가 직접 설정하는 정적 경로도 있고 OSPF나 BGP로 학습하는 경로도 있습니다. 학습된 경로를 테이블에 설치한 뒤에는 패킷의 목적지에 맞는 전달 경로를 찾습니다.

이 글은 [Cisco IP Routing 기술 분류](https://www.cisco.com/c/en/us/tech/ip/ip-routing/index.html)를 기준으로 주요 프로토콜과 IPv4·IPv6 변형을 정리합니다. 직접 연결·정적 경로·동적 IGP·BGP·정책 및 분리 기능·오버레이·SD-WAN·역사적 항목을 구분합니다. IOS·IOS XE·IOS XR·NX-OS의 지원 범위는 장비와 릴리스 및 라이선스에 따라 달라집니다. 모든 항목이 한 장비에서 동시에 지원된다는 의미는 아닙니다.

## Cisco 라우팅 종류와 3D 실습

<!-- demo:routing -->

종류 목록에서 검색하거나 분류를 선택합니다. 3D 실습은 **정적 라우팅·RIPv2·OSPFv2·EIGRP·IS-IS·BGP·PBR**의 대표적인 선택 기준을 비교합니다. 조건을 바꾸고 선택된 링크를 따라 이동하는 패킷을 단계별로 확인합니다. 최장 프리픽스 일치 실습에서는 목적지 IPv4 주소와 기본 경로를 바꿔 전달 테이블 조회를 살펴봅니다.

실습은 브라우저 내부의 교육용 모델입니다. 실제 Cisco 장비에 명령을 보내거나 네트워크 패킷을 전송하지 않습니다. IPv6 변형·멀티캐스트·오버레이·역사적 프로토콜은 분류에서 설명하며 각각의 전체 프로토콜 스택을 에뮬레이션하지 않습니다.

## 먼저 구분할 세 가지 판단

[Cisco의 관리 거리 설명](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/15986-admin-distance.html)은 경로 설치와 패킷 전달을 구분합니다.

| 판단 | 비교 대상 | 기준 |
| --- | --- | --- |
| 프로토콜 내부의 경로 선택 | 같은 프로토콜에서 배운 후보 | RIP의 홉 수·OSPF Cost·EIGRP 메트릭·BGP 속성 등 |
| 라우팅 테이블에 경로 설치 | 서로 다른 출처가 제공한 동일 프리픽스 | 유효성 확인 후 관리 거리 AD 등으로 출처 선택 |
| 패킷 전달 | 설치된 경로 중 목적지와 일치하는 항목 | 최장 프리픽스 일치 LPM |

AD가 낮다고 더 구체적인 프리픽스를 이기는 것은 아닙니다. `/24`와 `/16`은 서로 다른 프리픽스이므로 둘 다 설치될 수 있습니다. 목적지가 둘 다에 일치하면 전달 시 `/24`를 사용합니다. 서로 다른 프로토콜의 메트릭 숫자도 그대로 비교하지 않습니다.

## 직접 연결과 정적 경로

`C`는 인터페이스에 직접 연결된 네트워크입니다. `L`은 라우터 자신의 주소에 대한 호스트 경로로 IPv4에서는 `/32`와 IPv6에서는 `/128`을 사용합니다. 이 항목은 이웃과 경로를 교환하는 동적 프로토콜이 아닙니다. [Cisco — Local Host Routes](https://www.cisco.com/c/en/us/support/docs/ip/ip-routing/116264-technote-ios-00.html)

| 유형 | 의미 | 구분할 점 |
| --- | --- | --- |
| 정적 네트워크 경로 | 목적지 프리픽스의 다음 홉 또는 출력 지정 | 관리자가 경로를 구성 |
| 정적 호스트 경로 | IPv4 `/32` 또는 IPv6 `/128`의 특정 호스트 지정 | 라우터 자신을 뜻하는 Local 경로와 별개 |
| 재귀 정적 경로 | 다음 홉 주소로 가는 출력을 다시 조회 | 다음 홉이 해석 가능해야 설치 가능 |
| 출력 인터페이스 지정 | 패킷을 내보낼 인터페이스 지정 | Ethernet에서는 다음 홉을 함께 지정할 필요 검토 |
| Fully specified | 다음 홉과 출력 인터페이스를 함께 지정 | 링크와 다음 홉을 명확히 연결 |
| 기본 경로 | IPv4 `0.0.0.0/0` 또는 IPv6 `::/0` | 더 구체적인 일치 경로가 없을 때 사용 |
| 플로팅 정적 경로 | 주 경로보다 높은 AD의 예비 경로 | 주 경로 철회와 예비 경로 유효성이 전제 |
| 요약 경로 | 여러 프리픽스를 넓은 범위로 집계 | 동적 프로토콜에서도 집계 가능 |
| Null0·폐기 경로 | 선택되면 패킷을 버리는 경로 | 요약 범위 안의 루프 방지 등에 활용 |

정적 경로의 지정 방식과 플로팅 동작은 [Cisco 정적 경로 문서](https://www.cisco.com/c/en/us/support/docs/dial-access/floating-static-route/118263-technote-nexthop-00.html)를 따릅니다. **기본 경로는 별도 프로토콜이 아니라 `/0`인 경로 형태**입니다. 정적으로 만들거나 동적 프로토콜로 학습할 수 있습니다. Null0의 폐기 동작은 [Cisco의 Null0 경로 설명](https://www.cisco.com/c/en/us/support/docs/ip/ip-routed-protocols/14956-route-to-null-interface.html)에서 확인할 수 있습니다.

### 링크 장애와 플로팅 경로

정적 경로는 연결 인터페이스가 내려가거나 다음 홉이 해석되지 않으면 제거될 수 있습니다. 그러나 **먼 곳의 링크 장애가 항상 자동으로 감지되는 것은 아닙니다.** 로컬 다음 홉이 계속 유효하면 잘못된 방향의 정적 경로가 남을 수 있습니다. 별도 IP SLA와 object tracking을 이용해 상태를 추적하는 구성이 가능합니다. 예비 링크가 존재한다는 이유만으로 플로팅 경로가 활성화되지는 않습니다. [Cisco — ISP Failover with IP SLA Tracking](https://www.cisco.com/c/en/us/support/docs/ip/ip-routing/200785-ISP-Failover-with-default-routes-using-I.html)

## 동적 라우팅: IGP와 BGP

IGP는 하나의 AS 또는 관리 도메인 안에서 사용하는 프로토콜 분류입니다. RIP·OSPF·EIGRP·IS-IS가 여기에 들어갑니다. BGP는 AS 사이의 경로와 정책을 다루며 같은 AS 내부에서도 iBGP로 경로를 교환합니다. IGP 자체가 OSPF와 나란히 설정하는 하나의 프로토콜 이름은 아닙니다. [Cisco — Unicast Routing Overview](https://www.cisco.com/c/en/us/td/docs/routers/connectedgrid/cgr1000/1_0/software/configuration/guide/unicast/Unicast_Book/l3_over_cgr1000.html)

| 계열 | IPv4·IPv6 변형 | 주요 방식 | 선택 기준 |
| --- | --- | --- | --- |
| RIP | RIPv1·RIPv2 / RIPng | 거리 벡터 | 홉 수 |
| OSPF | OSPFv2 / OSPFv3와 주소 계열 확장 | 링크 상태·SPF | 경로 유형과 누적 Cost |
| EIGRP | IPv4·IPv6 주소 계열 | 고급 거리 벡터·DUAL | 복합 메트릭과 루프 없는 경로 계산 |
| Integrated IS-IS | IPv4·IPv6 / 단일·다중 토폴로지 | 링크 상태·SPF | 레벨과 누적 링크 메트릭 |
| BGP | BGP-4 / MP-BGP 주소 계열 | 경로 벡터와 정책 | BGP 속성의 우선순위 |

각 계열은 이름만 바꾼 동일한 최단 경로 알고리즘이 아닙니다. 아래에서 계산 기준과 범위를 따로 확인합니다.

### RIP: RIPv1·RIPv2·RIPng

RIP는 홉 수를 사용합니다. 15홉까지 유효하며 16은 도달 불가능입니다. RIPv1은 업데이트에 서브넷 마스크를 넣지 않는 클래스 기반 방식입니다. RIPv2는 마스크를 전달해 VLSM을 표현합니다. [RFC 2453](https://www.rfc-editor.org/rfc/rfc2453.html)

IPv6에서는 **RIPng**를 사용합니다. Cisco 문서에는 RIP for IPv6 또는 RIP v6라는 이름도 있습니다. RIPng는 IPv6 프리픽스와 별도의 메시지 형식을 사용합니다. 실습의 RIP 모드는 RIPv2의 홉 수 비교입니다. 적은 홉이 높은 대역폭이나 낮은 실제 지연을 보장하지는 않습니다. [Cisco — RIP for IPv6](https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-routing/b-ip-routing/m_ip6-rip-xe.html)

### OSPF: v2·v3와 경로 유형

OSPF는 링크 상태 정보를 공유한 LSDB에서 SPF를 실행합니다. 같은 영역 내부의 경로에서는 링크의 Cost를 합산합니다. 동일 비용의 복수 경로를 사용하는 ECMP도 지원하지만 설치 개수와 전달 방식은 구현 및 설정의 영향을 받습니다. [RFC 2328 §16](https://www.rfc-editor.org/rfc/rfc2328.html#section-16)

실제 OSPF는 Intra-area·Inter-area·External·NSSA 등의 **경로 유형**도 고려합니다. 모든 경로를 종류와 무관하게 Cost 숫자 하나로 정렬하지 않습니다. `O`, `O IA`, `O E1/E2`, `O N1/N2`는 이런 차이를 나타내는 IOS 표기입니다. 실습은 한 영역 내부의 Cost 비교와 장애 후 계산을 단순화합니다. 단계 이동 시간은 실제 수렴 시간을 측정한 값이 아닙니다. [Cisco — OSPF](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr3-fwd/ospf/ospf-configuration-guide/ospf.html)

OSPFv2는 IPv4를 대상으로 합니다. OSPFv3는 IPv6에서 사용하며 **OSPFv3 Address Families** 기능을 지원하는 Cisco 구성에서는 IPv4도 처리합니다. 따라서 OSPFv3를 무조건 IPv6 전용이라고 설명하면 이 확장을 놓칩니다. [Cisco — OSPFv3 Address Families](https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-routing/b-ip-routing/m_ip6-route-ospfv3-add-fam-xe.html)

### EIGRP: 메트릭과 DUAL

EIGRP는 DUAL을 사용하는 고급 거리 벡터 프로토콜입니다. 기본 K 값의 Classic 메트릭은 **경로상의 최소 대역폭**과 **누적 지연**에 기반합니다. 대역폭을 전 구간에서 더하는 계산이 아닙니다. Classic과 Wide metric도 구분해야 합니다. IPv4·IPv6 주소 계열과 내부·외부 경로가 있으며 일반적인 IOS 표기는 `D`와 `D EX`입니다. [Cisco — EIGRP](https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-routing/b-ip-routing/m_ire-enhanced-igrp.html)

Successor는 선택된 다음 홉입니다. Feasible successor는 루프 없는 대체 경로로 사용할 조건을 충족한 이웃입니다. 후보가 여러 개라고 모두 feasible successor인 것은 아닙니다. 사용 가능한 feasible successor가 없으면 DUAL의 질의·응답 과정이 필요할 수 있습니다. 실습의 메트릭 비교는 이 전체 상태 머신을 대신하지 않습니다. [Cisco — Introduction to EIGRP](https://www.cisco.com/c/en/us/support/docs/ip/enhanced-interior-gateway-routing-protocol-eigrp/13669-1.html)

### IS-IS: L1·L2와 IPv6

Integrated IS-IS도 링크 상태를 공유하고 SPF로 계산합니다. Level 1은 영역 내부를 담당합니다. Level 2는 영역 사이를 연결하는 백본 역할을 합니다. 두 레벨을 수행하는 L1/L2 라우터도 있습니다. IPv4·IPv6를 지원하며 단일 토폴로지와 다중 토폴로지를 구성할 수 있습니다. 실습은 한 레벨에서 누적 메트릭을 비교하는 대표 동작입니다. [Cisco — IS-IS](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr3-fwd/isis/is-is-configuration-guide/is-is.html)

### BGP: eBGP·iBGP·MP-BGP

BGP의 기준은 운영 정책과 경로 속성입니다. 단순히 라우터 홉이 적거나 대역폭이 높은 경로만 선택하지 않습니다. Weight·Local Preference·AS_PATH·MED 등을 정해진 조건과 우선순위에 따라 비교합니다. 정확한 절차와 옵션은 플랫폼 및 설정을 확인해야 합니다. [Cisco — BGP Path Selection](https://www.cisco.com/c/en/us/td/docs/iosxr/cisco8000/bgp/bgp-config-cisco8000/r-wrapper-bgp-path-selection-and-route-preference.html)

| 구분 | 의미 |
| --- | --- |
| eBGP | 서로 다른 AS의 BGP 피어 간 경로 교환 |
| iBGP | 같은 AS의 BGP 피어 간 경로 교환 |
| MP-BGP·MBGP | BGP가 운반하는 주소 계열을 확장 |

eBGP·iBGP는 피어의 AS 관계입니다. MP-BGP는 주소 계열의 확장으로 IPv6·VPNv4·VPNv6 등의 정보에 사용합니다. 따라서 서로 배타적인 세 가지 프로토콜이 아닙니다. 멀티캐스트 주소 계열의 정보를 운반한다고 BGP 자체가 PIM의 트리 동작을 대신하지도 않습니다. 실습은 일부 속성이 같은 조건에서 정책의 영향을 비교하며 전체 best-path 절차와 라우트 리플렉터·컨페더레이션을 재현하지 않습니다. [Cisco — Multiprotocol BGP for IPv6](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9600/software/release/17-18/configuration_guide/rtng/b_1718_rtng_9600_cg/implementing_multiprotocol_bgp_for_ipv6.html)

## Cisco 기본 관리 거리

다음은 Cisco 문서가 제시하는 대표 기본값입니다. 변경된 설정과 플랫폼 차이는 실제 장비에서 확인합니다. AD는 **같은 네트워크와 같은 프리픽스 길이의 후보**를 설치할 때 비교하며 낮은 값이 선호됩니다. [Cisco — Administrative Distance](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/15986-admin-distance.html)

| 출처 | 기본 AD |
| --- | ---: |
| Connected | 0 |
| Static | 1 |
| EIGRP summary | 5 |
| eBGP | 20 |
| Internal EIGRP | 90 |
| IGRP · 역사적 값 | 100 |
| OSPF | 110 |
| IS-IS | 115 |
| RIP | 120 |
| EGP · 역사적 값 | 140 |
| ODR | 160 |
| External EIGRP | 170 |
| iBGP | 200 |

AD 255는 설치할 수 없는 값입니다. `[110/20]`에서 `110`은 AD이고 `20`은 해당 프로토콜의 메트릭입니다. 이 표는 패킷마다 모든 프로토콜을 순서대로 시험한다는 뜻이 아닙니다.

## PBR·VRF·멀티캐스트

### PBR: 패킷 조건으로 다음 홉 지정

Policy-Based Routing은 출발지 주소나 트래픽 조건을 route-map으로 검사한 뒤 지정한 다음 홉을 적용합니다. 경로 학습 프로토콜과 역할이 다릅니다. 정책 미일치 패킷은 일반 목적지 기반 라우팅을 사용합니다. PBR의 route-map `deny`도 그 자체로 패킷 폐기라는 뜻은 아닙니다. [Cisco — Policy-Based Routing](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr3-fwd/pbr/policy-based-routing-configuration-guide/policy-based-routing.html)

### VRF: 조회할 테이블 분리

VRF·VRF-Lite는 한 장비에서 라우팅·전달 테이블을 분리합니다. 각 VRF에서 정적 경로나 지원되는 동적 프로토콜을 구성합니다. 서로 다른 VRF에서 주소 범위를 재사용할 수도 있습니다. VRF 간 통신에는 별도 연결 또는 route leaking 설계가 필요합니다. [Cisco — VRF-Lite Guidelines](https://www.cisco.com/c/en/us/td/docs/IIOT/switches/ie3x00/config/ip-routing/ip-routing/g_configuring-vrf-lite/vrf-lite_configuration_guidelines.html)

### PIM: 멀티캐스트 트리

멀티캐스트는 그룹 수신자에게 트리를 따라 전달합니다. PIM은 유니캐스트의 도달 정보를 RPF 판단에 이용할 수 있지만 OSPF와 동일한 역할의 유니캐스트 경로 학습 프로토콜은 아닙니다. [Cisco — IP Multicast: PIM](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/ipmulti_pim/configuration/xe-16-11/imc-pim-xe-16-11-book.pdf)

| 모드 | 중심 개념 |
| --- | --- |
| PIM-SM | 수신자의 Join과 RP를 사용하는 sparse-mode 트리 |
| PIM-SSM | 수신자가 송신원과 그룹을 지정하는 `(S,G)` 전달·RP 미사용 |
| BIDIR-PIM | RP 방향을 기준으로 하는 양방향 공유 트리 |
| PIM-DM | 초기 플러딩과 필요 없는 가지의 prune |
| Sparse-dense mode | 그룹의 RP 정보 등에 따라 sparse 또는 dense 동작 선택 |

IGMP와 MLD는 호스트의 그룹 가입 정보를 알리는 기능입니다. 라우터 간 PIM과 구분합니다. IPv4·IPv6에서 지원하는 모드와 명령은 해당 장비의 가이드를 확인해야 합니다.

과거의 **DVMRP**도 멀티캐스트 관련 문서에 등장합니다. Cisco의 레거시 IOS 가이드는 PIM과 DVMRP의 상호운용을 설명하며 완전한 DVMRP 구현은 아니라고 명시합니다. 현재 장비의 PIM 지원과 이 역사적 상호운용 기능을 같은 것으로 취급하지 않습니다. [Cisco — DVMRP Interoperability](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/ipmulti_legacy/configuration/12-2sx/imc-legacy-12-2sx-book/imc_dvrmp_interop.html)

## 오버레이·SD-WAN·명시적 경로

이 기능은 일반적인 IGP나 정적 경로와 함께 사용됩니다. 경로 교환·주소 매핑·VPN 분리·라벨 또는 캡슐화 전달 중 어떤 역할인지 구분해야 합니다.

| 기능 | 역할 | 공식 자료 |
| --- | --- | --- |
| OMP | Cisco Catalyst SD-WAN 컨트롤러와 에지 사이에서 오버레이 프리픽스·TLOC·정책 정보를 교환 | [Cisco OMP Route Advertisements](https://www.cisco.com/c/en/us/td/docs/routers/sdwan/26x-later/routing/routing-configuration-guide/OMP-routing-protocol-ref/omp-route-advertisements.html) |
| NHRP·DMVPN | 터널 IP와 NBMA 주소의 매핑·허브 등록·스포크 간 해석을 mGRE·IPsec과 조합 | [Cisco Dynamic Multipoint VPN](https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/security-vpn/security-vpn/m_sec-conn-dmvpn-dmvpn-0.html) |
| LISP | 종단 식별자 EID와 위치 RLOC를 분리하고 매핑·캡슐화로 전달 | [Cisco LISP](https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-routing/b-ip-routing/m_irl-cfg-lisp.html) |
| MPLS L3VPN | VRF로 고객 경로 분리·PE 사이의 MP-BGP VPN 경로 교환·코어의 MPLS 라벨 전달 | [Cisco MPLS Layer 3 VPN](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/mpls/mpls-configuration-guide/mpls-layer-3-vpn.html) |
| Segment Routing·SR-TE | SR-MPLS 또는 SRv6의 SID 목록으로 경로 표현·명시적 또는 계산된 정책 경로 선택 | [Cisco SR-MPLS and SRv6](https://www.cisco.com/c/en/us/td/docs/cloud-systems-management/crosswork-network-controller/7-2/CNC-Traffic-Engineering/b-cnc-traffic-engineering-7-2/sr-mpls-and-srv6/sr-mpls-and-srv6_2.html) |

**MP-BGP EVPN**은 오버레이의 MAC·IP 도달 정보를 배포하는 제어 평면에도 사용됩니다. VXLAN은 그 오버레이의 데이터 캡슐화 방식으로 조합할 수 있습니다. EVPN·VXLAN·MP-BGP를 모두 동일한 라우팅 프로토콜 이름으로 나열하지 않습니다. [Cisco — VXLAN with MP-BGP EVPN](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/200952-Configuration-and-Verification-VXLAN-wit.html)

SR-TE의 명시적 경로는 관리자가 지정한 순서를 사용하고 동적 경로는 정책과 제약에 따라 계산합니다. 둘 다 일반 IGP가 고른 한 가지 최단 경로로만 제한되는 개념은 아닙니다. [Cisco — SR-TE Policies](https://www.cisco.com/c/en/us/td/docs/routers/crs/software/crs-r6-4/segment-routing/configuration/guide/b-segment-routing-cg-crs-64x/m-configuring-sr-tunnels-for-te.pdf)

## 역사·특수 목적 항목

지원 색인에 이름이 있다는 사실만으로 현재 모든 장비의 지원을 뜻하지는 않습니다.

| 항목 | 위치와 역할 | 공식 자료 |
| --- | --- | --- |
| IGRP | 과거의 클래스 기반 거리 벡터 프로토콜·Cisco는 obsolete로 설명 | [Cisco Basic Router Configuration](https://www.cisco.com/c/en/us/td/docs/IIOT/routers/embedded/6300/software/config/b_ESR6300_config/b_ESR6300_config_chapter_010.html) |
| EGP | BGP 이전의 역사적 AS 간 프로토콜·일반 분류 EGP와 이름 구분 | [RFC 1812 §7.3.1](https://www.rfc-editor.org/rfc/rfc1812.html#section-7.3.1) |
| ODR | CDP로 허브·스텁의 프리픽스와 기본 경로 정보 교환 | [Cisco On-Demand Routing](https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-routing/b-ip-routing/m_ird-odrconfg-0.html) |
| MTR | 하나의 물리망에 트래픽별 논리 토폴로지와 전달 테이블 구성 | [Cisco Multi-Topology Routing](https://www.cisco.com/en/US/docs/ios-xml/ios/mtr/configuration/15-0s/multi-topo-routing.html) |
| OER·PfR | 성능 측정과 정책으로 트래픽 출구 제어·PfR은 OER에서 발전 | [Cisco Performance Routing](https://www.cisco.com/c/en/us/products/collateral/ios-nx-os-software/performance-routing-pfr/product_data_sheet0900aecd806c4ee4.html) |
| Director Response Protocol | 과거 DistributedDirector의 서버 선택용 BGP·IGP 메트릭 조회 | [Cisco DRP Server Agent](https://www.cisco.com/en/US/docs/ios/netmgmt/configuration/guide/nm_dd_drp_agent_external_docbase_0900e4b180620f10_4container_external_docbase_0900e4b181b561ec.html) |
| CIDR | 주소와 프리픽스 길이의 표기·집계 방식·경로 교환 프로토콜 아님 | [RFC 4632](https://www.rfc-editor.org/rfc/rfc4632.html) |

Cisco IP Routing 색인에는 **HTTP Distribution and Replication Protocol**이라는 DRP 항목도 있습니다. 이는 [W3C의 HTTP 데이터 복제 제안](https://www.w3.org/TR/NOTE-drp.html)이며 위의 Director Response Protocol과 약어만 같습니다. 일반 IP 라우팅 프로토콜 목록에는 합치지 않습니다.

## 기존 최장 프리픽스 일치 실습

프로토콜이 경로를 설치한 뒤의 전달 과정은 목적지 프리픽스로 확인합니다. 예제의 인터페이스와 다음 홉은 구조를 설명하기 위한 값입니다.

| 목적지 프리픽스 | 다음 홉 | 출력 | 방향 |
| --- | --- | --- | --- |
| 192.168.10.0/24 | 직접 연결 | Gi0/1 | LAN-A |
| 192.168.20.0/24 | 직접 연결 | Gi0/2 | LAN-B |
| 10.0.0.0/8 | 172.16.0.2 | Gi0/3 | WAN-A |
| 10.20.0.0/16 | 172.16.1.2 | Gi0/4 | WAN-B |
| 0.0.0.0/0 | 172.16.2.2 | Gi0/5 | 기본 경로 |

목적지 `10.20.3.7`은 `/8`·`/16`·`/0`에 일치합니다. 가장 구체적인 `/16`을 사용해 WAN-B로 전달합니다. `10.7.1.8`은 `/16`에 속하지 않아 `/8`을 사용합니다. `203.0.113.9`는 기본 경로만 일치하며 기본 경로를 끄면 일치 경로가 없어 폐기됩니다. [RFC 1812 §5.2.4.3](https://www.rfc-editor.org/rfc/rfc1812.html#section-5.2.4.3)

이 패널의 완료는 현재 라우터가 출력 링크를 결정했다는 뜻입니다. 인터넷의 최종 목적지가 응답했다는 의미는 아닙니다. `203.0.113.0/24`는 [RFC 5737](https://www.rfc-editor.org/rfc/rfc5737.html)의 문서용 주소 범위입니다.

## 모델의 범위

실제 IOS 명령 파서나 장비 이미지를 실행하지 않습니다. ARP·ND·이더넷 헤더 재작성·TTL·ACL·NAT·반환 경로는 생략합니다. 각 실습에 표시된 장애 감지 조건과 후보 경로를 사용합니다. 실제 수렴 시간이나 장비 성능을 애니메이션 시간으로 해석하지 않습니다.

OSPF의 모든 LSA와 이웃 상태·IS-IS 전체 LSP 처리·EIGRP DUAL 전체 과정·BGP의 모든 동률 규칙을 구현한 모델은 아닙니다. VLAN 경계를 넘어 IP 경로가 필요한 이유는 [VLAN 실습](/computer/vlan)에서 이어서 확인할 수 있습니다.
