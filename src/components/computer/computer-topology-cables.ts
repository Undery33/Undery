import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Point3, TopologyDevice } from "./computer-topology-devices";
import { topologyYellow } from "./computer-topology-models";
import { patchLinks } from "./computer-topology-ports";
import { bendPoint, bootTip, jacketRoute, type CableSpan, type RoundBend } from "./computer-topology-routing";

const radius = .029;
class CableBend extends THREE.Curve<THREE.Vector3> {
  constructor(private bend: RoundBend) { super(); }
  getPoint(t: number, target = new THREE.Vector3()) { return target.fromArray(bendPoint(this.bend, t)); }
  getLength() { return this.bend.radius * this.bend.angle; }
  getPointAt(u: number, target?: THREE.Vector3) { return this.getPoint(u, target); }
}

function jacketGeometry(spans: CableSpan[]) {
  const track = new THREE.CurvePath<THREE.Vector3>();
  for (const span of spans) {
    track.add(span.kind === "line"
      ? new THREE.LineCurve3(new THREE.Vector3(...span.start), new THREE.Vector3(...span.end))
      : new CableBend(span));
  }
  const geometry = new THREE.TubeGeometry(track, Math.ceil(track.getLength() * 45), radius, 10, false);
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
    arrange(positions: Map<TopologyDevice, THREE.Vector3>, compact: boolean) {
      function connect(plug: THREE.Group, local: Point3, normal: Point3, origin: THREE.Vector3): Point3 {
        plug.position.fromArray(local).add(origin);
        plug.rotation.y = Math.atan2(normal[0], normal[2]);
        return bootTip(plug.position.toArray(), normal);
      }
      for (const [i, link] of links.entries()) {
        const spec = patchLinks[i];
        const a = connect(link.start, spec.start, spec.startNormal, positions.get(link.from)!);
        const b = connect(link.end, spec.end, spec.endNormal, positions.get(link.to)!);
        link.jacket.geometry.dispose();
        link.jacket.geometry = jacketGeometry(jacketRoute(link.to, a, b, spec.startNormal, spec.endNormal, compact));
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
