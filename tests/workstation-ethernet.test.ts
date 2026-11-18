import { Box3, Mesh, Raycaster, Vector3 } from "three";
import { expect, it } from "vitest";
import { deviceDrawing } from "@/components/computer/computer-topology-devices";
import { createTopologyDevice } from "@/components/computer/computer-topology-models";
import { patchLinks } from "@/components/computer/computer-topology-ports";

it.each(["linux", "windows-server"] as const)("plugs the switch cable into the back of the %s tower", device => {
  const links = patchLinks.filter(link => link.to === device);
  expect(links).toHaveLength(1);
  const [link] = links;
  expect(link.from).toBe("switch");
  const { parts } = deviceDrawing(device);
  const screen = parts.find(part => part.finish === "screen")!;
  const socket = new Vector3(...link.end);
  const normal = new Vector3(...link.endNormal);
  const rim = parts.find(part => part.assembly === "tower" && part.finish === "metal"
    && new Vector3(...part.position).distanceTo(socket) < .02);
  expect(rim).toBeDefined();
  const width = rim!.size[0];
  const yaw = rim!.yaw ?? 0;
  expect(normal.distanceTo(new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)))).toBeLessThan(.001);
  const across = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  for (const dark of [false, true]) {
    const model = createTopologyDevice(device, dark);
    const tower = model.getObjectByName("workstation-tower")!;
    const bounds = new Box3().setFromObject(tower);
    expect(bounds.max.x).toBeLessThan(screen.position[0] - screen.size[0] / 2);

    // Probe the mouth, its narrow metal rim, and the I/O shield immediately behind it.
    for (const [offset, finish, maxGap] of [[0, "ink", .01], [.47, "metal", .01], [.58, "metal", .07]] as const) {
      const target = socket.clone().addScaledVector(across, offset * width);
      const ray = new Raycaster(target.clone().addScaledVector(normal, .20), normal.clone().negate());
      const hit = ray.intersectObject(model).find(({ object }) => object instanceof Mesh);
      expect(hit?.object.parent).toBe(tower);
      expect(hit!.object).toMatchObject({ material: { userData: { finish } } });
      expect(hit!.point.distanceTo(target)).toBeLessThan(maxGap);
    }
  }
});
