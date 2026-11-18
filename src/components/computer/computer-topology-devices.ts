import type { ComputerCategory } from "@/lib/computer-categories";
import { asaPort, routerPort, serverPort, switchPort, workstationPort } from "./computer-topology-ports";

/** Dimensions and front-panel details shared by the live scene and its projected diagrams. */
export type TopologyDevice = ComputerCategory;
export type Point3 = [number, number, number];
export type Finish = "case" | "panel" | "ink" | "light" | "screen" | "metal" | "accent";
export type DevicePart = {
  shape: "box" | "drum" | "dome";
  position: Point3;
  size: Point3;
  finish: Finish;
  outlined: boolean;
  bevel?: number;
  assembly?: "tower";
};
export type Mark = { points: Point3[]; finish: Finish; assembly?: "tower" };

export function deviceDrawing(device: TopologyDevice) {
  const parts: DevicePart[] = [];
  const marks: Mark[] = [];
  let assembly: "tower" | undefined;
  function box(position: Point3, size: Point3, finish: Finish = "case", outlined = false, bevel?: number) {
    parts.push({ shape: "box", position, size, finish, outlined, bevel: bevel ?? (outlined ? .025 : undefined), assembly });
  }
  function drum(position: Point3, size: Point3, finish: Finish, outlined = false) {
    parts.push({ shape: "drum", position, size, finish, outlined, assembly });
  }
  function mark(points: Point3[], finish: Finish = "ink") { marks.push({ points, finish, assembly }); }
  function jack([x, y, z]: Point3, width = .154, facing: 1 | -1 = 1) {
    box([x, y, z - facing * .011], [width, width * .72, .022], "metal");
    box([x, y + .005, z], [width * .86, width * .46, .009], "ink");
    box([x, y - width * .21, z], [width * .44, width * .20, .010], "ink");
  }
  function feet(x: number, z: number, centerX = 0, centerZ = 0) {
    for (const dx of [-x, x]) for (const dz of [-z, z]) {
      box([centerX + dx, .029, centerZ + dz], [.12, .058, .14], "ink", false, .012);
    }
  }

  if (device === "router") {
    // An industrial router mounts vertically on a DIN rail. Its extruded cooling fins
    // sit on the sides; DC, LAN, WAN and the pluggable modem are on the service face.
    box([0, .66, -.42], [.41, 1.02, .18], "metal", true);
    box([0, .62, -.48], [.68, .16, .13], "panel");
    box([0, .073, -.04], [.97, .125, .89], "metal", true);
    box([0, .68, -.02], [.78, 1.23, .98], "panel", true, .032);
    box([0, 1.296, -.018], [.80, .042, .96], "light", true, .015);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        box([side * .421, .697, -.411 + i * .106], [.115, 1.09, .047], "metal", false, .010);
      }
    }
    box([0, .68, .481], [.77, 1.19, .047], "case", true, .018);
    box([-.16, 1.112, .517], [.35, .13, .065], "ink", false, .010);
    for (let i = 0; i < 4; i++) {
      box([-.275 + i * .078, 1.128, .55], [.045, .033, .01], "metal");
    }
    box([.205, .965, .511], [.208, .38, .026], "panel", true, .009);
    box([.205, 1.036, .531], [.16, .11, .017], "metal");
    box([.205, .884, .534], [.097, .046, .015], "ink");
    for (const x of [-.235, -.055]) for (const y of [.637, .79]) jack([x, y, .527]);
    jack(routerPort);
    box([-.113, .388, .513], [.265, .097, .023], "metal");
    box([-.113, .388, .529], [.218, .060, .012], "ink");
    box([-.14, .205, .516], [.125, .046, .024], "ink");
    for (let i = 0; i < 4; i++) box([.085 + i * .055, .20, .517], [.030, .022, .022], i === 0 ? "accent" : "metal");
  } else if (device === "asa") {
    // Fanless desktop security appliance, displayed with its eight-port rear I/O facing the viewer.
    feet(.76, .43);
    box([0, .235, 0], [2.06, .38, 1.20], "panel", true, .058);
    box([0, .406, -.018], [2.06, .11, 1.21], "light", true, .040);
    box([0, .228, .595], [1.99, .258, .052], "case", false, .019);
    box([-.866, .233, .627], [.15, .125, .031], "ink", false, .018);
    box([-.864, .237, .648], [.047, .041, .014], "metal");
    for (let i = 0; i < 8; i++) jack(asaPort(i));
    jack([.72, .287, .634], .15);
    box([.718, .174, .626], [.14, .061, .024], "ink");
    box([.907, .268, .626], [.074, .045, .024], "ink");
    for (let i = 0; i < 3; i++) box([-.943 + .065 * i, .366, .619], [.037, .017, .023], i === 0 ? "accent" : "ink");
    for (const x of [-.81, .81]) {
      for (let i = 0; i < 8; i++) box([x, .463, -.397 + i * .093], [.20, .006, .020], "panel");
    }
  } else if (device === "switch") {
    // 1U managed access switch: two groups of twelve copper sockets, four SFP cages and rack ears.
    feet(1.03, .47);
    box([0, .226, -.03], [2.67, .37, 1.24], "case", true, .021);
    box([0, .413, -.029], [2.65, .025, 1.22], "light", true, .014);
    box([0, .219, .594], [2.65, .336, .075], "ink", false, .014);
    for (const x of [-1.397, 1.397]) {
      box([x, .229, .558], [.14, .365, .062], "metal", true, .007);
      for (const y of [.118, .338]) box([x, y, .592], [.065, .037, .012], "ink", false, .008);
    }
    for (let column = 0; column < 12; column++) {
      for (let row = 0; row < 2; row++) jack(switchPort(column, row), .154);
    }
    for (const x of [.912, 1.136]) for (const y of [.160, .302]) {
      box([x, y, .636], [.182, .087, .027], "metal");
      box([x, y, .651], [.154, .062, .013], "ink");
    }
    for (let i = 0; i < 4; i++) box([-1.233, .302 - i * .052, .635], [.049, .028, .012], i === 0 ? "accent" : "panel");
    for (let i = 0; i < 12; i++) box([1.337, .22, -.52 + i * .083], [.011, .13, .029], "ink");
  } else if (device === "server") {
    feet(.38, .46);
    // The service face carries two hot-swap drive cages; the NICs sit on the rear I/O plate.
    jack(serverPort, .17, -1);
    jack([-.015, .90, -.608], .17, -1);
    box([-.10, .93, -.587], [.58, .47, .034], "panel");
    for (const y of [.22, .395]) {
      box([0, y, -.582], [.81, .142, .038], "ink");
      box([.216, y, -.605], [.204, .070, .015], "metal");
    }
    box([0, .982, -.005], [.99, 1.86, 1.14], "case", true, .045);
    box([0, 1.916, -.006], [.98, .041, 1.135], "light", true, .020);
    box([0, .981, .563], [.946, 1.81, .083], "ink", false, .031);
    box([-.073, 1.729, .616], [.65, .22, .027], "panel", false, .012);
    box([-.074, 1.757, .634], [.56, .028, .012], "ink");
    box([.367, 1.755, .620], [.088, .088, .032], "metal", false, .02);
    box([.367, 1.755, .642], [.028, .038, .012], "accent");
    for (let row = 0; row < 2; row++) {
      const y = .42 + row * .632;
      for (let bay = 0; bay < 4; bay++) {
        const x = -.308 + bay * .205;
        box([x, y, .618], [.184, .486, .032], "panel", false, .013);
        box([x, y - .02, .639], [.115, .31, .026], "metal", false, .013);
        box([x, y - .035, .656], [.054, .203, .01], "ink");
        box([x, y + .176, .646], [.054, .026, .016], bay === 0 ? "accent" : "ink");
      }
      for (let i = 0; i < 3; i++) box([0, y + .30 + i * .035, .612], [.785, .013, .017], "panel");
    }
    box([.497, .989, -.005], [.018, 1.66, .98], "panel", false, .012);
    box([.509, .989, -.005], [.014, 1.61, .93], "case");
    box([.519, 1.44, -.30], [.015, .13, .15], "metal", false, .014);
  } else {
    assembly = "tower";
    // Both operating systems run on a desktop tower with a rear motherboard I/O shield.
    // Rear parts precede the opaque case so the fixed-angle SVG also occludes them.
    feet(.224, .403, -1.253, -.044);
    jack(workstationPort, .17, -1);
    for (const y of [.614, .684, .943]) box([-1.353, y, -.543], [.124, .04, .022], "ink");
    box([-1.353, .82, -.526], [.217, .501, .034], "metal");
    for (let i = 0; i < 4; i++) box([-1.257, .269 + i * .08, -.529], [.42, .041, .022], "metal");
    box([-1.254, .685, -.032], [.60, 1.25, .967], "case", true, .032);
    box([-1.254, .67, .452], [.576, 1.222, .043], "ink", false, .019);
    box([-1.254, .942, .479], [.530, .611, .023], "panel", false, .015);
    box([-1.254, 1.125, .495], [.422, .054, .014], "ink");
    box([-1.254, 1.13, .507], [.32, .014, .008], "metal");
    box([-1.423, .973, .502], [.063, .064, .018], "case", false, .012);
    box([-1.423, .973, .513], [.019, .024, .008], "accent");
    for (const x of [-1.255, -1.159]) box([x, .798, .497], [.056, .103, .013], "ink");
    if (device === "linux") {
      for (let i = 0; i < 7; i++) box([-1.449 + i * .065, .364, .479], [.028, .403, .017], "panel");
    } else {
      for (let i = 0; i < 7; i++) box([-1.254, .179 + i * .061, .479], [.449, .024, .017], "panel");
    }
    box([-.951, .679, -.048], [.014, 1.10, .832], "panel", false, .014);
    box([-.940, .679, -.048], [.012, 1.065, .796], "case");
    assembly = undefined;
    box([0, .033, -.14], [.72, .065, .45], "metal", true);
    box([0, .075, -.14], [.68, .045, .42], "light", true);
    box([0, .255, -.18], [.22, .36, .095], "metal", true);
    box([0, .281, -.125], [.086, .126, .012], "panel", false, .005);
    box([0, .88, -.170], [1.59, .89, .155], "panel", true, .035);
    box([0, .87, -.128], [1.64, .94, .138], "case", true, .025);
    box([0, .90, -.057], [1.51, .75, .026], "metal", false, .009);
    box([0, .90, -.045], [1.48, .72, .024], "screen");
    box([.68, .464, -.054], [.035, .014, .014], "accent");

    if (device === "linux") {
      mark([[-.46, 1.06, -.031], [-.32, .96, -.031], [-.46, .86, -.031]], "accent");
      mark([[-.24, .86, -.031], [.03, .86, -.031]], "accent");
    } else {
      for (const x of [-.12, .12]) {
        for (const y of [.80, 1.02]) box([x, y, -.027], [.205, .184, .010], "accent");
      }
    }
    box([-.09, .035, .54], [1.26, .065, .40], "metal", true);
    box([-.09, .072, .54], [1.21, .037, .37], "panel", false, .014);
    for (let row = 0; row < 3; row++) {
      const z = .414 + row * .081;
      for (let key = 0; key < 11; key++) {
        box([-.623 + key * .103 + row * .009, .111, z], [.089, .043, .067], "light", true, .011);
      }
    }
    for (const [x, width] of [[-.60, .14], [-.432, .14], [-.073, .54], [.28, .12], [.438, .15]]) {
      box([x, .111, .659], [width, .043, .072], "light", true, .011);
    }
    drum([.755, .026, .53], [.184, .049, .273], "panel");
    parts.push({ shape: "dome", position: [.755, .045, .53], size: [.185, .084, .273], finish: "case", outlined: true });
    box([.755, .125, .50], [.020, .011, .058], "metal", false, .004);
  }
  return { parts, marks };
}
