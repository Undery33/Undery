import type { ComputerCategory } from "@/lib/computer-categories";

/** Dimensions and front-panel details shared by the live scene and its projected diagrams. */
export type TopologyDevice = ComputerCategory;
export type Point3 = [number, number, number];
export type Finish = "case" | "panel" | "ink" | "light" | "screen";
export type DevicePart = {
  shape: "box" | "drum";
  position: Point3;
  size: Point3;
  finish: Finish;
  outlined: boolean;
};
export type Mark = { points: Point3[]; finish: Finish };

export function deviceDrawing(device: TopologyDevice) {
  const parts: DevicePart[] = [];
  const marks: Mark[] = [];
  function box(position: Point3, size: Point3, finish: Finish = "case", outlined = false) {
    parts.push({ shape: "box", position, size, finish, outlined });
  }
  function drum(position: Point3, size: Point3, finish: Finish) {
    parts.push({ shape: "drum", position, size, finish, outlined: true });
  }
  function mark(points: Point3[], finish: Finish = "ink") { marks.push({ points, finish }); }
  function jack(x: number, y: number, z: number, width: number) {
    box([x, y, z], [width, width * .58, .024], "ink");
    box([x, y + width * .08, z + .015], [width * .64, width * .12, .014], "light");
  }

  if (device === "router") {
    drum([0, .065, 0], [1.78, .13, 1.42], "panel");
    drum([0, .25, 0], [1.86, .31, 1.49], "case");
    // Four arrowheads etched on the top of a low circular router.
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 2 * i;
      const rotate = (x: number, z: number): Point3 =>
        [x * Math.cos(angle) - z * Math.sin(angle), .409, x * Math.sin(angle) + z * Math.cos(angle)];
      mark([rotate(0, .10), rotate(0, .45)]);
      mark([rotate(-.108, .31), rotate(0, .45), rotate(.108, .31)]);
    }
    box([0, .22, .721], [.57, .15, .075], "panel");
    for (const x of [-.17, 0, .17]) jack(x, .23, .766, .12);
  } else if (device === "switch" || device === "asa") {
    const width = device === "switch" ? 2.22 : 1.92;
    box([0, .075, 0], [width - .12, .15, .88], "panel");
    box([0, .285, 0], [width, .32, 1.04], "case", true);
    box([0, .265, .525], [width - .10, .215, .036], "panel");
    if (device === "switch") {
      for (let port = 0; port < 8; port++) jack(-.76 + port * .19, .285, .55, .14);
      jack(.86, .285, .55, .16);
      for (let vent = 0; vent < 7; vent++) {
        box([.56 + vent * .055, .449, -.13], [.022, .008, .38], "panel");
      }
    } else {
      for (let port = 0; port < 4; port++) jack(-.60 + port * .20, .285, .55, .145);
      for (let led = 0; led < 3; led++) box([.40 + led * .12, .29, .552], [.053, .049, .022], "light");
      // Recessed shield emblem on the top plate of the firewall.
      mark([[-.34, .45, -.23], [.26, .45, -.23], [.26, .45, .03], [.17, .45, .18],
        [-.04, .45, .29], [-.25, .45, .18], [-.34, .45, .03], [-.34, .45, -.23]]);
      mark([[-.17, .45, .01], [-.07, .45, .11], [.09, .45, -.09]]);
    }
  } else if (device === "server") {
    box([0, .065, 0], [.98, .13, 1.02], "panel", true);
    box([0, .95, 0], [.87, 1.7, .94], "case", true);
    box([0, 1.07, .481], [.72, 1.23, .035], "panel");
    for (let bay = 0; bay < 3; bay++) {
      const y = 1.53 - bay * .175;
      box([0, y, .51], [.63, .115, .028], "ink");
      box([-.08, y + .005, .531], [.32, .025, .012], "light");
      box([.23, y + .006, .531], [.044, .033, .012], "light");
    }
    for (let slot = 0; slot < 6; slot++) box([-.025, .89 - slot * .061, .508], [.52, .026, .024], "ink");
    box([-.23, .30, .482], [.075, .075, .038], "ink");
    for (let vent = 0; vent < 8; vent++) box([.439, .80, -.26 + vent * .077], [.012, .64, .017], "panel");
  } else {
    box([0, .065, -.13], [.69, .11, .48], "panel", true);
    box([0, .27, -.18], [.16, .39, .18], "case", true);
    box([0, .87, -.14], [1.64, .94, .17], "case", true);
    box([0, .90, -.045], [1.48, .72, .024], "screen");
    box([0, .475, -.043], [.093, .026, .014], "ink");
    if (device === "linux") {
      mark([[-.46, 1.06, -.022], [-.32, .96, -.022], [-.46, .86, -.022]], "light");
      mark([[-.24, .86, -.022], [.03, .86, -.022]], "light");
    } else {
      for (const x of [-.12, .12]) {
        for (const y of [.80, 1.02]) box([x, y, -.021], [.205, .184, .014], "light");
      }
    }
    box([-.09, .048, .54], [1.23, .082, .37], "case", true);
    for (const z of [.46, .545]) {
      for (let key = 0; key < 9; key++) box([-.61 + key * .125, .096, z], [.082, .013, .044], "panel");
    }
    box([-.10, .096, .63], [.56, .013, .035], "panel");
    box([.76, .059, .52], [.14, .09, .23], "panel", true);
  }
  return { parts, marks };
}
