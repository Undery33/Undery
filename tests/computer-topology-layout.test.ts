import { Box3, Group } from "three";
import { expect, it } from "vitest";
import type { TopologyDevice } from "@/components/computer/computer-topology-devices";
import { groundPosition, openingAzimuth, openingElevation, topologyLayouts } from "@/components/computer/computer-topology-layout";
import { createTopologyDevice } from "@/components/computer/computer-topology-models";

const network = ["router", "asa", "switch"] as const;
const terminals = ["server", "linux", "windows-server"] as const;

function renderedBounds(mode: keyof typeof topologyLayouts) {
  const result = {} as Record<TopologyDevice, { left: number; right: number; top: number; bottom: number; center: number }>;
  for (const device of [...network, ...terminals]) {
    const model = createTopologyDevice(device, false);
    model.position.fromArray(groundPosition(topologyLayouts[mode][device]));
    const opening = new Group();
    opening.rotation.set(openingElevation, -openingAzimuth, 0);
    opening.add(model);
    // Measure transformed vertices, independently of the case extents used to arrange the grid.
    const { min, max } = new Box3().setFromObject(opening, true);
    result[device] = { left: min.x, right: max.x, top: -max.y, bottom: -min.y, center: (min.x + max.x) / 2 };
  }
  return result;
}

function spread(values: number[]) {
  return Math.max(...values) - Math.min(...values);
}

it("aligns desktop network chassis in one row and the three endpoints in a separate column", () => {
  const b = renderedBounds("wide");
  expect(spread(network.map(id => b[id].bottom))).toBeLessThan(.08);
  const gaps = [b.asa.left - b.router.right, b.switch.left - b.asa.right];
  expect(Math.min(...gaps)).toBeGreaterThan(0);
  expect(spread(gaps)).toBeLessThan(.08);
  expect(Math.min(...terminals.map(id => b[id].left))).toBeGreaterThan(b.switch.right);
  expect(spread(terminals.map(id => b[id].center))).toBeLessThan(.08);
  const rowGaps = [b.linux.top - b.server.bottom, b["windows-server"].top - b.linux.bottom];
  expect(Math.min(...rowGaps)).toBeGreaterThan(0);
  expect(spread(rowGaps)).toBeLessThan(.08);
});

it("fits mobile devices in two non-overlapping rows on the same three column centers", () => {
  const b = renderedBounds("compact");
  const lower = ["windows-server", "linux", "server"] as const;
  for (const row of [network, lower]) {
    expect(spread(row.map(id => b[id].bottom))).toBeLessThan(.08);
    expect(b[row[0]].right).toBeLessThan(b[row[1]].left);
    expect(b[row[1]].right).toBeLessThan(b[row[2]].left);
  }
  expect(Math.min(...lower.map(id => b[id].top))).toBeGreaterThan(Math.max(...network.map(id => b[id].bottom)));
  network.forEach((id, i) => expect(Math.abs(b[id].center - b[lower[i]].center)).toBeLessThan(.08));
});
