import type { ComputerCategory } from "@/lib/computer-categories";
import { asaPort, routerPort, serverPort, switchPort, workstationPort } from "./computer-topology-ports";
import { casePoint, caseYaw } from "./computer-topology-poses";

/** Dimensions and front-panel details shared by the live scene and its projected diagrams. */
export type TopologyDevice = ComputerCategory;
export type Point3 = [number, number, number];
export type Finish = "case" | "panel" | "ink" | "graphite" | "light" | "screen" | "metal" | "accent";
export type DevicePart = {
  shape: "box" | "drum" | "dome";
  position: Point3;
  size: Point3;
  finish: Finish;
  outlined: boolean;
  bevel?: number;
  assembly?: "tower";
  yaw?: number;
  traceLid?: boolean;
  decoratedFace?: "left" | "right";
};
export type Mark = { points: Point3[]; finish: Finish; assembly?: "tower" };

export function deviceDrawing(device: TopologyDevice) {
  const parts: DevicePart[] = [];
  const marks: Mark[] = [];
  let assembly: "tower" | undefined;
  function box(position: Point3, size: Point3, finish: Finish = "case", outlined = false, bevel?: number, decoratedFace?: "left" | "right") {
    const part: DevicePart = { shape: "box", position, size, finish, outlined, bevel: bevel ?? (outlined ? .025 : undefined), assembly, decoratedFace };
    parts.push(part);
    return part;
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
    // ISR 4331: the bezel carries management and power, opposite the modular I/O face.
    feet(1.09, 1.06);
    box([0, .181, -1.297], [2.62, .269, .055], "ink", false, .015);
    // Left/right here are as viewed from this machine's management side (-Z).
    for (const x of [.99, .79]) jack([x, .207, -1.336], .137, -1);
    jack([.99, .107, -1.336], .137, -1);
    box([.79, .105, -1.332], [.12, .043, .021], "metal");
    box([1.136, .103, -1.334], [.068, .027, .018], "metal");
    for (const [center, width, columns] of [[.36, .63, 11], [-.62, .43, 8]]) {
      box([center, .170, -1.334], [width, .185, .024], "panel");
      for (let row = 0; row < 3; row++) for (let col = 0; col < columns; col++) {
        box([center - width / 2 + .032 + col * (width - .064) / (columns - 1), .116 + row * .051, -1.349],
          [.030, .029, .009], "ink");
      }
    }
    for (const y of [.14, .20]) for (let i = 0; i < 4; i++) {
      box([-.25 + i * .06, y, -1.337], [.022, .021, .014], i === 0 && y === .20 ? "accent" : "metal");
    }
    box([-1.037, .173, -1.334], [.194, .148, .027], "metal", false, .016);
    box([-1.037, .173, -1.352], [.145, .102, .013], "ink", false, .012);
    box([-1.205, .17, -1.337], [.057, .083, .026], "panel");

    box([0, .168, 0], [2.65, .244, 2.60], "panel", true, .018);
    box([0, .299, -.004], [2.65, .031, 2.64], "graphite", true, .012).traceLid = true;
    box([0, .317, -1.156], [2.46, .006, .012], "metal");
    // The bridge emblem is pressed into the lid. These shallow ribs follow the two arches.
    const ribs = [.061, .102, .164, .100, .047, .100, .164, .102, .061];
    ribs.forEach((depth, i) => box([(i - 4) * .049, .318, -.035], [.024, .008, depth], "panel", false, .005));
    const letters = [
      [[-.124, .058], [-.162, .058], [-.177, .071], [-.177, .109], [-.162, .122], [-.124, .122]],
      [[-.086, .058], [-.086, .122]],
      [[-.012, .058], [-.047, .058], [-.061, .071], [-.054, .084], [-.020, .092], [-.012, .108], [-.023, .122], [-.061, .122]],
      [[.069, .058], [.034, .058], [.019, .072], [.019, .107], [.034, .122], [.069, .122]],
      [[.114, .058], [.145, .058], [.158, .071], [.158, .109], [.145, .122], [.114, .122], [.101, .109], [.101, .071], [.114, .058]],
    ];
    letters.forEach(stroke => mark(stroke.map(([x, z]) => [x, .319, z]), "metal"));

    // Two RJ45s and two SFP cages serve the three integrated GE interfaces (4331 rear view).
    box([0, .172, 1.290], [2.615, .244, .054], "ink", false, .008);
    jack([routerPort[0], .243, routerPort[2]]);
    jack(routerPort); // Lower copper jack: GigabitEthernet0/0/1.
    for (const y of [.120, .243]) {
      box([-.994, y, 1.326], [.153, .092, .028], "metal");
      box([-.994, y, 1.344], [.128, .059, .013], "ink");
    }
    box([-1.189, .060, 1.327], [.130, .013, .014], "accent");
    // Single-width NIM blanking plates flank their removable central divider.
    for (const x of [-.672, -.185]) {
      box([x, .171, 1.325], [.458, .206, .034], "metal", false, .012);
      box([x, .173, 1.344], [.351, .146, .013], "panel", false, .008);
      for (const side of [-1, 1]) box([x + side * .197, .173, 1.349], [.031, .043, .025], "ink", false, .007);
    }
    // One full-size SM-X bay, shown with a vented cover rather than an installed port card.
    box([.652, .171, 1.323], [1.141, .210, .034], "metal", false, .009);
    box([.645, .171, 1.343], [.967, .150, .012], "panel");
    for (let row = 0; row < 2; row++) for (let col = 0; col < 10; col++) {
      box([.229 + col * .092, .136 + row * .067, 1.354], [.063, .036, .011], "ink");
    }
    for (const x of [.120, 1.180]) box([x, .170, 1.348], [.038, .046, .025], "ink", false, .007);
    box([1.268, .169, 1.322], [.068, .162, .016], "metal", false, .008);
    for (const y of [.125, .211]) box([1.267, y, 1.335], [.038, .034, .015], "ink", false, .007);
  } else if (device === "asa") {
    // Fanless desktop security appliance, displayed with its eight-port rear I/O facing the viewer.
    feet(.76, .43);
    box([0, .235, 0], [2.06, .38, 1.20], "panel", true, .058);
    box([0, .406, -.018], [2.06, .11, 1.21], "light", true, .040);
    box([0, .228, .595], [1.99, .258, .052], "case", false, .019);
    box([-.866, .233, .627], [.15, .125, .031], "ink", false, .018);
    box([-.864, .237, .648], [.047, .041, .014], "metal");
    for (let i = 0; i < 8; i++) jack(asaPort(i));
    jack([.868, .287, .634], .15);
    box([.868, .174, .626], [.14, .061, .024], "ink");
    box([-.659, .268, .626], [.074, .045, .024], "ink");
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
    for (let i = 0; i < 12; i++) box([1.337, .22, -.52 + i * .083], [.011, .13, .029], "ink", false, undefined, "right");
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
    box([.497, .989, -.005], [.018, 1.66, .98], "panel", false, .012, "right");
    box([.509, .989, -.005], [.014, 1.61, .93], "case", false, undefined, "right");
    box([.519, 1.44, -.30], [.015, .13, .15], "metal", false, .014, "right");
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
    box([-.951, .679, -.048], [.014, 1.10, .832], "panel", false, .014, "right");
    box([-.940, .679, -.048], [.012, 1.065, .796], "case", false, undefined, "right");
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
  const workstation = device === "linux" || device === "windows-server";
  for (const part of parts) {
    if (workstation && part.assembly !== "tower") continue;
    part.position = casePoint(device, part.position);
    part.yaw = caseYaw[device];
  }
  for (const mark of marks) {
    if (!workstation || mark.assembly === "tower") mark.points = mark.points.map(point => casePoint(device, point));
  }
  return { parts, marks };
}
