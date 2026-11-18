import { Box3, Mesh, Raycaster, Vector3 } from "three";
import { expect, it } from "vitest";
import { createTopologyDevice } from "@/components/computer/computer-topology-models";
import { patchLinks } from "@/components/computer/computer-topology-ports";
import { caseYaw } from "@/components/computer/computer-topology-poses";

it("keeps the ISR 4331 rack profile and seats the ASA cable in its I/O panel", () => {
  const router = createTopologyDevice("router", false);
  const uplink = patchLinks.find(link => link.from === "router" && link.to === "asa")!;
  const jack = new Vector3(...uplink.start);
  const normal = new Vector3(...uplink.startNormal);
  const probe = new Raycaster(jack.clone().addScaledVector(normal, .2), normal.clone().negate());
  const contact = probe.intersectObject(router).find(hit => hit.object instanceof Mesh);
  expect(contact?.object).toMatchObject({ material: { userData: { finish: "ink" } } });
  expect(contact!.point.distanceTo(jack)).toBeLessThan(.012);

  // Remove the display angle before measuring the nearly square, one-rack-unit enclosure.
  router.rotation.y = -caseYaw.router;
  const size = new Box3().setFromObject(router, true).getSize(new Vector3());
  expect(size.z / size.x).toBeGreaterThan(.8);
  expect(size.z / size.x).toBeLessThan(1.1);
  expect(size.y / size.x).toBeGreaterThan(.075);
  expect(size.y / size.x).toBeLessThan(.15);
});
