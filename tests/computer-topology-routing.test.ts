import { describe, expect, it } from "vitest";
import { routePatchCable, type CableSocket, type Footprint } from "@/components/computer/computer-topology-routing";
import type { Point3 } from "@/components/computer/computer-topology-devices";

const start: CableSocket = {
  position: [0, .3, 0], normal: [0, 0, 1], scale: 1, footprint: { left: -.3, right: .3, back: -.5, front: 0 },
};
const end: CableSocket = {
  position: [8, .8, 1.06], normal: [0, 0, -1], scale: 1, footprint: { left: 7.7, right: 8.3, back: 1.06, front: 1.6 },
};

function measureFloorSpans(obstacles: Footprint[]) {
  const route = routePatchCable(start, end, [start.footprint, end.footprint, ...obstacles], 0);
  const spans: [Point3, Point3][] = [];
  let current = route.start;
  for (const segment of route.segments) {
    const { end: next, corner } = segment;
    if (corner) {
      const trim = Math.hypot(current[0] - corner[0], current[1] - corner[1], current[2] - corner[2]);
      expect(trim).toBeLessThanOrEqual(.115001);
    } else if (current[1] === .033 && next[1] === .033) spans.push([current, next]);
    for (let step = 0; step <= 32; step++) {
      const t = step / 32;
      const axis = (i: number) => corner
        ? (1 - t) ** 2 * current[i] + 2 * (1 - t) * t * corner[i] + t ** 2 * next[i]
        : current[i] * (1 - t) + next[i] * t;
      const x = axis(0), z = axis(2);
      for (const box of obstacles) {
        expect(x < box.left - .03 || x > box.right + .03 || z < box.back - .03 || z > box.front + .03).toBe(true);
      }
    }
    current = next;
  }
  return spans;
}

describe("physical Ethernet routes", () => {
  it("runs straight across a clear desk between a front and a rear port", () => {
    const spans = measureFloorSpans([]);
    expect(spans).toHaveLength(1);
    const [[a, b]] = spans;
    expect(b[0] - a[0]).toBeGreaterThan(7.7);
    expect(a[2]).toBeCloseTo(b[2]);
  });

  it("adds only the two required corners to clear an intervening chassis", () => {
    const spans = measureFloorSpans([{ left: 3, right: 5, back: .35, front: 1.25 }]);
    expect(spans).toHaveLength(3);
    expect(spans[1][0][2]).toBeCloseTo(.23);
    expect(spans[1][1][2]).toBeCloseTo(.23);
  });
});
