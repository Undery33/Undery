import type { Point3, TopologyDevice } from "./computer-topology-devices";

type PatchLink = { from: TopologyDevice; to: TopologyDevice; start: Point3; end: Point3 };

// Socket openings in device-local coordinates. All front panels face +Z.
export const serverPort: Point3 = [-.17, .39, .50];
export const workstationPort: Point3 = [-.59, .47, -.048];

export const patchLinks: readonly PatchLink[] = [
  { from: "router", to: "asa", start: [.13, .278, .779], end: [-.60, .285, .565] },
  { from: "asa", to: "switch", start: [0, .285, .565], end: [-.76, .285, .565] },
  { from: "switch", to: "server", start: [-.38, .285, .565], end: serverPort },
  { from: "switch", to: "linux", start: [0, .285, .565], end: workstationPort },
  { from: "switch", to: "windows-server", start: [.57, .285, .565], end: workstationPort },
];
