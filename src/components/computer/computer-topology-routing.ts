import type { Point3, TopologyDevice } from "./computer-topology-devices";
import { groundPosition, openingElevation, openingProjection } from "./computer-topology-layout";

export function bootTip(socket: Point3, normal: Point3): Point3 {
  return [socket[0] + normal[0] * .32, socket[1] + normal[1] * .32, socket[2] + normal[2] * .32];
}

/** The router lead follows the two sharp diagonal approaches and level middle span in the drawing. */
export function jacketPoints(from: TopologyDevice, start: Point3, end: Point3): Point3[] {
  if (from !== "router") return [start, end];
  const first = openingProjection(start), last = openingProjection(end);
  const floor = .033;
  const lane = Math.max(first[1], last[1]) + .54;
  function elbow([across, down]: [number, number], slope: number): Point3 {
    const [x, , z] = groundPosition([across - (lane - down) * slope, lane + floor * Math.cos(openingElevation)]);
    return [x, floor, z];
  }
  return [start, elbow(first, .84), elbow(last, .585), end];
}
