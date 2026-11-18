import type { ComputerCategory } from "@/lib/computer-categories";

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
};
export type Mark = { points: Point3[]; finish: Finish };

export function deviceDrawing(device: TopologyDevice) {
  const parts: DevicePart[] = [];
  const marks: Mark[] = [];
  function box(position: Point3, size: Point3, finish: Finish = "case", outlined = false, bevel?: number) {
    parts.push({ shape: "box", position, size, finish, outlined, bevel: bevel ?? (outlined ? .025 : undefined) });
  }
  function drum(position: Point3, size: Point3, finish: Finish, outlined = false) {
    parts.push({ shape: "drum", position, size, finish, outlined });
  }
  function mark(points: Point3[], finish: Finish = "ink") { marks.push({ points, finish }); }
  function jack(x: number, y: number, z: number, width: number) {
    box([x, y, z], [width, width * .68, .024], "metal");
    box([x, y, z + .015], [width * .81, width * .45, .013], "ink");
    box([x, y - width * .20, z + .015], [width * .40, width * .22, .014], "ink");
  }
  function fastener(x: number, y: number, z: number) {
    drum([x, y, z], [.056, .012, .056], "metal");
    mark([[x - .013, y + .007, z + .008], [x + .013, y + .007, z - .008]]);
  }
  function carrier(width: number, depth: number) {
    box([0, .041, 0], [width, .082, depth], "case", true, .032);
    for (const x of [-width / 2 + .11, width / 2 - .11]) {
      for (const z of [-depth / 2 + .10, depth / 2 - .10]) {
        drum([x, .128, z], [.082, .096, .082], "metal");
      }
    }
  }

  if (device === "router") {
    drum([0, .045, 0], [1.76, .09, 1.41], "case", true);
    for (const x of [-.52, .52]) for (const z of [-.35, .35]) drum([x, .135, z], [.095, .095, .095], "metal");
    drum([0, .275, 0], [1.86, .21, 1.49], "case", true);
    drum([0, .384, 0], [1.82, .025, 1.45], "panel");
    drum([0, .421, 0], [1.86, .055, 1.49], "light", true);
    // Four arrowheads etched on the top of a low circular router.
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 2 * i;
      const rotate = (x: number, z: number): Point3 =>
        [x * Math.cos(angle) - z * Math.sin(angle), .451, x * Math.sin(angle) + z * Math.cos(angle)];
      mark([rotate(0, .10), rotate(0, .45)]);
      mark([rotate(-.108, .31), rotate(0, .45), rotate(.108, .31)]);
    }
    for (const x of [-.58, .58]) for (const z of [-.39, .39]) fastener(x, .453, z);
    box([0, .273, .721], [.65, .13, .075], "panel");
    for (const x of [-.20, -.035, .13]) jack(x, .278, .764, .115);
    box([.253, .28, .765], [.035, .035, .014], "accent");
  } else if (device === "switch" || device === "asa") {
    const width = device === "switch" ? 2.22 : 1.92;
    carrier(width + .10, 1.15);
    box([0, .299, 0], [width, .25, 1.04], "case", true);
    box([0, .428, 0], [width - .015, .028, 1.01], "panel");
    box([0, .458, 0], [width, .051, 1.04], "light", true);
    for (const x of [-width / 2 + .085, width / 2 - .085]) {
      for (const z of [-.44, .44]) fastener(x, .486, z);
    }
    box([0, .285, .525], [width - .15, .161, .032], "panel", false, .012);
    if (device === "switch") {
      for (let port = 0; port < 8; port++) jack(-.76 + port * .19, .285, .55, .14);
      jack(.86, .285, .55, .16);
      for (let vent = 0; vent < 7; vent++) {
        box([.53 + vent * .055, .485, -.13], [.022, .008, .38], "panel");
      }
    } else {
      for (let port = 0; port < 4; port++) jack(-.60 + port * .20, .285, .55, .145);
      for (let led = 0; led < 3; led++) box([.40 + led * .12, .29, .552], [.045, .035, .018], led === 0 ? "accent" : "metal");
      // Recessed shield emblem on the top plate of the firewall.
      mark([[-.34, .488, -.23], [.26, .488, -.23], [.26, .488, .03], [.17, .488, .18],
        [-.04, .488, .29], [-.25, .488, .18], [-.34, .488, .03], [-.34, .488, -.23]]);
      mark([[-.17, .488, .01], [-.07, .488, .11], [.09, .488, -.09]], "accent");
    }
  } else if (device === "server") {
    carrier(1.03, 1.07);
    box([0, .96, 0], [.87, 1.57, .94], "case", true, .035);
    box([0, 1.751, 0], [.85, .036, .92], "panel");
    box([0, 1.775, 0], [.87, .048, .94], "light", true);
    for (const x of [-.355, .355]) for (const z of [-.38, .38]) fastener(x, 1.802, z);
    box([0, 1.07, .476], [.72, 1.23, .034], "panel", false, .015);
    for (let bay = 0; bay < 3; bay++) {
      const y = 1.53 - bay * .175;
      box([0, y, .507], [.63, .126, .028], "ink", false, .012);
      box([-.015, y, .527], [.56, .085, .018], "case", false, .01);
      box([-.085, y, .539], [.30, .023, .014], "metal");
      box([.23, y, .54], [.033, .028, .012], bay === 0 ? "accent" : "panel");
    }
    for (let slot = 0; slot < 6; slot++) box([-.025, .89 - slot * .061, .508], [.52, .026, .024], "ink");
    box([-.23, .30, .482], [.075, .075, .038], "ink");
    box([.438, .97, 0], [.018, 1.26, .76], "panel", false, .014);
    box([.451, .97, 0], [.020, 1.23, .72], "case");
    for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
      box([.465, .63 + row * .135, -.21 + col * .082], [.010, .087, .021], "panel");
    }
  } else {
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
