import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { TopologyDevice } from "./computer-topology-devices";
import { topologyYellow } from "./computer-topology-models";
import { patchLinks } from "./computer-topology-ports";

const radius = .029;
const floor = radius + .004;
type CableMount = { position: THREE.Vector3; footprint: THREE.Box2 };

// Choose the shortest clear floor route through the padded corners of the six cases.
function floorRoute(start: THREE.Vector2, end: THREE.Vector2, obstacles: THREE.Box2[]) {
  const corners = obstacles.flatMap(({ min, max }) => [
    min, new THREE.Vector2(max.x, min.y), max, new THREE.Vector2(min.x, max.y),
  ]);
  const points = [start, end, ...corners];
  const distance = points.map(() => Infinity);
  const previous = points.map(() => -1);
  const visited = new Set<number>();
  distance[0] = 0;
  while (true) {
    let next = -1;
    for (const [i, value] of distance.entries()) {
      if (!visited.has(i) && value < (next < 0 ? Infinity : distance[next])) next = i;
    }
    if (next === 1 || next < 0) break;
    visited.add(next);
    for (const [i, point] of points.entries()) {
      if (visited.has(i)) continue;
      const from = points[next];
      const cost = distance[next] + from.distanceTo(point);
      if (cost >= distance[i]) continue;
      const blocked = obstacles.some(box => {
        let enter = 0, exit = 1;
        for (const axis of ["x", "y"] as const) {
          const direction = point[axis] - from[axis];
          const low = box.min[axis] + .001, high = box.max[axis] - .001;
          if (Math.abs(direction) < .00001) {
            if (from[axis] <= low || from[axis] >= high) return false;
          } else {
            const a = (low - from[axis]) / direction, b = (high - from[axis]) / direction;
            enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
          }
        }
        return enter < exit;
      });
      if (!blocked) { distance[i] = cost; previous[i] = next; }
    }
  }
  const route = [end];
  for (let i = previous[1]; i > 0; i = previous[i]) route.unshift(points[i]);
  return [start, ...route];
}

function jacketGeometry(a: THREE.Vector3, b: THREE.Vector3, obstacles: THREE.Box2[], lane: number) {
  // Straight out of the crimp and boot first. The insulated lead then settles onto the desk.
  const lead = (socket: THREE.Vector3, opposite: THREE.Vector3, extra: number) => {
    const side = opposite.x < socket.x ? -1 : 1;
    return [
      socket.clone().add(new THREE.Vector3(0, 0, .315)),
      socket.clone().add(new THREE.Vector3(0, 0, .51)),
      new THREE.Vector3(socket.x + side * .11, floor + .045, socket.z + .84 + extra),
      new THREE.Vector3(socket.x + side * .53, floor, socket.z + 1.09 + extra),
    ];
  };
  const start = lead(a, b, .11 * lane), end = lead(b, a, b.y > .42 ? .34 : .07);
  const xy = (v: THREE.Vector3) => new THREE.Vector2(v.x, v.z);
  const route = floorRoute(xy(start[3]), xy(end[3]), obstacles);
  const points = [...start];
  for (let i = 1; i < route.length; i++) {
    const p = route[i - 1], q = route[i];
    const direction = q.clone().sub(p);
    if (direction.length() > 1.6) {
      const mid = p.clone().lerp(q, .51);
      const sag = Math.min(.20, direction.length() * .046) * (lane % 2 ? -1 : 1);
      direction.normalize();
      points.push(new THREE.Vector3(mid.x - direction.y * sag, floor, mid.y + direction.x * sag));
    }
    if (i < route.length - 1) points.push(new THREE.Vector3(q.x, floor, q.y));
  }
  points.push(...end.reverse());
  const path = new THREE.CurvePath<THREE.Vector3>();
  let cursor = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], before = points[i - 1], after = points[i + 1];
    const bend = Math.min(.52, before.distanceTo(p) * .48, after.distanceTo(p) * .48);
    const arrival = p.clone().addScaledVector(before.clone().sub(p).normalize(), bend);
    const departure = p.clone().addScaledVector(after.clone().sub(p).normalize(), bend);
    path.add(new THREE.LineCurve3(cursor, arrival));
    path.add(new THREE.QuadraticBezierCurve3(arrival, p, departure));
    cursor = departure;
  }
  path.add(new THREE.LineCurve3(cursor, points.at(-1)!));
  const geometry = new THREE.TubeGeometry(path, Math.ceil(path.getLength() * 12), radius, 10, false);
  // Soft cylindrical shading leaves the upward-lit face in the exact active cable color.
  const normals = geometry.getAttribute("normal");
  const shades = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    const shade = THREE.MathUtils.clamp(.78 + .42 * normals.getY(i) - .12 * normals.getX(i), .43, 1);
    shades.fill(shade, i * 3, i * 3 + 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(shades, 3));
  return geometry;
}

function combine(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  return geometry;
}

function createConnectorParts() {
  const shell = new RoundedBoxGeometry(.13, .09, .16, 1, .012).translate(0, 0, .067);
  const pieces: THREE.BufferGeometry[] = [];
  function detail(w: number, h: number, d: number, x: number, y: number, z: number, color: number, tilt = 0) {
    const box = new THREE.BoxGeometry(w, h, d).rotateX(tilt).translate(x, y, z);
    const tint = new THREE.Color(color);
    const colors = new Float32Array(box.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
    box.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    pieces.push(box);
  }
  detail(.10, .043, .105, 0, -.005, .055, 0x454545);
  for (let pin = 0; pin < 8; pin++) detail(.007, .008, .065, (pin - 3.5) * .012, .025, .045, 0xf2cd72);
  detail(.042, .013, .123, 0, .057, .083, 0xe4e4e4, -.27);
  const tapered = (front: number, rear: number, length: number, z: number) =>
    new THREE.CylinderGeometry(rear, front, length, 10).rotateX(Math.PI / 2).scale(1, .81, 1).translate(0, 0, z);
  const boot = [tapered(.079, .032, .185, .239)];
  for (let i = 0; i < 3; i++) boot.push(tapered(.081 - i * .009, .079 - i * .009, .016, .167 + i * .036));
  return { shell, details: combine(pieces), boot: combine(boot) };
}

export function createEthernetCables() {
  const group = new THREE.Group();
  const parts = createConnectorParts();
  const shell = new THREE.MeshPhongMaterial({ color: 0xdcdcdc, shininess: 80, transparent: true, depthWrite: false });
  const details = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .43, metalness: .14 });
  const yellow = new THREE.Color(topologyYellow), gray = new THREE.Color(), bootGray = new THREE.Color();
  const links = patchLinks.map(({ from, to }) => {
    const assembly = new THREE.Group();
    assembly.name = `ethernet:${from}:${to}`;
    const jacket = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    jacket.name = "jacket";
    const rubber = new THREE.MeshStandardMaterial({ roughness: .88 });
    function plug(name: string) {
      const plug = new THREE.Group();
      plug.name = name;
      plug.add(new THREE.Mesh(parts.shell, shell), new THREE.Mesh(parts.details, details), new THREE.Mesh(parts.boot, rubber));
      return plug;
    }
    const start = plug("plug:start"), end = plug("plug:end");
    assembly.add(jacket, start, end);
    group.add(assembly);
    return { from, to, assembly, jacket, rubber, start, end };
  });
  return {
    group, links,
    arrange(mounts: Map<TopologyDevice, CableMount>) {
      const obstacles = [...mounts.values()].map(({ footprint }) => footprint.clone().expandByScalar(.28));
      for (const [i, link] of links.entries()) {
        const spec = patchLinks[i];
        link.start.position.fromArray(spec.start).add(mounts.get(link.from)!.position);
        link.end.position.fromArray(spec.end).add(mounts.get(link.to)!.position);
        link.jacket.geometry.dispose();
        link.jacket.geometry = jacketGeometry(link.start.position, link.end.position, obstacles, i);
      }
    },
    theme(dark: boolean) {
      gray.setHex(dark ? 0xbcbcbc : 0x696969);
      bootGray.setHex(dark ? 0x949494 : 0x515151);
    },
    paint(active: TopologyDevice | null, strength: number, opacity: number) {
      shell.opacity = .44 * opacity;
      for (const link of links) {
        const amount = link.to === active || (active === "router" && link.from === "router") ? strength : 0;
        link.jacket.material.color.lerpColors(gray, yellow, amount);
        link.rubber.color.lerpColors(bootGray, yellow, amount);
        link.assembly.visible = opacity > 0;
        for (const material of [link.jacket.material, link.rubber]) {
          material.opacity = opacity;
          material.transparent = opacity < 1;
          material.depthWrite = opacity === 1;
        }
      }
      details.opacity = opacity;
      details.transparent = opacity < 1;
      details.depthWrite = opacity === 1;
    },
  };
}
