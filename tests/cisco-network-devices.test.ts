import { Box3, Mesh, Raycaster, Vector3 } from "three";
import { expect, it } from "vitest";
import { createEthernetCables } from "@/components/computer/computer-topology-cables";
import type { Point3 } from "@/components/computer/computer-topology-devices";
import { createTopologyDevice } from "@/components/computer/computer-topology-models";
import { patchLinks, switchPort } from "@/components/computer/computer-topology-ports";
import { caseYaw } from "@/components/computer/computer-topology-poses";

// Ratios include visible feet, rack ears and rear modules in addition to the nominal chassis.
const models = [
  { device: "router", name: "ISR 4331", depth: [.8, 1.1], height: [.075, .15] },
  { device: "asa", name: "ASA 5506-X", depth: [1.08, 1.27], height: [.19, .28] },
  { device: "switch", name: "Catalyst C9200L-24T-4G", depth: [.58, .8], height: [.075, .14] },
] as const;

it.each(models)("keeps the $name chassis proportions", ({ device, depth, height }) => {
  const model = createTopologyDevice(device, false);
  model.rotation.y = -caseYaw[device];
  const size = new Box3().setFromObject(model, true).getSize(new Vector3());
  expect(size.z / size.x).toBeGreaterThan(depth[0]);
  expect(size.z / size.x).toBeLessThan(depth[1]);
  expect(size.y / size.x).toBeGreaterThan(height[0]);
  expect(size.y / size.x).toBeLessThan(height[1]);
});

it.each(models)("seats every cable on the $name in a distinct copper jack", ({ device }) => {
  const model = createTopologyDevice(device, false);
  const occupied = new Set<string>();
  function checkSocket(position: Point3, facing: Point3) {
    const jack = new Vector3(...position);
    const normal = new Vector3(...facing);
    const probe = new Raycaster(jack.clone().addScaledVector(normal, .2), normal.clone().negate());
    const contact = probe.intersectObject(model).find(hit => hit.object instanceof Mesh);
    expect(contact?.object).toMatchObject({ material: { userData: { finish: "ink" } } });
    expect(contact!.point.distanceTo(jack)).toBeLessThan(.012);
    expect(occupied.has(position.join(","))).toBe(false);
    occupied.add(position.join(","));
  }
  for (const cable of patchLinks) {
    if (cable.from === device) checkSocket(cable.start, cable.startNormal);
    if (cable.to === device) checkSocket(cable.end, cable.endNormal);
  }
  expect(occupied.size).toBe({ router: 1, asa: 2, switch: 4 }[device]);
});

it("fits the molded Catalyst plugs within the pitch of adjacent RJ45 sockets", () => {
  const pitch = switchPort(1, 1)[0] - switchPort(0, 1)[0];
  const links = createEthernetCables().links;
  const plugs = links.filter(link => link.from === "switch").map(link => link.start);
  plugs.push(links.find(link => link.to === "switch")!.end);
  for (const plug of plugs) {
    const shellSize = new Box3().setFromObject(plug.children[0], true).getSize(new Vector3());
    expect(shellSize.x).toBeLessThan(pitch);
  }
});
