---
title: "VLAN"
description: "Access와 Trunk 포트를 바꾸며 이더넷 프레임의 802.1Q 태그와 VLAN 경계를 3D로 확인합니다."
publishedAt: "2026-11-16"
tags: ["VLAN", "802.1Q", "Access", "Trunk", "스위치"]
category: network
draft: false
example: true
---

VLAN은 하나의 물리적 스위치 네트워크를 여러 논리적 브로드캐스트 도메인으로 나눕니다. 같은 스위치에 연결되어 있어도 VLAN이 다르면 동일한 L2 네트워크에 속하지 않습니다. 반대로 서로 다른 스위치의 포트도 같은 VLAN으로 연결할 수 있습니다. [Cisco의 VLAN 구성 가이드](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr2-fwd/vlan/vlan-configuration-guide/configure-vlan.html)가 설명하는 논리적 분리입니다.

이 글에서는 **프레임이 어느 VLAN에 속하는지**와 **선로 위에 VLAN 태그가 있는지**를 따로 확인합니다. 태그가 없다고 VLAN 소속도 없는 것은 아닙니다.

## Access와 Trunk 포트

일반 PC가 연결된 access 포트는 하나의 데이터 VLAN에 소속됩니다. PC가 보낸 태그 없는 프레임을 받으면 스위치는 수신 포트의 설정으로 VLAN을 판단합니다. Trunk 포트는 하나의 링크로 여러 VLAN의 트래픽을 운반합니다. 이때 일반적으로 802.1Q 태그가 VLAN을 구분합니다. [Cisco의 트렁크 구성 가이드](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr2-fwd/vlan/vlan-configuration-guide/configure-vlan-trunks.html)는 포트 모드와 허용 VLAN 설정을 구분합니다.

| 연결 방식 | 이 데모에서의 VLAN 소속 | 링크 위 프레임 |
| --- | --- | --- |
| PC의 access 연결 | 해당 포트에 설정한 VLAN 10 또는 20 | 태그 없음 |
| 스위치 간 access 연결 | 양쪽 포트에 동일하게 설정한 VLAN 하나 | 태그 없음 |
| 스위치 간 trunk 연결 | 허용 목록에 포함된 VLAN | 보통 802.1Q 태그 포함 |
| Trunk의 native VLAN | 양쪽에 동일하게 설정한 native VLAN | 이 데모에서는 태그 없음 |

두 스위치 사이를 연결한다고 반드시 trunk여야 하는 것은 아닙니다. 하나의 VLAN만 연장할 목적이라면 두 포트를 같은 access VLAN으로 구성할 수 있습니다. 데모에서 연결 모드를 바꾸면 이 차이를 확인할 수 있습니다.

## 프레임 전달을 따라가는 3D 모델

<!-- demo:vlan -->

모델은 스위치 두 대와 PC 네 대로 구성됩니다. 각 스위치에는 VLAN 10 PC와 VLAN 20 PC가 하나씩 연결됩니다. 송신 VLAN과 목적지의 VLAN 관계를 고른 뒤 스위치 간 연결을 access 또는 trunk로 설정합니다.

모형을 회전하거나 확대해 포트와 연결선을 살펴볼 수 있습니다. 단계 이동으로 프레임의 위치와 태그를 확인하고 재생으로 전체 흐름을 볼 수 있습니다. 설정을 바꾸면 새 조건에서 전달 과정을 다시 확인합니다. 모든 계산은 브라우저 안의 교육용 시뮬레이션입니다. 실제 PC나 스위치로 패킷을 보내지 않습니다.

## 802.1Q 태그가 붙는 구간

송신 VLAN을 10으로 선택하고 trunk에서 VLAN 10을 허용합니다. Native VLAN은 1로 두고 같은 VLAN의 PC를 목적지로 선택합니다.

| 단계 | 프레임 위치 | 프레임에 보이는 태그 | 스위치가 판단하는 소속 |
| --- | --- | --- | --- |
| 1 | PC A10 → SW-A | 없음 | 수신 access 포트가 VLAN 10 |
| 2 | SW-A 내부 | 선로 위 프레임이 아닌 내부 처리 | VLAN 10 |
| 3 | SW-A → SW-B trunk | 802.1Q VLAN 10 | VLAN 10 |
| 4 | SW-B 내부 | 수신 태그를 해석한 내부 처리 | VLAN 10 |
| 5 | SW-B → PC B10 | 없음 | 출력 access 포트가 VLAN 10 |

데모의 내부 처리 표시는 스위치가 유지하는 VLAN 소속을 표현합니다. 특정 ASIC의 내부 헤더 구조를 재현한 것은 아닙니다. PC 쪽 프레임은 태그가 없고 스위치 간 trunk 구간에서만 VLAN 10 태그를 볼 수 있습니다. 목적지 access 포트로 출력할 때는 PC에게 802.1Q 태그를 전달하지 않습니다.

## Native VLAN의 태그 예외

Native VLAN을 10으로 바꾸면 같은 VLAN 10 프레임도 trunk에서 태그 없이 이동합니다. 수신 스위치는 태그 없는 프레임을 자신의 native VLAN으로 분류합니다. 이 동작 때문에 링크 양쪽의 native VLAN 설정이 맞아야 합니다. [Cisco의 802.1Q 설명](https://www.cisco.com/c/en/us/support/docs/lan-switching/inter-vlan-routing/14976-50.html)은 native VLAN의 태그 예외와 양쪽 설정 일치를 설명합니다.

이 모델에서는 양쪽 native VLAN이 함께 변경되며 native VLAN에 강제로 태그를 붙이는 별도 설정은 사용하지 않습니다. Native VLAN 1을 선택해도 PC의 VLAN이 1로 바뀌지는 않습니다. PC는 계속 VLAN 10 또는 20에 속합니다.

## 허용 목록과 포트 모드 비교

다음 순서로 조건을 바꿔 결과를 비교합니다.

1. **Trunk · VLAN 10 허용:** A10에서 B10으로 프레임이 전달됩니다.
2. **Trunk · VLAN 10 차단:** SW-A에서 스위치 간 링크로 나가지 못합니다. Native VLAN이 10이어도 사용자 데이터의 허용 여부를 확인합니다.
3. **Access · VLAN 10:** A10에서 B10으로 태그 없이 전달됩니다. 같은 링크로 VLAN 20 프레임을 보내면 차단됩니다.
4. **Access · VLAN 20:** 이번에는 VLAN 20만 통과합니다. Access 모드에서는 trunk의 허용 목록을 적용하지 않습니다.

Trunk의 허용 목록은 **그 링크로 어떤 VLAN을 운반할지** 정합니다. VLAN 10과 20을 모두 허용해도 두 VLAN을 하나로 합치지 않습니다. 위 조건은 양쪽 포트 설정이 같은 경우만 다룹니다. Access/trunk 불일치나 native VLAN 불일치로 인한 오동작은 재현하지 않습니다.

## 다른 VLAN으로 통신하려면

목적지를 다른 VLAN으로 변경하면 선택한 PC까지 전달되지 않습니다. 예를 들어 VLAN 10 프레임을 VLAN 20 access 포트로 출력할 수 없습니다. 실제로 미학습 유니캐스트나 브로드캐스트가 복제되어도 그 범위는 해당 VLAN 내부입니다. 데모의 차단 표시는 **선택한 다른 VLAN의 목적지로 전달할 수 없음**을 뜻하며 같은 VLAN 안의 다른 포트로 복제되는 과정은 생략합니다.

서로 다른 VLAN에 속한 IP 호스트 사이의 통신에는 라우터 또는 L3 스위치의 라우팅 기능이 필요합니다. 이 모델에는 그런 장치가 없으므로 trunk 설정만 바꿔도 다른 VLAN 목적지에 도달하지 않습니다. [Cisco의 inter-VLAN routing 구성 예제](https://www.cisco.com/c/en/us/support/docs/lan-switching/inter-vlan-routing/14976-50.html)는 외부 라우터로 이 경계를 연결하는 구성을 보여 줍니다. 목적지 IP를 보고 출력 경로를 고르는 과정은 [라우팅 글](/computer/routing)에서 이어집니다.

## 모델의 범위

이 데모는 포트 모드와 VLAN 소속에 따른 프레임 전달 가능성을 보여 줍니다. MAC 주소 학습과 ARP 교환은 생략합니다. 링크는 정상 연결 상태이며 STP 차단이나 링크 장애는 없습니다. PC의 VLAN 태깅 기능과 voice VLAN도 다루지 않습니다. 따라서 재생 속도는 실제 네트워크 지연이나 처리 성능을 뜻하지 않습니다.

## 참고 문서

- [Cisco — Configure VLAN](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr2-fwd/vlan/vlan-configuration-guide/configure-vlan.html): VLAN의 논리적 분리와 포트 소속입니다.
- [Cisco — Configure VLAN Trunking](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr2-fwd/vlan/vlan-configuration-guide/configure-vlan-trunks.html): access/trunk 모드와 허용 목록 및 native VLAN 동작입니다.
- [Cisco — Configure Inter VLAN Routing with the Use of an External Router](https://www.cisco.com/c/en/us/support/docs/lan-switching/inter-vlan-routing/14976-50.html): 802.1Q와 VLAN 간 라우팅 구성입니다.
