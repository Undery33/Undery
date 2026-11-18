export type VlanId = 10 | 20;
export type VlanScenario = "same-vlan" | "different-vlan";

export type NetworkStep = {
  id: string;
  title: string;
  detail: string;
  nodeIds: string[];
  /** Only links actually traversed during this step. */
  edgeIds: string[];
  state: "ready" | "moving" | "success" | "blocked";
  frameLabel: string;
  /** Logical VLAN membership, even when the wire carries no VLAN tag. */
  frameVlan?: VlanId;
  wireFormat?: "untagged" | "802.1Q" | "internal";
};

export type VlanSimulationInput = {
  scenario: VlanScenario;
  allowVlan10: boolean;
  allowVlan20: boolean;
  sourceVlan: VlanId;
  linkMode: "access" | "trunk";
  accessVlan: VlanId;
  nativeVlan: 1 | 10;
};

export type VlanSimulation = {
  input: VlanSimulationInput;
  title: string;
  summary: string;
  success: boolean;
  steps: NetworkStep[];
  sourceId: string;
  destinationId: string;
  vlan: VlanId;
};

/** A forwarding-eligibility model, not an Ethernet stack or MAC-learning model. */
export function getVlanSimulation(input: VlanSimulationInput): VlanSimulation {
  const { scenario, sourceVlan: vlan, linkMode, accessVlan, nativeVlan } = input;
  const destinationVlan = scenario === "same-vlan" ? vlan : vlan === 10 ? 20 : 10;
  const sourceId = `pc-a${vlan}`;
  const destinationId = `pc-b${destinationVlan}`;
  const steps: NetworkStep[] = [
    {
      id: "source",
      title: "송신 프레임 준비",
      detail: `PC A${vlan}에서 PC B${destinationVlan}을 향하는 프레임을 준비합니다. 일반 PC의 이더넷 프레임에는 VLAN 태그가 없습니다.`,
      nodeIds: [sourceId], edgeIds: [], state: "ready",
      frameLabel: "Ethernet · 태그 없음", frameVlan: vlan, wireFormat: "untagged",
    },
    {
      id: "ingress-access",
      title: "Access 포트로 수신",
      detail: `태그 없는 프레임이 SW-A의 VLAN ${vlan} access 포트에 도착합니다.`,
      nodeIds: [sourceId, "switch-a"], edgeIds: [`link-a${vlan}`], state: "moving",
      frameLabel: "Ethernet · 태그 없음", frameVlan: vlan, wireFormat: "untagged",
    },
    {
      id: "classify-a",
      title: `스위치 내부 · VLAN ${vlan}`,
      detail: `수신 access 포트의 설정으로 VLAN ${vlan}에 분류합니다. 내부 VLAN 소속 정보와 선로 위의 802.1Q 태그는 구분합니다.`,
      nodeIds: ["switch-a"], edgeIds: [], state: "moving",
      frameLabel: `내부 소속 · VLAN ${vlan}`, frameVlan: vlan, wireFormat: "internal",
    },
  ];

  const base = { input: { ...input }, sourceId, destinationId, vlan };
  const trunkAllowsVlan = vlan === 10 ? input.allowVlan10 : input.allowVlan20;
  const linkAllowsVlan = linkMode === "access" ? vlan === accessVlan : trunkAllowsVlan;

  if (!linkAllowsVlan) {
    const detail = linkMode === "access"
      ? `스위치 간 access 링크는 VLAN ${accessVlan}에만 속합니다. VLAN ${vlan} 프레임은 이 포트로 나가지 않습니다.`
      : `VLAN ${vlan}이 트렁크 허용 목록에서 제외되었습니다. Native VLAN에 해당해도 이 데이터 프레임은 허용 목록을 따라야 합니다.`;
    steps.push({
      id: "blocked-uplink", title: linkMode === "access" ? "Access VLAN 불일치" : "트렁크 허용 목록에서 차단",
      detail, nodeIds: ["switch-a"], edgeIds: [], state: "blocked",
      frameLabel: `전달 중단 · VLAN ${vlan}`, frameVlan: vlan, wireFormat: "internal",
    });
    return { ...base, title: "스위치 간 전달 차단", summary: detail, success: false, steps };
  }

  const tagged = linkMode === "trunk" && vlan !== nativeVlan;
  const uplinkDetail = linkMode === "access"
    ? `두 스위치의 연결 포트가 모두 access VLAN ${accessVlan}입니다. 프레임은 태그 없이 전송됩니다.`
    : tagged
      ? `VLAN ${vlan}이 허용되어 있습니다. Native VLAN ${nativeVlan}과 다르므로 802.1Q VLAN ${vlan} 태그를 붙여 전송합니다.`
      : `VLAN ${vlan}이 허용되어 있고 native VLAN과 같습니다. 이 모델의 기본 802.1Q 동작에 따라 태그 없이 전송합니다.`;
  steps.push({
    id: "uplink", title: tagged ? "트렁크 전송 · 태그 추가" : `${linkMode === "access" ? "Access" : "Native VLAN"} 전송 · 태그 없음`,
    detail: uplinkDetail, nodeIds: ["switch-a", "switch-b"], edgeIds: ["trunk"], state: "moving",
    frameLabel: tagged ? `802.1Q · VLAN ${vlan}` : "Ethernet · 태그 없음",
    frameVlan: vlan, wireFormat: tagged ? "802.1Q" : "untagged",
  });
  steps.push({
    id: "classify-b", title: `SW-B 수신 · VLAN ${vlan} 유지`,
    detail: tagged
      ? `SW-B는 802.1Q 태그에서 VLAN ${vlan}을 읽습니다. 해당 VLAN 내부에서만 출력 포트를 선택합니다.`
      : `SW-B는 태그 없는 프레임을 수신 포트의 ${linkMode === "access" ? "access" : "native"} VLAN ${vlan}에 분류합니다. 양쪽 포트 설정은 같습니다.`,
    nodeIds: ["switch-b"], edgeIds: [], state: "moving",
    frameLabel: `내부 소속 · VLAN ${vlan}`, frameVlan: vlan, wireFormat: "internal",
  });

  if (destinationVlan !== vlan) {
    const detail = `VLAN ${vlan} 프레임은 VLAN ${destinationVlan} access 포트로 전달되지 않습니다. 이 모델에는 VLAN 사이를 연결할 L3 라우팅이 없습니다.`;
    steps.push({
      id: "blocked-vlan", title: "다른 VLAN으로 전달 불가", detail,
      nodeIds: ["switch-b"], edgeIds: [], state: "blocked",
      frameLabel: `VLAN ${vlan} 경계 · 전달 중단`, frameVlan: vlan, wireFormat: "internal",
    });
    return { ...base, title: "VLAN 경계에서 전달 차단", summary: detail, success: false, steps };
  }

  steps.push({
    id: "egress-access", title: "Access 포트로 출력 · 태그 없음",
    detail: tagged
      ? `목적지 PC의 VLAN ${vlan} access 포트로 출력합니다. 트렁크에서 사용한 802.1Q 태그는 PC에 전달되는 프레임에 포함되지 않습니다.`
      : `같은 VLAN ${vlan}의 목적지 access 포트로 태그 없는 프레임을 전달합니다.`,
    nodeIds: ["switch-b", destinationId], edgeIds: [`link-b${vlan}`], state: "moving",
    frameLabel: "Ethernet · 태그 없음", frameVlan: vlan, wireFormat: "untagged",
  });
  steps.push({
    id: "delivered", title: "같은 VLAN의 PC에 전달",
    detail: `PC B${vlan}이 태그 없는 이더넷 프레임을 받습니다. 스위치를 두 대 거쳤지만 VLAN ${vlan} 소속은 유지되었습니다.`,
    nodeIds: [destinationId], edgeIds: [], state: "success",
    frameLabel: "Ethernet · 수신 완료", frameVlan: vlan, wireFormat: "untagged",
  });
  return {
    ...base, title: `VLAN ${vlan} 전달 성공`,
    summary: `VLAN ${vlan} 프레임이 ${linkMode === "trunk" ? "트렁크" : "access"} 링크를 지나 같은 VLAN의 목적지 PC에 도착합니다.`,
    success: true, steps,
  };
}

export type RouteEntry = {
  id: string;
  destination: string;
  nextHop: string;
  interface: string;
  label: string;
};

export const ROUTES: RouteEntry[] = [
  { id: "route-lan-a", destination: "192.168.10.0/24", nextHop: "직접 연결", interface: "Gi0/1", label: "LAN-A" },
  { id: "route-lan-b", destination: "192.168.20.0/24", nextHop: "직접 연결", interface: "Gi0/2", label: "LAN-B" },
  { id: "route-wan-a", destination: "10.0.0.0/8", nextHop: "172.16.0.2", interface: "Gi0/3", label: "WAN-A" },
  { id: "route-wan-b", destination: "10.20.0.0/16", nextHop: "172.16.1.2", interface: "Gi0/4", label: "WAN-B" },
  { id: "route-default", destination: "0.0.0.0/0", nextHop: "172.16.2.2", interface: "Gi0/5", label: "기본 경로" },
];

export const ROUTING_DESTINATIONS = [
  { id: "lan-a", label: "LAN-A · /24", address: "192.168.10.42" },
  { id: "lan-b", label: "LAN-B · /24", address: "192.168.20.42" },
  { id: "wide", label: "WAN-A · /8", address: "10.7.1.8" },
  { id: "specific", label: "WAN-B · /16 우선", address: "10.20.3.7" },
  { id: "fallback", label: "기본 경로 · /0", address: "203.0.113.9" },
];

function ipv4Number(address: string): number {
  const octets = address.split(".");
  if (octets.length !== 4 || octets.some((octet) => octet.trim() !== octet || !/^(0|[1-9]\d{0,2})$/.test(octet) || Number(octet) > 255)) {
    throw new RangeError(`유효한 IPv4 주소가 아닙니다: ${address}`);
  }
  // Arithmetic avoids JavaScript bitwise operators' signed 32-bit conversion.
  return octets.reduce((value, octet) => value * 256 + Number(octet), 0);
}

function parsePrefix(destination: string) {
  const parts = destination.split("/");
  if (parts.length !== 2 || parts[1].trim() !== parts[1] || !/^(0|[1-9]|[12]\d|3[0-2])$/.test(parts[1])) {
    throw new RangeError(`유효한 IPv4 CIDR이 아닙니다: ${destination}`);
  }
  const address = ipv4Number(parts[0]);
  const length = Number(parts[1]);
  const blockSize = 2 ** (32 - length);
  return { length, blockSize, network: Math.floor(address / blockSize) };
}

/**
 * Longest-prefix match over an already selected forwarding table.
 * Invalid IPv4/CIDR throws RangeError; equally specific entries keep input order.
 * Administrative distance, metrics and ECMP are outside this model.
 */
export function findBestRoute(destination: string, routes: RouteEntry[]): RouteEntry | undefined {
  const address = ipv4Number(destination);
  let best: RouteEntry | undefined;
  let bestLength = -1;
  for (const route of routes) {
    const prefix = parsePrefix(route.destination);
    if (Math.floor(address / prefix.blockSize) === prefix.network && prefix.length > bestLength) {
      best = route;
      bestLength = prefix.length;
    }
  }
  return best;
}

export type RoutingSimulation = {
  title: string;
  summary: string;
  success: boolean;
  steps: NetworkStep[];
  route?: RouteEntry;
};

const routeNodeIds: Record<string, string> = {
  "route-lan-a": "lan-a", "route-lan-b": "lan-b",
  "route-wan-a": "wan-a", "route-wan-b": "wan-b", "route-default": "internet",
};

export function getRoutingSimulation(destination: string, includeDefault: boolean): RoutingSimulation {
  let address: number;
  try {
    address = ipv4Number(destination);
  } catch {
    const detail = "IPv4 주소는 0부터 255 사이의 십진수 네 개를 점으로 구분합니다. 공백이나 앞자리 0을 붙이지 않습니다.";
    return {
      title: "목적지 주소 확인 필요", summary: detail, success: false,
      steps: [{ id: "invalid", title: "유효하지 않은 IPv4", detail, nodeIds: ["client"], edgeIds: [], state: "blocked", frameLabel: "패킷 생성 안 함" }],
    };
  }
  const routes = ROUTES.filter((route) => includeDefault || route.id !== "route-default");
  const matchingRoutes = routes.filter((route) => {
    const prefix = parsePrefix(route.destination);
    return Math.floor(address / prefix.blockSize) === prefix.network;
  });
  const route = findBestRoute(destination, routes);
  const frameLabel = `IPv4 · 목적지 ${destination}`;
  const steps: NetworkStep[] = [
    { id: "source", title: "목적지 IP 확인", detail: `${destination}을 목적지로 하는 IPv4 패킷을 준비합니다. 클라이언트의 게이트웨이는 이 모델의 라우터입니다.`, nodeIds: ["client"], edgeIds: [], state: "ready", frameLabel },
    { id: "ingress", title: "라우터에 패킷 도착", detail: "클라이언트가 다음 홉인 라우터로 패킷을 보냅니다. 이후 비교 대상은 패킷의 목적지 IP입니다.", nodeIds: ["client", "router"], edgeIds: ["client-router"], state: "moving", frameLabel },
    {
      id: "lookup", title: "일치하는 프리픽스 비교",
      detail: matchingRoutes.length > 0
        ? `일치 후보: ${matchingRoutes.map((candidate) => candidate.destination).join(" · ")}. 이 중 프리픽스 길이가 가장 긴 경로를 선택합니다.`
        : "목적지와 일치하는 프리픽스가 없습니다. 기본 경로도 현재 표에 없습니다.",
      nodeIds: ["router"], edgeIds: [], state: "moving", frameLabel, wireFormat: "internal",
    },
  ];

  if (!route) {
    const detail = `${destination}에 일치하는 경로가 없어 라우터가 패킷을 폐기합니다. 다른 인터페이스로 임의 전송하지 않습니다.`;
    steps.push({ id: "no-route", title: "경로 없음 · 패킷 폐기", detail, nodeIds: ["router"], edgeIds: [], state: "blocked", frameLabel, wireFormat: "internal" });
    return { title: "경로 없음", summary: detail, success: false, steps };
  }

  const isDefault = route.id === "route-default";
  const nodeId = routeNodeIds[route.id];
  steps.push({
    id: "selected", title: isDefault ? "기본 경로 /0 선택" : `${route.destination} 선택`,
    detail: `${isDefault ? "더 구체적인 일치 경로가 없어 기본 경로를 사용합니다." : `일치 후보 중 /${parsePrefix(route.destination).length}이 가장 긴 프리픽스입니다.`} 출력 ${route.interface} · 다음 홉 ${route.nextHop}.`,
    nodeIds: ["router"], edgeIds: [], state: "moving", frameLabel, wireFormat: "internal",
  });
  steps.push({
    id: "forward", title: `${route.label} 방향으로 전달`,
    detail: `${route.interface}로 패킷을 내보냅니다. ${route.nextHop === "직접 연결" ? "목적지가 직접 연결된 네트워크에 있습니다." : `다음 라우터 ${route.nextHop}으로 전달합니다.`} 목적지 IP는 계속 ${destination}입니다.`,
    nodeIds: ["router", nodeId], edgeIds: [route.id], state: "moving", frameLabel,
  });
  const summary = `${route.destination} → ${route.interface} · ${route.label}. 이 결과는 현재 라우터의 전달 결정이며 최종 목적지 도달을 보장하지 않습니다.`;
  steps.push({ id: "forwarded", title: "현재 라우터의 전달 완료", detail: summary, nodeIds: [nodeId], edgeIds: [], state: "success", frameLabel });
  return { title: isDefault ? "기본 경로로 전달" : `${route.label} 경로 선택`, summary, success: true, steps, route };
}
