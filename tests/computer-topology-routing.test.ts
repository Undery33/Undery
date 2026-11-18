import { describe, expect, it } from "vitest";
import { groundPosition, openingProjection, topologyLayouts } from "@/components/computer/computer-topology-layout";
import { patchLinks } from "@/components/computer/computer-topology-ports";
import { bendPoint, bootTip, jacketRoute, type CableSpan } from "@/components/computer/computer-topology-routing";
import { deviceDrawing, type Point3 } from "@/components/computer/computer-topology-devices";

const add = (a: Point3, b: Point3): Point3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Point3) => Math.hypot(...a);
function direction(a: Point3, b: Point3) {
  const v = sub(b, a), n = norm(v);
  return v.map(e => e / n) as Point3;
}
function tangent(span: CableSpan, t: 0 | 1) {
  if (span.kind === "line") return direction(span.start, span.end);
  return t ? direction(bendPoint(span, 1 - .00001), span.end) : span.tangent;
}

function samples(span: CableSpan) {
  return span.kind === "line" ? [span.start, span.end] : Array.from({ length: 65 }, (_, i) => bendPoint(span, i / 64));
}

function intersects(a: Point3, b: Point3, half: number[]) {
  let enter = 0, exit = 1;
  for (let i = 0; i < 3; i++) {
    const delta = b[i] - a[i];
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(a[i]) > half[i]) return false;
    } else {
      const p = (-half[i] - a[i]) / delta, q = (half[i] - a[i]) / delta;
      enter = Math.max(enter, Math.min(p, q));
      exit = Math.min(exit, Math.max(p, q));
    }
  }
  return enter < exit;
}

for (const [mode, layout] of Object.entries(topologyLayouts)) {
  const routes = patchLinks.map(link => {
    const a = bootTip(add(groundPosition(layout[link.from]), link.start), link.startNormal);
    const b = bootTip(add(groundPosition(layout[link.to]), link.end), link.endNormal);
    return { link, spans: jacketRoute(link.to, a, b, link.startNormal, link.endNormal, mode === "compact") };
  });
  describe(`${mode} Ethernet routing`, () => {
    it("follows each port axis, turns tangentially on a circular radius and keeps a long straight center", () => {
      for (const { link, spans } of routes) {
        expect(norm(sub(tangent(spans[0], 0), link.startNormal))).toBeLessThan(.0001);
        expect(norm(add(tangent(spans.at(-1)!, 1), link.endNormal))).toBeLessThan(.0001);
        for (const [i, span] of spans.entries()) {
          if (i) {
            expect(norm(sub(spans[i - 1].end, span.start))).toBeLessThan(1e-8);
            expect(norm(sub(tangent(spans[i - 1], 1), tangent(span, 0)))).toBeLessThan(.0001);
          }
          if (span.kind !== "arc") continue;
          expect(span.radius).toBeGreaterThan(.04);
          expect(span.radius).toBeLessThanOrEqual(.180001);
          for (const t of [0, .25, .5, .75, 1]) expect(norm(sub(bendPoint(span, t), span.center))).toBeCloseTo(span.radius, 8);
        }
        const straightLength = spans.reduce((total, s) => total + (s.kind === "line" ? norm(sub(s.end, s.start)) : 0), 0);
        const bendLength = spans.reduce((total, s) => total + (s.kind === "arc" ? s.angle * s.radius : 0), 0);
        expect(straightLength / (straightLength + bendLength)).toBeGreaterThan(.65);
      }
      const trunk = routes.find(r => r.link.to === "switch")!.spans;
      const longest = trunk.filter(s => s.kind === "line").sort((a, b) => norm(sub(b.end, b.start)) - norm(sub(a.end, a.start)))[0];
      const [x0, y0] = openingProjection(longest.start), [x1, y1] = openingProjection(longest.end);
      expect(Math.abs(y1 - y0) / (x1 - x0)).toBeLessThan(.10);
    });

    it("separates the three evenly spaced switch leads after a shared straight run", () => {
      const branches = ["windows-server", "linux", "server"].map(to => routes.find(r => r.link.to === to)!.spans);
      expect(norm(sub(branches[0][0].start, branches[1][0].start))).toBeCloseTo(norm(sub(branches[1][0].start, branches[2][0].start)), 6);
      for (const spans of branches) {
        expect(norm(sub(spans[0].end, spans[0].start))).toBeGreaterThan(.56);
        expect(norm(sub(tangent(spans[0], 0), tangent(branches[0][0], 0)))).toBeLessThan(1e-7);
        if (mode === "wide") {
          expect(spans[2].kind).toBe("line");
          expect(norm(sub(spans[2].end, spans[2].start))).toBeGreaterThan(.35);
          expect(norm(sub(tangent(spans[2], 0), tangent(branches[0][2], 0)))).toBeLessThan(1e-7);
        }
      }
    });

    it("clears the rotated cases and rear NICs along every straight span and bend", () => {
      const cases = Object.entries(layout).flatMap(([id, position]) => deviceDrawing(id as keyof typeof layout).parts.map(part => {
        const center = add(groundPosition(position), part.position), ca = Math.cos(part.yaw ?? 0), sa = Math.sin(part.yaw ?? 0);
        const local = (p: Point3): Point3 => {
          const [x, y, z] = sub(p, center);
          return [x * ca - z * sa, y, x * sa + z * ca];
        };
        return { local, half: part.size.map(s => s / 2 + .030) };
      }));
      for (const { link, spans } of routes) for (const span of spans) {
        // The circular arc lies within .0001 of these chords, inside the extra .001 clearance.
        const path = samples(span);
        for (let i = 1; i < path.length; i++) {
          expect(cases.some(box => intersects(box.local(path[i - 1]), box.local(path[i]), box.half)), link.to).toBe(false);
        }
      }
    });

    it("lets each cable be traced independently in the opening view", () => {
      type Point = [number, number];
      const side = (a: Point, b: Point, p: Point) => (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0]);
      const paths = routes.map(({ spans }) => spans.flatMap(span => samples(span).map(openingProjection)));
      for (const [i, first] of paths.entries()) for (const second of paths.slice(i + 1)) {
        const crossed = first.slice(1).some((b, n) => second.slice(1).some((d, m) => {
          const a = first[n], c = second[m];
          return side(a,b,c)*side(a,b,d) < 0 && side(c,d,a)*side(c,d,b) < 0;
        }));
        expect(crossed).toBe(false);
      }
    });
  });
}
