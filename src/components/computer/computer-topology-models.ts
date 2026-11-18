import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { deviceDrawing, type DevicePart, type Finish, type Mark, type TopologyDevice } from "./computer-topology-devices";

export const topologyYellow = 0xfdc41f;
const finishes = {
  light: { case: 0xe3e3e3, panel: 0xafafaf, ink: 0x363636, light: 0xffffff, metal: 0xa0a0a0, screen: 0x414141, accent: topologyYellow },
  dark: { case: 0x777777, panel: 0x515151, ink: 0x222222, light: 0xb3b3b3, metal: 0x909090, screen: 0x323232, accent: topologyYellow },
};

/** Combine casework by finish, retaining independent materials for assemblies that fade separately. */
function addCasework(group: THREE.Group, parts: DevicePart[], marks: Mark[], dark: boolean) {
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
    if (part.yaw) primitive.rotateY(part.yaw);
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
      color: palette[finish], roughness: finish === "metal" ? .57 : finish === "screen" ? .61 : .86,
      metalness: finish === "metal" ? .22 : 0,
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
    const color = finish === "ink" ? (dark ? 0x757575 : 0x858585) : palette[finish];
    const material = new THREE.LineBasicMaterial({ color });
    material.userData.finish = finish;
    material.userData.topologyOutline = finish === "ink";
    group.add(new THREE.LineSegments(geometry, material));
  }
}

export function createTopologyDevice(device: TopologyDevice, dark: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = device;
  const { parts, marks } = deviceDrawing(device);
  addCasework(group, parts.filter(part => !part.assembly), marks.filter(mark => !mark.assembly), dark);
  if (device === "linux" || device === "windows-server") {
    const tower = new THREE.Group();
    tower.name = "workstation-tower";
    addCasework(tower, parts.filter(part => part.assembly === "tower"), marks.filter(mark => mark.assembly === "tower"), dark);
    group.add(tower);
  }
  return group;
}
