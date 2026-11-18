import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { topologyYellow } from "./computer-topology-models";

const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function createNetworkBasicsModel(dark: boolean) {
  const group = new THREE.Group();
  group.name = "network-basics";
  const matte = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: .83 });
  const housing = matte(dark ? 0xa1a1a1 : 0xe7e7e7);
  const rim = matte(dark ? 0x626262 : 0xa3a3a3);
  const graphite = matte(dark ? 0x303030 : 0x454545);
  const deck = matte(dark ? 0x606060 : 0xd5d5d5);
  const glass = matte(dark ? 0x252525 : 0x535353);
  const rubber = matte(dark ? 0xc3c3c3 : 0x575757);
  const gold = new THREE.MeshBasicMaterial({ color: topologyYellow });

  function box(parent: THREE.Group, material: THREE.Material, size: [number, number, number],
    position: [number, number, number], bevel = 0) {
    const geometry = bevel ? new RoundedBoxGeometry(...size, 1, bevel) : new THREE.BoxGeometry(...size);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  }
  function tube(parent: THREE.Group, material: THREE.Material, path: THREE.Curve<THREE.Vector3>, radius: number, segments: number) {
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, segments, radius, 8), material);
    parent.add(mesh);
    return mesh;
  }

  // Duplicate the same neutral workstation on the two physically separate network segments.
  const station = new THREE.Group();
  box(station, rim, [.62, .06, .36], [0, .030, -.01], .022);
  box(station, rim, [.16, .32, .11], [0, .18, -.095], .014);
  box(station, housing, [1.41, .77, .16], [0, .67, -.10], .045);
  box(station, graphite, [1.32, .625, .027], [0, .693, -.012], .016);
  box(station, glass, [1.265, .574, .016], [0, .693, .009], .01);
  box(station, rim, [1.00, .055, .32], [0, .029, .44], .022);
  const keys: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      keys.push(new THREE.BoxGeometry(.095, .021, .061).translate((col - 3.5) * .114, .067, .35 + .087 * row));
    }
  }
  station.add(new THREE.Mesh(mergeGeometries(keys), housing));
  keys.forEach(key => key.dispose());

  const platform = new THREE.Group();
  box(platform, graphite, [2.17, .065, 1.91], [0, .0325, 0], .028);
  box(platform, rim, [2.42, .12, 2.14], [0, .105, 0], .052);
  box(platform, deck, [2.35, .059, 2.07], [0, .190, 0], .028);
  station.position.set(0, .22, -.18);
  station.name = "workstation";
  platform.add(station);
  const left = platform, right = platform.clone(true);
  left.name = "subnet-left"; left.position.x = -2.25;
  right.name = "subnet-right"; right.position.x = 2.25;
  group.add(left, right);

  const gateway = new THREE.Group();
  gateway.name = "gateway";
  box(gateway, graphite, [1.20, .08, .84], [0, .04, 0], .025);
  box(gateway, housing, [1.30, .34, .83], [0, .24, 0], .042);
  box(gateway, rim, [1.28, .035, .81], [0, .423, 0], .015);
  box(gateway, housing, [1.30, .06, .83], [0, .463, 0], .027);
  box(gateway, graphite, [1.13, .215, .025], [0, .234, .421], .009);
  // Two etched arrows on the gateway's lid show the forwarding direction across its interfaces.
  for (const direction of [-1, 1]) {
    const z = direction * .097;
    const v = (x: number, depth: number) => point(x * direction, .499, z + depth * direction);
    const arrow = new THREE.CurvePath<THREE.Vector3>();
    arrow.add(new THREE.LineCurve3(v(-.23, 0), v(.23, 0)));
    tube(gateway, graphite, arrow, .014, 1);
    const tip = new THREE.CurvePath<THREE.Vector3>();
    tip.add(new THREE.LineCurve3(v(.115, -.075), v(.23, 0)));
    tip.add(new THREE.LineCurve3(v(.23, 0), v(.115, .075)));
    tube(gateway, graphite, tip, .014, 2);
  }
  group.add(gateway);

  // Each Ethernet segment ends on its own gateway port. Cable boots point out of the +Z faces.
  const segments = [-1, 1].map(side => {
    const terminal = point(side * 1.71, .566, -.179);
    const gatewayPort = point(side * .33, .244, .439);
    box(side < 0 ? left : right, graphite, [.16, .089, .025], [-side * .54, terminal.y, terminal.z - .011]);
    box(gateway, rim, [.17, .115, .023], [gatewayPort.x, gatewayPort.y, .44], .007);
    const cable = new THREE.Group();
    cable.name = side < 0 ? "cable-left" : "cable-right";
    for (const connector of [terminal, gatewayPort]) {
      box(cable, rim, [.13, .074, .115], [connector.x, connector.y, connector.z + .042], .009);
      box(cable, rubber, [.104, .068, .09], [connector.x, connector.y, connector.z + .13], .015);
    }
    const route = new THREE.CatmullRomCurve3([
      terminal.clone().add(point(0, 0, .16)), terminal.clone().add(point(0, 0, .30)),
      point(side * 1.56, .32, .48), point(side * 1.12, .260, .58),
      point(side * .88, .115, .66), point(side * .59, .065, .75),
      point(gatewayPort.x, .178, .77), gatewayPort.clone().add(point(0, 0, .16)),
    ]);
    tube(cable, rubber, route, .033, 48);
    group.add(cable);
    return route;
  });

  const packet = new THREE.Group();
  packet.name = "data-packet";
  box(packet, matte(topologyYellow), [.75, .47, .10], [0, 0, 0], .029);
  const face = new THREE.PlaneGeometry(.707, .434);
  const foldedEdges = [[[-.34, .194], [0, -.040]], [[0, -.040], [.34, .194]],
    [[-.34, -.192], [-.13, -.006]], [[.13, -.006], [.34, -.192]]];
  for (const sign of [-1, 1]) {
    const side = new THREE.Mesh(face, gold);
    side.position.z = sign * .051;
    side.rotation.y = sign < 0 ? Math.PI : 0;
    packet.add(side);
    for (const [[x1, y1], [x2, y2]] of foldedEdges) {
      const crease = new THREE.LineCurve3(point(x1, y1, sign * .057), point(x2, y2, sign * .057));
      tube(packet, graphite, crease, .013, 1);
    }
  }
  packet.rotation.set(-.17, .26, 0);
  group.add(packet);

  const raised = (segment: number, t: number) => segments[segment].getPointAt(t).add(point(0, .54, 0));
  const route = new THREE.CatmullRomCurve3([
    raised(0, 0), raised(0, .38), raised(0, .72), raised(0, 1), point(0, .94, .31),
    raised(1, 1), raised(1, .72), raised(1, .38), raised(1, 0),
  ]);
  function setProgress(progress: number) {
    route.getPointAt(THREE.MathUtils.clamp(progress, 0, 1), packet.position);
  }
  setProgress(0);
  return { group, setProgress };
}
