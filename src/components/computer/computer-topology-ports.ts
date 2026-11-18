import type { Point3, TopologyDevice } from "./computer-topology-devices";
import { caseDirection, casePoint } from "./computer-topology-poses";

type PatchLink = {
  from: TopologyDevice;
  to: TopologyDevice;
  start: Point3;
  end: Point3;
  startNormal: Point3;
  endNormal: Point3;
};

// Center of the connector mouth on each chassis, in device-local coordinates.
const front: Point3 = [0, 0, 1];
const rear: Point3 = [0, 0, -1];
export const routerPort: Point3 = [-1.189, .120, 1.341]; // ISR 4331 onboard GE 0/0/1 (copper).
export const switchJackWidth = .088;
export const serverPort: Point3 = [-.21, .90, -.608];
export const workstationPort: Point3 = [-1.35, .79, -.56];

// Match the molded RJ45 plug to the socket width used by each displayed model.
export function plugWidthScale(device: TopologyDevice) {
  return device === "switch" ? switchJackWidth / .154 : 1;
}

export function asaPort(index: number): Point3 {
  // ASA 5506-X rear-panel GigabitEthernet1/1 through 1/8, viewed left to right.
  return [-.686 + index * .166, .185, 1.177];
}
export function switchPort(column: number, row: number): Point3 {
  // Catalyst C9200L-24T-4G: upper odd and lower even ports in two six-column banks.
  return [-.164 + column * .084 + (column >= 6 ? .046 : 0), .123 + row * .085, .879];
}

const sockets: PatchLink[] = [
  { from: "router", to: "asa", start: routerPort, end: asaPort(0), startNormal: front, endNormal: front },
  { from: "asa", to: "switch", start: asaPort(1), end: switchPort(0, 1), startNormal: front, endNormal: front },
  { from: "switch", to: "server", start: switchPort(11, 1), end: serverPort, startNormal: front, endNormal: rear },
  { from: "switch", to: "linux", start: switchPort(9, 1), end: workstationPort, startNormal: front, endNormal: rear },
  { from: "switch", to: "windows-server", start: switchPort(7, 1), end: workstationPort, startNormal: front, endNormal: rear },
];

export const patchLinks = sockets.map(({ from, to, start, end, startNormal, endNormal }) => ({
  from, to, start: casePoint(from, start), end: casePoint(to, end),
  startNormal: caseDirection(from, startNormal), endNormal: caseDirection(to, endNormal),
}));
