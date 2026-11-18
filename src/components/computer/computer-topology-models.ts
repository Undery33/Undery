import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { deviceDrawing, type Finish, type TopologyDevice } from "./computer-topology-devices";

const finishes = {
  light: { case: 0xe8e4dd, panel: 0xbcb5aa, ink: 0x635e56, light: 0xf5f2ec, metal: 0xb4aa9a, screen: 0xf2d9c8, accent: 0xb95e38 },
  dark: { case: 0x716c64, panel: 0x48443f, ink: 0x282622, light: 0x9c9488, metal: 0x716f68, screen: 0x514139, accent: 0xefac81 },
};

/** Local +Z is the front panel, +Y is up. Combine casework by finish to keep draw calls low. */
export function createTopologyDevice(device: TopologyDevice, dark: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = device;
  const { parts, marks } = deviceDrawing(device);
  const byFinish = new Map<Finish, THREE.BufferGeometry[]>();
  const strokes: Record<"ink" | "light" | "accent", THREE.Vector3[]> = { ink: [], light: [], accent: [] };

  for (const part of parts) {
    let primitive: THREE.BufferGeometry;
    if (part.shape === "drum") {
      const segments = part.size[0] < .25 ? 12 : 48;
      primitive = new THREE.CylinderGeometry(.5, .5, 1, segments).scale(...part.size);
    } else if (part.shape === "dome") {
      primitive = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)
        .scale(part.size[0] / 2, part.size[1], part.size[2] / 2);
    } else if (part.bevel) {
      primitive = new RoundedBoxGeometry(...part.size, 1, part.bevel);
    } else {
      primitive = new THREE.BoxGeometry(...part.size);
    }
    primitive.translate(...part.position);
    const geometry = primitive.index ? primitive.toNonIndexed() : primitive;
    if (primitive !== geometry) primitive.dispose();
    const geometries = byFinish.get(part.finish) ?? [];
    geometries.push(geometry);
    byFinish.set(part.finish, geometries);
    if (part.outlined) {
      const edges = new THREE.EdgesGeometry(geometry, part.bevel ? 55 : 30);
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
      color: palette[finish], roughness: finish === "screen" ? .61 : .89,
      metalness: finish === "metal" ? .14 : 0,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }));
    face.material.userData.finish = finish;
    group.add(face);
  }
  for (const mark of marks) {
    const points = mark.finish === "accent" ? strokes.accent : mark.finish === "light" ? strokes.light : strokes.ink;
    for (let i = 1; i < mark.points.length; i++) {
      points.push(new THREE.Vector3(...mark.points[i - 1]), new THREE.Vector3(...mark.points[i]));
    }
  }
  for (const finish of ["ink", "light", "accent"] as const) {
    if (!strokes[finish].length) continue;
    const geometry = new THREE.BufferGeometry().setFromPoints(strokes[finish]);
    const color = finish === "ink" ? (dark ? 0xb6ac9f : 0x91897d) : palette[finish];
    const material = new THREE.LineBasicMaterial({ color });
    material.userData.finish = finish;
    material.userData.topologyOutline = finish === "ink";
    group.add(new THREE.LineSegments(geometry, material));
  }
  return group;
}
