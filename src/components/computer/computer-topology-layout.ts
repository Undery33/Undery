import type { Point3, TopologyDevice } from "./computer-topology-devices";
import { patchLinks } from "./computer-topology-ports";

type Position = readonly [across: number, down: number];
type Layout = Record<TopologyDevice, Position>;
export const openingAzimuth = .54;
export const openingElevation = .50;
const ca = Math.cos(openingAzimuth), sa = Math.sin(openingAzimuth);
const ce = Math.cos(openingElevation), se = Math.sin(openingElevation);

/** Place a point on the desk from its coordinates in the opening camera view. */
export function groundPosition([across, down]: Position): Point3 {
  const depth = down / se;
  return [across * ca + depth * sa, 0, -across * sa + depth * ca];
}

export function openingProjection([x, y, z]: Point3): [number, number] {
  return [x * ca - z * sa, se * (x * sa + z * ca) - y * ce];
}

// Align the jack mouths in the opening projection. Their plugs extend by the same amount.
const trunk = patchLinks.find(link => link.from === "asa" && link.to === "switch")!;
const switchDrop = openingProjection(trunk.start)[1] - openingProjection(trunk.end)[1];
export const topologyLayouts: Record<"wide" | "compact", Layout> = {
  wide: {
    router: [-6.4, -1.48], asa: [-3.65, -2.8], switch: [-.24, -2.8 + switchDrop],
    server: [2.70, -.80], linux: [2.65, 2.75], "windows-server": [6.25, 3.65],
  },
  compact: {
    router: [-2.9, -.65], asa: [0, -1.55], switch: [2.82, -1.55 + switchDrop],
    server: [-2.8, 2.62], linux: [.07, 2.65], "windows-server": [2.79, 2.65],
  },
};
