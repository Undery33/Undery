import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { deviceDrawing, type Finish, type TopologyDevice } from "./computer-topology-devices";

const finishes = {
  light: { case: 0xe6e7e4, panel: 0xa5aaa8, ink: 0x353c3e, light: 0xfafaf8, screen: 0x31383a },
  dark: { case: 0x626768, panel: 0x454a4d, ink: 0x171c1e, light: 0xe4e7e6, screen: 0x191e21 },
};

/** Local +Z is the front panel, +Y is up. Combine casework by finish to keep draw calls low. */
export function createTopologyDevice(device: TopologyDevice, dark: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = device;
  const { parts, marks } = deviceDrawing(device);
  const byFinish = new Map<Finish, THREE.BufferGeometry[]>();
  const strokes: Record<"ink" | "light", THREE.Vector3[]> = { ink: [], light: [] };

  for (const part of parts) {
    const geometry = part.shape === "drum" ? new THREE.CylinderGeometry(.5, .5, 1, 48) : new THREE.BoxGeometry();
    geometry.scale(...part.size).translate(...part.position);
    const geometries = byFinish.get(part.finish) ?? [];
    geometries.push(geometry);
    byFinish.set(part.finish, geometries);
    if (part.outlined) {
      const edges = new THREE.EdgesGeometry(geometry, 25);
      const positions = edges.getAttribute("position");
      for (let i = 0; i < positions.count; i++) strokes.ink.push(new THREE.Vector3().fromBufferAttribute(positions, i));
      edges.dispose();
    }
  }
  const palette = dark ? finishes.dark : finishes.light;
  for (const [finish, geometries] of byFinish) {
    const combined = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    const face = new THREE.Mesh(combined, new THREE.MeshStandardMaterial({
      color: palette[finish], roughness: .85, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }));
    group.add(face);
  }
  for (const mark of marks) {
    const points = mark.finish === "light" ? strokes.light : strokes.ink;
    for (let i = 1; i < mark.points.length; i++) {
      points.push(new THREE.Vector3(...mark.points[i - 1]), new THREE.Vector3(...mark.points[i]));
    }
  }
  for (const finish of ["ink", "light"] as const) {
    if (!strokes[finish].length) continue;
    const geometry = new THREE.BufferGeometry().setFromPoints(strokes[finish]);
    const color = finish === "light" ? palette.light : dark ? 0xd0d3d2 : 0x404647;
    group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color })));
  }
  return group;
}
