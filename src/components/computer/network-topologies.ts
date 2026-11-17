export type NetworkNode = {
  id: string;
  label: string;
  detail: string;
  kind: "pc" | "switch" | "router" | "network" | "gateway";
  position: [number, number];
};

export type NetworkEdge = {
  id: string;
  from: string;
  to: string;
};

export type NetworkTopology = {
  id: "vlan" | "routing" | "routing-methods";
  label: string;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
};

export const VLAN_TOPOLOGY: NetworkTopology = {
  id: "vlan",
  label: "두 스위치와 VLAN 10·20에 연결된 네 대의 PC",
  nodes: [
    { id: "pc-a10", label: "PC-A10", detail: "VLAN 10", kind: "pc", position: [-6.1, -3] },
    { id: "pc-a20", label: "PC-A20", detail: "VLAN 20", kind: "pc", position: [-6.1, 3] },
    { id: "switch-a", label: "SW-A", detail: "L2 SWITCH", kind: "switch", position: [-2.5, 0] },
    { id: "switch-b", label: "SW-B", detail: "L2 SWITCH", kind: "switch", position: [2.5, 0] },
    { id: "pc-b10", label: "PC-B10", detail: "VLAN 10", kind: "pc", position: [6.1, -3] },
    { id: "pc-b20", label: "PC-B20", detail: "VLAN 20", kind: "pc", position: [6.1, 3] },
  ],
  edges: [
    { id: "link-a10", from: "pc-a10", to: "switch-a" },
    { id: "link-a20", from: "pc-a20", to: "switch-a" },
    { id: "trunk", from: "switch-a", to: "switch-b" },
    { id: "link-b10", from: "switch-b", to: "pc-b10" },
    { id: "link-b20", from: "switch-b", to: "pc-b20" },
  ],
};

export const ROUTING_TOPOLOGY: NetworkTopology = {
  id: "routing",
  label: "클라이언트에서 라우터를 거쳐 다섯 출력 경로로 갈라지는 네트워크",
  nodes: [
    { id: "client", label: "CLIENT", detail: "IPv4 PACKET", kind: "pc", position: [-6.2, 0] },
    { id: "router", label: "R1", detail: "LONGEST PREFIX", kind: "router", position: [-2, 0] },
    { id: "lan-a", label: "LAN-A", detail: "192.168.10.0/24", kind: "network", position: [2.4, -4] },
    { id: "lan-b", label: "LAN-B", detail: "192.168.20.0/24", kind: "network", position: [5, -2.2] },
    { id: "wan-a", label: "WAN-A", detail: "10.0.0.0/8", kind: "gateway", position: [6.1, 0] },
    { id: "wan-b", label: "WAN-B", detail: "10.20.0.0/16", kind: "gateway", position: [5, 2.2] },
    { id: "internet", label: "DEFAULT", detail: "0.0.0.0/0", kind: "gateway", position: [2.4, 4] },
  ],
  edges: [
    { id: "client-router", from: "client", to: "router" },
    { id: "route-lan-a", from: "router", to: "lan-a" },
    { id: "route-lan-b", from: "router", to: "lan-b" },
    { id: "route-wan-a", from: "router", to: "wan-a" },
    { id: "route-wan-b", from: "router", to: "wan-b" },
    { id: "route-default", from: "router", to: "internet" },
  ],
};

/** Kept stable while routing settings change so the user's camera is preserved. */
export const CISCO_ROUTING_TOPOLOGY: NetworkTopology = {
  id: "routing-methods",
  label: "R1에서 R4로 가는 상단 두 홉 경로와 하단 세 홉 경로",
  nodes: [
    { id: "client", label: "CLIENT", detail: "IPv4 PACKET", kind: "pc", position: [-7, 0] },
    { id: "r1", label: "R1", detail: "ROUTE SELECTION", kind: "router", position: [-4.4, 0] },
    { id: "r2", label: "R2", detail: "UPPER PATH", kind: "router", position: [-1.4, -2.8] },
    { id: "r3", label: "R3", detail: "LOWER PATH", kind: "router", position: [-2, 2.7] },
    { id: "r5", label: "R5", detail: "LOWER PATH", kind: "router", position: [1.2, 2.7] },
    { id: "r4", label: "R4", detail: "DESTINATION LAN", kind: "router", position: [4.1, 0] },
    { id: "destination", label: "DEST", detail: "192.0.2.10 /24", kind: "network", position: [7, 0] },
  ],
  edges: [
    { id: "client-r1", from: "client", to: "r1" },
    { id: "r1-r2", from: "r1", to: "r2" },
    { id: "r2-r4", from: "r2", to: "r4" },
    { id: "r1-r3", from: "r1", to: "r3" },
    { id: "r3-r5", from: "r3", to: "r5" },
    { id: "r5-r4", from: "r5", to: "r4" },
    { id: "r4-destination", from: "r4", to: "destination" },
  ],
};
