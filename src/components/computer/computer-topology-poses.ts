import type { Point3, TopologyDevice } from "./computer-topology-devices";

export const caseYaw: Record<TopologyDevice, number> = {
  router: 1.14, asa: 1.02, switch: .98, server: 1.36, linux: 1.15, "windows-server": 1.15,
};

export function caseDirection(device: TopologyDevice, [x, y, z]: Point3): Point3 {
  const cos = Math.cos(caseYaw[device]), sin = Math.sin(caseYaw[device]);
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

/** Turn a chassis toward the patch panel. Desktop towers pivot beside the fixed monitor. */
export function casePoint(device: TopologyDevice, point: Point3): Point3 {
  if (device !== "linux" && device !== "windows-server") return caseDirection(device, point);
  const [x, y, z] = caseDirection(device, [point[0] + 1.254, point[1], point[2] + .032]);
  return [x - 1.485, y, z - .032];
}
