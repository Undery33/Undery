import type { NetworkStep } from "./network-demos";

export type RoutingMethod = "static" | "rip" | "ospf" | "eigrp" | "isis" | "bgp" | "pbr";
export type RoutingPathId = "upper" | "lower";
export type RoutingFailure = "none" | "upper-local" | "upper-remote" | "both";

export type RoutingLabInput = {
  method: RoutingMethod;
  failure: RoutingFailure;
  staticPath: RoutingPathId;
  floatingBackup: boolean;
  /** Manually configured metric on every inter-router link in this branch. */
  upperCost: number;
  lowerCost: number;
  /** Minimum configured bandwidth across the complete path, in kbit/s. */
  upperBandwidth: number;
  lowerBandwidth: number;
  /** Sum of configured interface delays across the complete path, in microseconds. */
  upperDelay: number;
  lowerDelay: number;
  upperLocalPref: number;
  lowerLocalPref: number;
  policyMatch: boolean;
  policyPath: RoutingPathId;
};

export const DEFAULT_ROUTING_INPUT: RoutingLabInput = {
  method: "ospf",
  failure: "none",
  staticPath: "upper",
  floatingBackup: false,
  upperCost: 10,
  lowerCost: 10,
  upperBandwidth: 100_000,
  lowerBandwidth: 10_000,
  upperDelay: 200,
  lowerDelay: 300,
  upperLocalPref: 100,
  lowerLocalPref: 100,
  policyMatch: true,
  policyPath: "lower",
};

export const ROUTING_METHOD_NAMES: Record<RoutingMethod, string> = {
  static: "정적 라우팅", rip: "RIPv2", ospf: "OSPFv2", eigrp: "EIGRP",
  isis: "IS-IS", bgp: "BGP", pbr: "PBR",
};

export const ROUTING_LAB_DESTINATION = "192.0.2.0/24";
export const ROUTING_LAB_HOST = "192.0.2.10";

export type RoutingCandidate = {
  id: RoutingPathId;
  label: string;
  nodeIds: string[];
  edgeIds: string[];
  nextHop: string;
  /** Eligible at R1. A static route can be eligible despite a remote failure. */
  available: boolean;
  endToEndAvailable: boolean;
  metric: number | null;
  metricLabel: string;
  reason: string;
  /** Both candidates are selected when an IGP installs equal-cost paths. */
  selected: boolean;
  hopCount: number;
  spfCost: number;
  eigrpMetric: number;
  localPref: number;
  asPath: number[];
};

export type RoutingMethodSimulation = {
  input: RoutingLabInput;
  method: RoutingMethod;
  destination: string;
  title: string;
  summary: string;
  success: boolean;
  selectedPath: RoutingPathId | null;
  /** Installed equal-cost paths; one path is illustrated for a single packet. */
  equalCostPaths: RoutingPathId[];
  candidates: RoutingCandidate[];
  steps: NetworkStep[];
  failedEdgeIds: string[];
  /** Nodes actually reached by the illustrated data packet. */
  forwardingPath: string[];
  selectionBasis: string;
  routeCode: string;
  limitations: string[];
};

const PATHS = [
  { id: "upper", label: "위 경로 · R2", nodes: ["r1", "r2", "r4"], edges: ["r1-r2", "r2-r4"], nextHop: "10.0.12.2", asPath: [65010, 65040] },
  { id: "lower", label: "아래 경로 · R3 → R5", nodes: ["r1", "r3", "r5", "r4"], edges: ["r1-r3", "r3-r5", "r5-r4"], nextHop: "10.0.13.3", asPath: [65020, 65030, 65040] },
] as const;

const ROUTE_CODES: Record<RoutingMethod, string> = {
  static: "S", rip: "R", ospf: "O", eigrp: "D", isis: "i L2", bgp: "B", pbr: "PBR / S",
};

const SELECTION_BASIS: Record<RoutingMethod, string> = {
  static: "관리자가 지정한 다음 홉 · 주 경로 AD 1 / 플로팅 정적 경로 AD 10",
  rip: "같은 목적지의 최소 홉 수 · 16은 도달 불가",
  ospf: "같은 Area 0 내부 경로의 누적 cost · SPF(Dijkstra)",
  eigrp: "기본 K 값의 classic metric · 최소 대역폭과 누적 delay",
  isis: "같은 Level 2 경로의 누적 wide metric · SPF(Dijkstra)",
  bgp: "유효한 두 외부 경로에서 높은 LOCAL_PREF → 짧은 AS_PATH",
  pbr: "route-map 조건과 set ip next-hop · 적용할 수 없으면 일반 경로표",
};

function integerInRange(value: number, min: number, max: number, field: string) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${field} must be an integer from ${min} to ${max}`);
  }
}

function validateInput(input: RoutingLabInput) {
  if (!Object.hasOwn(ROUTING_METHOD_NAMES, input.method)) throw new RangeError("Unsupported routing method");
  if (!["none", "upper-local", "upper-remote", "both"].includes(input.failure)) throw new RangeError("Unsupported link failure");
  if (!["upper", "lower"].includes(input.staticPath) || !["upper", "lower"].includes(input.policyPath)) throw new RangeError("Unsupported routing path");
  if (typeof input.floatingBackup !== "boolean" || typeof input.policyMatch !== "boolean") throw new RangeError("Routing switches must be booleans");
  for (const field of ["upperCost", "lowerCost"] as const) integerInRange(input[field], 1, 65_535, field);
  for (const field of ["upperBandwidth", "lowerBandwidth"] as const) integerInRange(input[field], 1, 10_000_000, field);
  for (const field of ["upperDelay", "lowerDelay"] as const) {
    integerInRange(input[field], 0, 10_000_000, field);
    if (input[field] % 10 !== 0) throw new RangeError(`${field} must be a multiple of 10 microseconds`);
  }
  for (const field of ["upperLocalPref", "lowerLocalPref"] as const) integerInRange(input[field], 0, 4_294_967_295, field);
}

/** Cisco classic EIGRP, default K1=K3=1 and K2=K4=K5=0; no wide metrics. */
export function getClassicEigrpMetric(minBandwidthKbps: number, totalDelayMicroseconds: number) {
  integerInRange(minBandwidthKbps, 1, 10_000_000, "minBandwidthKbps");
  integerInRange(totalDelayMicroseconds, 0, 10_000_000, "totalDelayMicroseconds");
  if (totalDelayMicroseconds % 10 !== 0) throw new RangeError("Delay must use 10-microsecond units");
  return 256 * (Math.floor(10_000_000 / minBandwidthKbps) + totalDelayMicroseconds / 10);
}

function failedEdges(failure: RoutingFailure): string[] {
  switch (failure) {
    case "upper-local": return ["r1-r2"];
    case "upper-remote": return ["r2-r4"];
    case "both": return ["r1-r2", "r1-r3"];
    default: return [];
  }
}

/** SPF on the live graph. All equal-cost next-hop branches remain candidates. */
function shortestPaths(input: RoutingLabInput, failed: ReadonlySet<string>): RoutingPathId[] {
  const graph = new Map<string, { to: string; cost: number }[]>();
  function connect(from: string, to: string, cost: number) {
    graph.set(from, [...(graph.get(from) ?? []), { to, cost }]);
    graph.set(to, [...(graph.get(to) ?? []), { to: from, cost }]);
  }
  for (const path of PATHS) {
    const cost = path.id === "upper" ? input.upperCost : input.lowerCost;
    path.edges.forEach((edge, index) => {
      if (!failed.has(edge)) connect(path.nodes[index], path.nodes[index + 1], cost);
    });
  }
  connect("r4", "destination", 1);
  const distance = new Map<string, number>([["r1", 0]]);
  const predecessors = new Map<string, string[]>();
  const pending = new Set(graph.keys());
  while (pending.size) {
    const current = [...pending].sort((a, b) => (distance.get(a) ?? Infinity) - (distance.get(b) ?? Infinity))[0];
    const currentDistance = distance.get(current) ?? Infinity;
    if (!Number.isFinite(currentDistance)) break;
    pending.delete(current);
    for (const link of graph.get(current) ?? []) {
      if (!pending.has(link.to)) continue;
      const candidate = currentDistance + link.cost;
      const previous = distance.get(link.to) ?? Infinity;
      if (candidate < previous) {
        distance.set(link.to, candidate);
        predecessors.set(link.to, [current]);
      } else if (candidate === previous) {
        predecessors.set(link.to, [...(predecessors.get(link.to) ?? []), current]);
      }
    }
  }
  if (!distance.has("destination")) return [];
  const firstHops = new Set<string>();
  function visit(node: string) {
    for (const previous of predecessors.get(node) ?? []) {
      if (previous === "r1") firstHops.add(node);
      else visit(previous);
    }
  }
  visit("destination");
  return PATHS.filter((path) => firstHops.has(path.nodes[1])).map((path) => path.id);
}

function makeCandidate(input: RoutingLabInput, path: typeof PATHS[number], failed: ReadonlySet<string>): RoutingCandidate {
  const upper = path.id === "upper";
  const endToEndAvailable = path.edges.every((edge) => !failed.has(edge));
  const hopCount = path.edges.length;
  const spfCost = hopCount * (upper ? input.upperCost : input.lowerCost) + 1;
  const eigrpMetric = getClassicEigrpMetric(upper ? input.upperBandwidth : input.lowerBandwidth, upper ? input.upperDelay : input.lowerDelay);
  const localPref = upper ? input.upperLocalPref : input.lowerLocalPref;
  const localAvailable = !failed.has(path.edges[0]);
  let available = endToEndAvailable;
  let metric: number | null = null;
  let metricLabel = "";
  let reason = endToEndAvailable ? "유효한 후보" : "장애 반영 후 후보에서 제외";

  switch (input.method) {
    case "static": {
      const primary = path.id === input.staticPath;
      const configured = primary || input.floatingBackup;
      available = configured && localAvailable;
      metric = configured ? primary ? 1 : 10 : null;
      metricLabel = configured ? `AD ${metric} · ${primary ? "주 경로" : "플로팅"}` : "설정 없음";
      reason = !configured ? "정적 경로를 구성하지 않았습니다." : !localAvailable ? "R1의 직접 연결 링크가 내려가 다음 홉을 해석할 수 없습니다." : !endToEndAvailable ? "R1의 다음 홉은 유효하지만 R2 이후는 전달할 수 없습니다." : primary ? "관리자가 구성한 주 경로입니다." : "주 경로가 없어지면 사용하는 백업입니다.";
      break;
    }
    case "rip":
      metric = endToEndAvailable ? hopCount : 16;
      metricLabel = endToEndAvailable ? `${hopCount} hops` : "16 · 도달 불가";
      break;
    case "ospf": case "isis":
      metric = endToEndAvailable ? spfCost : null;
      metricLabel = endToEndAvailable ? `${input.method === "ospf" ? "Cost" : "Metric"} ${spfCost}` : "SPF 경로 없음";
      break;
    case "eigrp":
      metric = endToEndAvailable ? eigrpMetric : null;
      metricLabel = endToEndAvailable ? `Classic ${eigrpMetric.toLocaleString("en-US")}` : "유효한 광고 없음";
      break;
    case "bgp":
      metricLabel = `LOCAL_PREF ${localPref} · AS_PATH ${path.asPath.length}`;
      reason = endToEndAvailable ? "동일한 목적지에 대한 유효한 외부 광고입니다." : "장애를 반영하는 BGP UPDATE/withdraw 처리가 완료되었다고 가정합니다.";
      break;
    case "pbr":
      available = localAvailable;
      metricLabel = path.id === input.policyPath ? "정책 다음 홉" : "정책 대상 아님";
      reason = !localAvailable ? "정책 다음 홉의 직접 연결 경로가 없습니다." : !endToEndAvailable ? "다음 홉은 해석되지만 원격 링크 장애를 추적하지 않습니다." : "다음 홉의 직접 연결 경로가 있습니다.";
      break;
  }
  return { id: path.id, label: path.label, nodeIds: [...path.nodes], edgeIds: [...path.edges], nextHop: path.nextHop, available, endToEndAvailable, metric, metricLabel, reason, selected: false, hopCount, spfCost, eigrpMetric, localPref, asPath: [...path.asPath] };
}

function selectPaths(input: RoutingLabInput, candidates: RoutingCandidate[], failed: ReadonlySet<string>): RoutingPathId[] {
  const available = candidates.filter((candidate) => candidate.available);
  switch (input.method) {
    case "ospf": case "isis": return shortestPaths(input, failed);
    case "static": {
      const selected = [...available].sort((a, b) => a.metric! - b.metric!)[0];
      return selected ? [selected.id] : [];
    }
    case "bgp": {
      const selected = [...available].sort((a, b) => b.localPref - a.localPref || a.asPath.length - b.asPath.length)[0];
      return selected ? [selected.id] : [];
    }
    case "pbr": {
      const policy = available.find((candidate) => candidate.id === input.policyPath);
      if (input.policyMatch && policy) return [policy.id];
      return available.some((candidate) => candidate.id === "upper") ? ["upper"] : [];
    }
    default: {
      const min = Math.min(...available.map((candidate) => candidate.metric!));
      return available.filter((candidate) => candidate.metric === min).map((candidate) => candidate.id);
    }
  }
}

function limitations(method: RoutingMethod): string[] {
  const common = [
    "동일한 192.0.2.0/24 목적지의 경로만 비교합니다. 서로 다른 프로토콜의 metric을 직접 비교하지 않습니다.",
    "프로토콜 전체를 실행하지 않는 개념 모형입니다. 전송 애니메이션은 데이터 패킷이며 실제 수렴 시간과 일시적 루프를 재현하지 않습니다.",
    "선택된 방향의 단방향 전달만 확인합니다. 응답 경로, ARP, TTL 및 실제 패킷 송수신은 생략합니다.",
  ];
  const specific: Record<RoutingMethod, string[]> = {
    static: ["R1의 직접 연결 다음 홉을 사용하는 정적 경로입니다. IP SLA, object tracking, BFD 및 재귀 대체 경로는 없습니다. 원격 장애만으로는 R1의 경로가 사라지지 않을 수 있습니다.", "중간 라우터에는 해당 분기의 목적지 방향 경로만 구성되어 있습니다. R2 자체의 우회 경로는 없으므로 R2–R4 장애 시 R2에서 전달을 중단합니다."],
    rip: ["RIPv2가 장애 정보를 교환한 뒤의 결과입니다. 주기·triggered update, split horizon, poison reverse 및 타이머는 재현하지 않습니다."],
    ospf: ["동일한 Area 0의 intra-area 경로만 계산합니다. 각 분기 내부 링크의 양방향 cost는 같고 목적지 LAN cost는 1입니다. DR/BDR, LSA 종류, 외부 경로 우선순위는 생략합니다.", "ECMP에서는 설치 가능한 모든 동률 경로를 표시하지만 패킷 하나의 이동은 위 경로로 시연합니다. 실제 해시와 maximum-paths 설정은 재현하지 않습니다."],
    eigrp: ["Classic metric과 기본 K 값만 사용합니다. 입력 대역폭은 전체 경로의 최소 설정값이며 delay는 목적지 LAN까지 포함한 설정 delay 합계입니다. 실측 지연이나 처리량이 아닙니다.", "DUAL 전체, reported distance·feasible distance의 이력, feasible successor 판정 및 unequal-cost variance는 재현하지 않습니다. 장애 정보 교환과 재계산이 끝난 결과만 비교합니다."],
    isis: ["단일 Level 2의 wide metric만 계산합니다. 각 분기 내부 링크의 양방향 metric은 같고 목적지 IP prefix metric은 1입니다. Level 1/2 경계와 IPv6 topology 구성은 생략합니다.", "ECMP의 경로 목록을 표시하고 패킷 하나만 시연합니다. maximum-paths 및 CEF 해시는 생략합니다."],
    bgp: ["두 후보 모두 유효한 외부 광고이며 WEIGHT=0, 로컬 생성 여부 및 더 높은 우선순위 속성은 같습니다. LOCAL_PREF 다음 AS_PATH 길이만 비교하며 전체 Cisco best-path 절차를 대체하지 않습니다.", "R2·R3은 인접 AS 진입점이며 3D 경로는 개념도입니다. AS_PATH 숫자는 개별 물리 라우터 수가 아닙니다. 장애 뒤 withdraw 또는 세션/next-hop 무효화가 R1에 반영된 상태를 가정합니다."],
    pbr: ["일반 set ip next-hop의 기본 동작을 단순화합니다. 조건 미일치 또는 직접 연결 다음 홉 경로 부재 시 일반 경로표의 위쪽 정적 경로를 사용합니다. 원격 도달성 tracking은 없습니다.", "정책이 경로를 학습하는 프로토콜은 아닙니다. 이 모형의 PBR 정상 경로표에는 아래쪽 경로가 추가되어 있지 않습니다.", "중간 라우터에는 해당 분기의 목적지 방향 경로만 구성되어 있습니다. R2 자체의 우회 경로는 없으므로 R2–R4 장애 시 R2에서 전달을 중단합니다."],
  };
  return [...specific[method], ...common];
}

function controlSteps(input: RoutingLabInput, selected: RoutingCandidate | undefined, equalCostPaths: RoutingPathId[]): NetworkStep[] {
  const name = ROUTING_METHOD_NAMES[input.method];
  const nodeIds = ["r1"];
  const control = (id: string, title: string, detail: string): NetworkStep => ({ id, title, detail, nodeIds, edgeIds: [], state: "ready", frameLabel: "CONTROL PLANE · 데이터 전송 전" });
  const chosen = selected ? `${selected.label}의 다음 홉 ${selected.nextHop}` : "사용할 수 있는 다음 홉 없음";
  if (input.method === "static") {
    return [
      control("configure", "정적 경로와 다음 홉 확인", "관리자가 지정한 주 경로와 선택적 플로팅 정적 경로를 확인합니다. 주 경로 AD는 1, 백업 AD는 10입니다."),
      control("install", "유효한 정적 경로 설치", `${chosen}. 직접 연결 다음 홉의 유효성만 확인하며 원격 링크를 탐지하지 않습니다.`),
    ];
  }
  if (input.method === "pbr") {
    return [
      control("rib", "일반 경로표 준비", "정상 RIB에는 R2를 다음 홉으로 사용하는 위쪽 정적 경로가 있습니다. 직접 연결 링크가 내려가면 이 경로는 제외됩니다."),
    ];
  }
  const detect = input.failure === "none" ? "동작 중인 이웃과 경로 정보를 사용합니다." : "링크 장애 또는 경로 철회 정보가 프로토콜에 반영된 상황을 모델링합니다. 실제 감지·전파·수렴에는 시간이 필요합니다.";
  const update: Record<Exclude<RoutingMethod, "static" | "pbr">, [string, string]> = {
    rip: ["거리 벡터 갱신", "이웃의 목적지별 거리 정보를 반영합니다. 각 라우터를 지날 때 hop count가 증가하며 16은 도달 불가입니다."],
    ospf: ["LSA 반영 · LSDB 갱신", "같은 Area 0 내부의 연결 상태와 cost가 LSDB에 반영된 상태를 사용합니다."],
    eigrp: ["경로 광고 반영 · 재계산", "장애 정보 교환과 필요한 DUAL 처리가 끝났다고 가정하고 유효한 후보의 classic metric을 비교합니다. 즉시 우회 여부를 뜻하지 않습니다."],
    isis: ["LSP 반영 · LSDB 갱신", "같은 Level 2의 연결 상태와 wide metric이 링크 상태 데이터베이스에 반영된 상태를 사용합니다."],
    bgp: ["UPDATE / withdraw 반영", "이웃의 광고 또는 철회를 반영한 유효 경로를 사용합니다. BGP가 원격 물리 장애를 즉시 직접 감지한다는 의미는 아닙니다."],
  };
  const [updateTitle, updateDetail] = update[input.method];
  const algorithm = input.method === "ospf" || input.method === "isis" ? "SPF 최단 경로 계산" : input.method === "bgp" ? "BGP 속성 비교" : input.method === "eigrp" ? "EIGRP metric 비교" : "최소 hop count 선택";
  return [
    control("detect", `${name} 경로 정보 확인`, detect),
    control("update", updateTitle, updateDetail),
    control("calculate", algorithm, `${SELECTION_BASIS[input.method]}. ${chosen}.${equalCostPaths.length > 1 ? " 비용이 같은 두 경로를 모두 설치하며 이 패킷은 위 경로를 따릅니다." : ""}`),
    control("install", "전달 경로표 반영", selected ? `${ROUTE_CODES[input.method]} ${ROUTING_LAB_DESTINATION} → ${selected.nextHop}. 이후 데이터 패킷이 이 경로를 사용합니다.` : "목적지 경로를 설치할 수 없습니다. 이 실습에는 대체 기본 경로가 없습니다."),
  ];
}

/**
 * Deterministic route-selection lesson, not a Cisco OS/protocol emulator.
 * Control-plane updates precede data movement; failed links are never traversed.
 */
export function getRoutingMethodSimulation(input: RoutingLabInput): RoutingMethodSimulation {
  validateInput(input);
  const failedEdgeIds = failedEdges(input.failure);
  const failed = new Set(failedEdgeIds);
  const candidates = PATHS.map((path) => makeCandidate(input, path, failed));
  const equalCostPaths = selectPaths(input, candidates, failed);
  for (const candidate of candidates) candidate.selected = equalCostPaths.includes(candidate.id);
  const selectedPath = equalCostPaths[0] ?? null;
  const selected = candidates.find((candidate) => candidate.id === selectedPath);
  if (input.method === "pbr" && selected) {
    const applied = input.policyMatch && selected.id === input.policyPath;
    selected.metricLabel = applied ? "route-map 일치 · 정책 다음 홉" : "일반 RIB · 정적 경로 AD 1";
    selected.reason = applied
      ? "조건이 일치하고 정책 다음 홉을 해석할 수 있어 일반 경로표보다 먼저 적용합니다."
      : "조건 미일치 또는 정책 다음 홉 부재로 일반 목적지 기반 경로표를 사용합니다.";
    if (!selected.endToEndAvailable) selected.reason += " 원격 링크 장애는 별도로 추적하지 않습니다.";
  }
  const success = Boolean(selected?.endToEndAvailable);
  const steps = controlSteps(input, selected, equalCostPaths);
  const forwardingPath = ["client", "r1"];
  steps.push({ id: "receive", title: "R1이 데이터 패킷 수신", detail: `CLIENT가 목적지 ${ROUTING_LAB_HOST}인 IPv4 패킷을 R1에 전달합니다.`, nodeIds: ["client", "r1"], edgeIds: ["client-r1"], state: "moving", frameLabel: `IPv4 → ${ROUTING_LAB_HOST}` });
  if (input.method === "pbr") {
    const applied = input.policyMatch && selected?.id === input.policyPath;
    const chosen = selected ? `${selected.label}의 다음 홉 ${selected.nextHop}` : "사용할 수 있는 다음 홉 없음";
    steps.push({
      id: "policy",
      title: "입력 패킷의 route-map 판정",
      detail: `R1이 수신한 데이터 패킷을 분류합니다. ${input.policyMatch ? "조건이 일치합니다." : "조건이 일치하지 않습니다."} ${applied ? "해석 가능한 정책 다음 홉을 사용합니다." : "일반 목적지 기반 경로표로 돌아갑니다."} ${chosen}.`,
      nodeIds: ["r1"], edgeIds: [], state: "moving", frameLabel: "DATA PLANE · PBR",
    });
  }
  if (!selected) {
    steps.push({ id: "drop-no-route", title: "경로 없음 · 전달 중단", detail: "R1에서 사용할 목적지 경로와 다음 홉을 찾을 수 없습니다. 기본 경로도 없어 패킷을 폐기합니다.", nodeIds: ["r1"], edgeIds: [], state: "blocked", frameLabel: "DROP · 경로 없음" });
  } else {
    for (let index = 0; index < selected.edgeIds.length; index += 1) {
      const edge = selected.edgeIds[index];
      const from = selected.nodeIds[index];
      const to = selected.nodeIds[index + 1];
      if (failed.has(edge)) {
        steps.push({ id: "drop-remote", title: "원격 링크 장애 · 전달 중단", detail: `${from.toUpperCase()}에서 ${to.toUpperCase()}로 향하는 링크가 내려갔습니다. R1의 직접 연결 다음 홉은 살아 있으므로 ${input.method === "pbr" ? "정책" : "정적"} 선택만으로 이 장애를 해결하지 못합니다.`, nodeIds: [from], edgeIds: [], state: "blocked", frameLabel: "DROP · 원격 링크 장애" });
        break;
      }
      forwardingPath.push(to);
      steps.push({ id: `forward-${edge}`, title: `${from.toUpperCase()} → ${to.toUpperCase()} 전달`, detail: `${selected.label}을 따라 목적지 ${ROUTING_LAB_HOST}인 패킷을 다음 라우터로 전달합니다.`, nodeIds: [from, to], edgeIds: [edge], state: "moving", frameLabel: `IPv4 → ${ROUTING_LAB_HOST}` });
    }
    if (success) {
      forwardingPath.push("destination");
      steps.push({ id: "forward-lan", title: "R4 → 목적지 LAN 전달", detail: `R4의 직접 연결 ${ROUTING_LAB_DESTINATION} 네트워크로 패킷을 출력합니다.`, nodeIds: ["r4", "destination"], edgeIds: ["r4-destination"], state: "moving", frameLabel: `IPv4 → ${ROUTING_LAB_HOST}` });
      steps.push({ id: "delivered", title: "목적지에 전달 완료", detail: `목적지 ${ROUTING_LAB_HOST}에 데이터 패킷이 도착했습니다.`, nodeIds: ["destination"], edgeIds: [], state: "success", frameLabel: "IPv4 · 수신 완료" });
    }
  }

  const title = success ? `${selected!.label} 선택` : selected ? "R1 경로 유지 · 원격 전달 실패" : "사용 가능한 경로 없음";
  const summary = selected
    ? `${ROUTING_METHOD_NAMES[input.method]}에서 ${selected.nextHop}을 선택합니다. ${success ? `${selected.metricLabel}.` : "선택한 다음 홉 이후의 장애 때문에 목적지에 도달하지 못합니다."}${equalCostPaths.length > 1 ? " 동률 경로 2개 중 위 경로의 패킷을 시연합니다." : ""}`
    : "현재 설정과 장애 상태에서는 목적지 경로를 사용할 수 없습니다.";
  return { input: { ...input }, method: input.method, destination: ROUTING_LAB_DESTINATION, title, summary, success, selectedPath, equalCostPaths, candidates, steps, failedEdgeIds, forwardingPath, selectionBasis: SELECTION_BASIS[input.method], routeCode: ROUTE_CODES[input.method], limitations: limitations(input.method) };
}
