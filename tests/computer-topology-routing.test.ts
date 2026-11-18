import { describe, expect, it } from "vitest";
import { groundPosition, openingAzimuth, openingElevation, topologyLayouts } from "@/components/computer/computer-topology-layout";
import { patchLinks } from "@/components/computer/computer-topology-ports";
import { bootTip, jacketPoints } from "@/components/computer/computer-topology-routing";
import { deviceDrawing, type Point3 } from "@/components/computer/computer-topology-devices";

function openingView([x, y, z]: Point3) {
  const sa = Math.sin(openingAzimuth), ca = Math.cos(openingAzimuth);
  return { x: ca * x - sa * z, y: (sa * x + ca * z) * Math.sin(openingElevation) - y * Math.cos(openingElevation) };
}

function add([x, y, z]: Point3, [u, v, w]: Point3): Point3 { return [x + u, y + v, z + w]; }

for (const [mode, layout] of Object.entries(topologyLayouts)) {
  const routes = patchLinks.map(link => {
    const a = bootTip(add(groundPosition(layout[link.from]), link.start), link.startNormal);
    const b = bootTip(add(groundPosition(layout[link.to]), link.end), link.endNormal);
    return { to: link.to, points: jacketPoints(link.from, a, b) };
  });
  describe(`${mode} Ethernet drawing`, () => {
    it("matches the two sharp router corners, level spans and direct fan-out", () => {
      const [start, left, right, end] = routes[0].points.map(openingView);
      expect(routes.map(route => route.points.length)).toEqual([4, 2, 2, 2, 2]);
      expect(left.x).toBeLessThan(start.x);
      expect(left.y).toBeGreaterThan(start.y);
      expect(right.y).toBeCloseTo(left.y, 8);
      expect(right.x - left.x).toBeGreaterThan(start.x - left.x);
      expect(end.x).toBeGreaterThan(right.x);
      expect(left.y - end.y).toBeGreaterThan(left.y - start.y);
      const [asa, networkSwitch] = routes[1].points.map(openingView);
      expect(networkSwitch.y).toBeCloseTo(asa.y, 8);
    });

    it("keeps the full jacket clear of all six devices, including its two endpoint cases", () => {
      const cases = Object.entries(layout).flatMap(([id, position]) => {
        const origin = groundPosition(position);
        return deviceDrawing(id as keyof typeof layout).parts.map(part => ({
          center: add(origin, part.position), half: part.size.map(length => length / 2 + .029),
        }));
      });
      for (const { to, points } of routes) {
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1], b = points[i];
          // Intersect the whole centerline with each case padded by the physical tube radius.
          const hits = cases.some(({ center, half }) => {
            let enter = 0, exit = 1;
            for (let axis = 0; axis < 3; axis++) {
              const delta = b[axis] - a[axis], offset = center[axis] - a[axis];
              if (Math.abs(delta) < 1e-9) {
                if (Math.abs(offset) > half[axis]) return false;
              } else {
                const t0 = (offset - half[axis]) / delta, t1 = (offset + half[axis]) / delta;
                enter = Math.max(enter, Math.min(t0, t1));
                exit = Math.min(exit, Math.max(t0, t1));
              }
            }
            return enter < exit;
          });
          expect(hits, to + " segment " + i).toBe(false);
        }
      }
    });
  });
}
