import type { Point3, TopologyDevice } from "./computer-topology-devices";
import { openingProjection } from "./computer-topology-layout";
import { patchLinks } from "./computer-topology-ports";

export type LineSpan = { kind: "line"; start: Point3; end: Point3 };
export type RoundBend = { kind: "arc"; start: Point3; end: Point3; center: Point3; tangent: Point3; angle: number; radius: number };
export type CableSpan = LineSpan | RoundBend;

// Lane order follows physical jack order across the rotated switch face.
const switchDestinations = patchLinks.filter(link => link.from === "switch")
  .sort((a, b) => (a.start[0] - b.start[0]) * a.startNormal[2] - (a.start[2] - b.start[2]) * a.startNormal[0])
  .map(link => link.to);
const move = (p: Point3, d: Point3, length: number): Point3 => [p[0] + length * d[0], p[1] + length * d[1], p[2] + length * d[2]];
const vector = (a: Point3, b: Point3): Point3 => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function unit([x, y, z]: Point3): Point3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

export function bootTip(socket: Point3, normal: Point3): Point3 {
  return move(socket, normal, .32);
}

/** Stay axial at each crimp, then turn onto the straight cable run on a tangent circular arc. */
export function jacketRoute(to: TopologyDevice, start: Point3, end: Point3, startNormal: Point3, endNormal: Point3, compact: boolean): CableSpan[] {
  const runScale = Math.min(1, Math.hypot(...vector(start, end)) / 2.6);
  const branch = switchDestinations.indexOf(to);
  let lead = .30 * runScale;
  let tail = .34;
  if (branch < 0) {
    const row = openingProjection(move(start, startNormal, lead))[1] - openingProjection(move(end, endNormal, tail))[1];
    const descent = openingProjection(row < 0 ? startNormal : endNormal)[1];
    if (descent > .12) {
      const extra = Math.min(.52, Math.abs(row) / descent);
      if (row < 0) lead += extra;
      else tail += extra;
    }
  }
  const corners = [start];
  if (branch >= 0) {
    // Adjacent ports feed parallel lanes. Cables peel off towards their own receiver;
    // the outside lane travels farther before turning to keep the insulation separate.
    const right: Point3 = [startNormal[2], 0, -startNormal[0]];
    const receiver = move(end, endNormal, tail);
    const sideways = dot(vector(start, receiver), right);
    const turnRight = !compact || sideways > 0;
    const turn = move(start, startNormal, .94 + (turnRight ? 2 - branch : branch) * .26);
    corners.push(turn);
    const crossSpan = compact ? Math.min(.74, Math.abs(sideways) * .52) : .85 + (2 - branch) * .32;
    if (crossSpan >= .30) corners.push(move(turn, right, turnRight ? crossSpan : -crossSpan));
  } else corners.push(move(start, startNormal, lead));
  corners.push(move(end, endNormal, tail), end);
  const spans: CableSpan[] = [];
  let cursor = start;
  for (let i = 1; i < corners.length - 1; i++) {
    const c = corners[i];
    const before = vector(corners[i - 1], c), after = vector(c, corners[i + 1]);
    const u = unit(before), v = unit(after);
    const cosine = Math.max(-1, Math.min(1, dot(u, v)));
    const angle = Math.acos(cosine);
    if (angle < .001) continue;
    const slope = Math.tan(angle / 2);
    const trim = Math.min(.18 * slope, Math.hypot(...before) * .62, Math.hypot(...after) * .40);
    const radius = trim / slope;
    const entry = move(c, u, -trim), exit = move(c, v, trim);
    const inward = unit(move(v, u, -cosine));
    spans.push({ kind: "line", start: cursor, end: entry });
    spans.push({ kind: "arc", start: entry, end: exit, center: move(entry, inward, radius), tangent: u, angle, radius });
    cursor = exit;
  }
  spans.push({ kind: "line", start: cursor, end });
  return spans;
}

export function bendPoint(bend: RoundBend, t: number): Point3 {
  const angle = t * bend.angle;
  const radial = vector(bend.center, bend.start);
  return move(move(bend.center, radial, Math.cos(angle)), bend.tangent, bend.radius * Math.sin(angle));
}
