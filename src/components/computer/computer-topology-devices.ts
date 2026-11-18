import type { ComputerCategory } from "@/lib/computer-categories";
import { asaPort, routerPort, serverPort, switchJackWidth, switchPort, workstationPort } from "./computer-topology-ports";
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

  function ciscoLid(x: number, y: number, z: number, scale = 1) {
    const ribs = [.061, .102, .164, .100, .047, .100, .164, .102, .061];
    ribs.forEach((depth, i) => box([x + (i - 4) * .049 * scale, y, z - .035 * scale], [.024 * scale, .008 * scale, depth * scale], "panel", false, .005 * scale));
    const letters = [
      [[-.124, .058], [-.162, .058], [-.177, .071], [-.177, .109], [-.162, .122], [-.124, .122]],
      [[-.086, .058], [-.086, .122]],
      [[-.012, .058], [-.047, .058], [-.061, .071], [-.054, .084], [-.020, .092], [-.012, .108], [-.023, .122], [-.061, .122]],
      [[.069, .058], [.034, .058], [.019, .072], [.019, .107], [.034, .122], [.069, .122]],
      [[.114, .058], [.145, .058], [.158, .071], [.158, .109], [.145, .122], [.114, .122], [.101, .109], [.101, .071], [.114, .058]],
    ];
    letters.forEach(stroke => mark(stroke.map(([dx, dz]) => [x + dx * scale, y + .001 * scale, z + dz * scale]), "metal"));
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
    ciscoLid(0, .318, 0);

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
    // ASA 5506-X: the front bezel is blind. All network, console and power connections face +Z.
    feet(.76, .88);
    box([0, .256, -1.132], [1.98, .428, .078], "graphite", false, .023);
    box([0, .256, -1.174], [1.932, .246, .020], "ink", false, .010);
    const bridge = [.032, .051, .077, .050, .027, .050, .077, .051, .032];
    bridge.forEach((height, i) => box([.813 - i * .022, .286, -1.188], [.010, height, .009], "metal"));
    // A striped model badge occupies the right end when seen from the front.
    box([-.623, .247, -1.190], [.51, .101, .014], "panel", false, .007);
    for (let i = 0; i < 10; i++) for (let step = 0; step < 5; step++) {
      const x = -.914 + i * .079 + step * .018;
      if (x > -.35 || step === 0 || step === 4) box([x, .158 + step * .040, -1.190], [.014, .043, .009], "metal");
    }
    // Short fascia lettering, printed on the -Z face and occluded by the case in the rear view.
    const glyphs: Record<string, string[]> = {
      C: ["111", "100", "100", "100", "111"], I: ["111", "010", "010", "010", "111"],
      S: ["111", "100", "111", "001", "111"], O: ["111", "101", "101", "101", "111"],
      A: ["010", "101", "111", "101", "101"], 5: ["111", "100", "111", "001", "111"],
      6: ["111", "100", "111", "101", "111"], X: ["101", "101", "010", "101", "101"],
      "-": ["000", "000", "111", "000", "000"],
    };
    for (const [label, left, top, pixel] of [["CISCO", .826, .234, .010], ["ASA 5506-X", -.403, .272, .011]] as const) {
      [...label].forEach((letter, i) => {
        const rows = glyphs[letter === "0" ? "O" : letter] ?? [];
        rows.forEach((row, j) => {
          for (const stroke of row.matchAll(/1+/g)) {
            const width = stroke[0].length;
            box([left - (i * 4 + stroke.index + (width - 1) / 2) * pixel, top - j * pixel, -1.200],
              [pixel * width, pixel, .004], "light");
          }
        });
      });
    }
    box([0, .248, 0], [1.96, .392, 2.272], "graphite", true, .015);
    box([0, .453, -.002], [1.98, .055, 2.316], "graphite", true, .014).traceLid = true;
    // The vent pattern wraps from the lid onto both sidewalls of the fanless sheet-metal case.
    for (let row = 0; row < 14; row++) for (let col = 0; col < 13; col++) {
      const x = -.891 + col * .142 + (row % 2) * .067, z = -.881 + row * .138;
      if (Math.abs(Math.abs(x) - Math.abs(z)) < .063) continue;
      drum([x, .482, z], [.083, .003, .083], "ink");
    }
    for (const side of [-1, 1]) for (let row = 0; row < 3; row++) for (let col = 0; col < 13; col++) {
      box([side * .981, .223 + row * .078, -.885 + col * .140 + (row % 2) * .061],
        [.005, .046, .073], "ink", false, undefined, side < 0 ? "left" : "right");
    }

    // The four-pin DC inlet sits below the chassis indicators, left of the eight numbered data jacks.
    box([0, .244, 1.143], [1.951, .389, .044], "panel", false, .010);
    box([-.893, .171, 1.170], [.138, .131, .017], "ink", false, .008);
    for (const x of [-.921, -.865]) for (const y of [.144, .198]) box([x, y, 1.182], [.022, .022, .010], "metal");
    for (let i = 0; i < 4; i++) box([-.931 + i * .046, .428, 1.157], [.029, .020, .043], i === 0 ? "accent" : "ink");
    for (let port = 0; port < 8; port++) {
      const socket = asaPort(port);
      jack(socket, .163);
      for (const side of [-1, 1]) box([socket[0] + side * .060, .248, 1.177], [.024, .014, .011], port < 2 && side < 0 ? "accent" : "ink");
    }
    jack([.652, .302, 1.177], .154); // Dedicated GE management above serial console.
    jack([.652, .165, 1.177], .154);
    box([.811, .137, 1.170], [.083, .047, .015], "metal"); // Mini-B console.
    box([.811, .137, 1.182], [.059, .025, .010], "ink");
    box([.900, .191, 1.170], [.064, .151, .016], "metal"); // Vertical USB-A.
    box([.900, .191, 1.183], [.039, .124, .012], "ink");
    box([.947, .125, 1.171], [.021, .020, .011], "ink"); // Recessed reset.
    box([.903, .380, 1.172], [.029, .070, .013], "ink"); // Lock slot.
  } else if (device === "switch") {
    // Catalyst C9200L-24T-4G: 445 × 288 × 44 mm without the rear PSU handle.
    feet(1.10, .67);
    box([0, .176, -.851], [2.64, .246, .036], "metal");
    // Rear, viewed from -Z: console/MGMT, StackWise-80, two fixed fans, two PSU bays.
    for (const y of [.117, .214]) jack([1.233, y, -.880], .094, -1);
    for (const x of [.889, .571]) {
      box([x, .162, -.875], [.245, .073, .028], "metal", false, .014);
      box([x, .162, -.893], [.188, .043, .013], "ink", false, .009);
    }
    for (const x of [.237, -.024]) {
      box([x, .177, -.876], [.239, .203, .024], "ink", false, .012);
      for (let slot = 0; slot < 5; slot++) box([x - .095 + slot * .0475, .177, -.892], [.012, .168, .012], "metal");
    }
    box([-.454, .171, -.875], [.55, .211, .032], "panel", false, .013);
    box([-.432, .171, -.897], [.182, .125, .023], "ink", false, .014);
    for (const x of [-.665, -.620]) box([x, .175, -.970], [.020, .029, .198], "metal");
    box([-.6425, .175, -1.068], [.066, .029, .025], "metal", false, .006);
    box([-1.025, .171, -.875], [.535, .211, .027], "case", false, .013);

    box([0, .174, 0], [2.68, .252, 1.716], "case", true, .014);
    box([0, .302, 0], [2.68, .022, 1.735], "light", true, .011);
    ciscoLid(0, .316, .343, .81);
    for (const x of [-.960, -.596]) {
      box([x, .315, -.494], [.333, .003, .283], "case");
      for (let line = 0; line < 5; line++) box([x - .045, .318, -.573 + .027 * line], [.179 - .013 * (line % 3), .002, .007], "metal");
    }
    for (const x of [-1.205, -.830, .830, 1.205]) {
      for (const z of [-.736, .715]) drum([x, .314, z], [.024, .005, .024], "metal");
    }

    // The left half of a 24T face is blank below the upper status and USB strip.
    box([0, .177, .844], [2.672, .251, .052], "case", false, .013);
    box([0, .057, .871], [2.607, .013, .008], "panel");
    for (const [x, w] of [[-.460, .478], [.146, .540], [.690, .483], [1.075, .330]]) {
      box([x, .274, .872], [w, .034, .012], "panel", false, .006);
    }
    box([-1.294, .274, .875], [.026, .025, .009], "panel");
    box([-1.190, .274, .875], [.038, .029, .009], "ink", false, .008);
    for (let led = 0; led < 5; led++) box([-1.126 + .035 * led, .271, .876], [.013, .013, .009], led === 0 ? "accent" : "metal");
    box([-.939, .274, .874], [.061, .029, .014], "ink", false, .005); // mini-USB console
    for (const x of [-.838, -.712]) box([x, .274, .874], [.087, .029, .014], "ink"); // USB-A

    for (const first of [0, 6]) {
      const x = (switchPort(first, 0)[0] + switchPort(first + 5, 0)[0]) / 2;
      box([x, .168, .872], [.507, .170, .013], "metal", false, .008);
    }
    for (let column = 0; column < 12; column++) {
      for (const row of [0, 1]) {
        const [x, y, z] = switchPort(column, row);
        box([x, y, z], [switchJackWidth * .875, .049, .012], "ink");
        box([x, y + (row ? .028 : -.028), z], [switchJackWidth * .40, .015, .012], "ink");
      }
    }
    // The 4G uplinks form one fixed row below a perforated strip.
    box([1.090, .214, .875], [.384, .043, .014], "panel", false, .006);
    for (let hole = 0; hole < 10; hole++) box([.925 + hole * .037, .214, .885], [.019, .019, .009], "ink");
    for (let cage = 0; cage < 4; cage++) {
      const x = .939 + .098 * cage;
      box([x, .123, .877], [.098, .087, .020], "metal");
      box([x, .123, .890], [.084, .053, .011], "ink");
    }
    for (const side of [-1, 1] as const) {
      for (let slot = 0; slot < 16; slot++) {
        box([side * 1.342, .17, -.677 + slot * .068], [.009, .096, .021], "panel", false, undefined, side < 0 ? "left" : "right");
      }
    }
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
