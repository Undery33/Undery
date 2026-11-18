import type { Point3 } from "./computer-topology-devices";

type GroundPoint = [x: number, z: number];
export type Footprint = { left: number; right: number; back: number; front: number };
export type CableSocket = { position: Point3; normal: Point3; scale: number; footprint: Footprint };
type Segment = { end: Point3; corner?: Point3 };

function crossesCase([x, z]: GroundPoint, [u, v]: GroundPoint, box: Footprint) {
  // Clip the line to the open rectangle. Touching a padded corner is a clear route.
  let enter = 0, leave = 1;
  for (const [p, delta, low, high] of [[x, u - x, box.left, box.right], [z, v - z, box.back, box.front]]) {
    if (Math.abs(delta) < 1e-8) {
      if (p <= low || p >= high) return false;
    } else {
      const a = (low - p) / delta, b = (high - p) / delta;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
    }
  }
  return leave - enter > 1e-7;
}

function clearRoute(start: GroundPoint, end: GroundPoint, cases: Footprint[]): GroundPoint[] {
  const clear = (a: GroundPoint, b: GroundPoint) => !cases.some(box => crossesCase(a, b, box));
  if (clear(start, end)) return [start, end];
  const points: GroundPoint[] = [start, end];
  for (const { left, right, back, front } of cases) points.push([left, back], [right, back], [right, front], [left, front]);
  const costs = points.map(() => Infinity), previous = points.map(() => -1), visited = new Set<number>();
  costs[0] = 0;
  while (true) {
    let next = -1;
    for (const [i, cost] of costs.entries()) if (!visited.has(i) && cost < (next < 0 ? Infinity : costs[next])) next = i;
    if (next === 1 || next < 0) break;
    visited.add(next);
    const a = points[next];
    for (const [i, b] of points.entries()) {
      if (visited.has(i)) continue;
      const cost = costs[next] + Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (cost < costs[i] && clear(a, b)) { costs[i] = cost; previous[i] = next; }
    }
  }
  const route = [end];
  for (let i = previous[1]; i > 0; i = previous[i]) route.unshift(points[i]);
  return [start, ...route];
}

/** Short axial exits from the RJ45 boots, then straight desk segments around real case footprints. */
export function routePatchCable(start: CableSocket, end: CableSocket, footprints: Footprint[], lane: number) {
  const scale = Math.min(start.scale, end.scale);
  const clearance = (.12 + lane * .10) * scale;
  const floor = .033 * scale;
  const cases = footprints.map(box => ({
    left: box.left - clearance, right: box.right + clearance, back: box.back - clearance, front: box.front + clearance,
  }));
  function exit({ position: [x, y, z], normal: [nx, , nz], scale: s, footprint }: CableSocket) {
    const offset = (distance: number, height: number): Point3 => [x + nx * distance, height, z + nz * distance];
    const lip = nx ? (nx > 0 ? footprint.right - x : x - footprint.left) : (nz > 0 ? footprint.front - z : z - footprint.back);
    const reach = Math.max((.53 + lane * .12) * s, lip + clearance + .06 * s);
    return [offset(.32 * s, y), offset(.41 * s, y), offset(reach, floor)];
  }
  const a = exit(start), b = exit(end);
  const ground = (p: Point3): GroundPoint => [p[0], p[2]];
  const middle = clearRoute(ground(a[2]), ground(b[2]), cases).slice(1, -1);
  const points: Point3[] = [...a, ...middle.map(([x, z]): Point3 => [x, floor, z]), ...b.reverse()];
  const distance = (p: Point3, q: Point3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const segments: Segment[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i], before = points[i - 1], after = points[i + 1];
    const trim = Math.min(.115 * scale, distance(before, corner) * .35, distance(after, corner) * .35);
    const toward = (other: Point3): Point3 => {
      const t = trim / (distance(corner, other) || 1);
      return [corner[0] + (other[0] - corner[0]) * t, corner[1] + (other[1] - corner[1]) * t, corner[2] + (other[2] - corner[2]) * t];
    };
    segments.push({ end: toward(before) }, { corner, end: toward(after) });
  }
  segments.push({ end: points[points.length - 1] });
  return { start: points[0], segments };
}
