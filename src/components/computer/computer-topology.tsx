import { useId, type CSSProperties } from "react";
import { computerCategories } from "@/lib/computer-categories";
import { deviceDrawing, type Point3, type TopologyDevice } from "./computer-topology-devices";
import { frameDevice } from "./computer-topology-framing";
import { patchLinks } from "./computer-topology-ports";
import { routePatchCable, type CableSocket, type Footprint } from "./computer-topology-routing";
import styles from "./computer-topology.module.css";

type Point = [number, number];
type Props = { hrefs?: Partial<Record<TopologyDevice, string>>; selected?: string };

// Orthographic projection from above the front-right corner, also used for card thumbnails.
function project([x, y, z]: Point3): Point {
  return [(.86 * x - .52 * z) * 52, (.24 * x + .40 * z - .90 * y) * 52];
}
function path(points: Point[], closed = true) {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join("") + (closed ? "Z" : "");
}

function beveledPolygon(points: Point[], radius: number) {
  const toward = (a: Point, b: Point): string => {
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const fraction = Math.min(.24, radius / distance);
    return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction].map(n => n.toFixed(2)).join(" ");
  };
  return points.map((p, i) => {
    const previous = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
    return `${i ? "L" : "M"}${toward(p, previous)}Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${toward(p, next)}`;
  }).join("") + "Z";
}

function projectDevice(device: TopologyDevice) {
  const drawing = deviceDrawing(device);
  const bounds: Point[] = [];
  const surfaces: { d: string; tone: string; outline?: boolean; stroke?: boolean }[] = [];
  for (const part of drawing.parts) {
    const [cx, cy, cz] = part.position;
    const [w, h, d] = part.size.map(value => value / 2);
    const point = (x: number, y: number, z: number) => project([cx + x * w, cy + y * h, cz + z * d]);
    const surface = (points: Point[], tone: string) => {
      bounds.push(...points);
      surfaces.push({ d: part.bevel ? beveledPolygon(points, part.bevel * 38) : path(points), tone, outline: part.outlined });
    };
    const top = part.finish;
    const side = part.outlined ? "side" : top;
    if (part.shape === "dome") {
      const left = point(-.86, 0, .52), right = point(.86, 0, -.52);
      bounds.push(left, right, point(0, 2, 0));
      surfaces.push({ tone: top, outline: true, d: `M${left.join(" ")}Q${point(-.4, 3.35, .2).join(" ")} ${right.join(" ")}Q${point(.47, -.1, 1.5).join(" ")} ${left.join(" ")}Z` });
    } else if (part.shape === "drum") {
      const segments = part.size[0] < .25 ? 12 : 48;
      const topRing = Array.from({ length: segments }, (_, i) => {
        const angle = (i / segments) * Math.PI * 2;
        return point(Math.cos(angle), 1, Math.sin(angle));
      });
      const order = [...topRing.keys()].sort((a, b) => topRing[a][0] - topRing[b][0]);
      const left = order[0], right = order[order.length - 1];
      const front = Array.from({ length: (left - right + segments) % segments + 1 }, (_, i) => topRing[(right + i) % segments]);
      const lower = front.map(([x, y]): Point => [x, y + .90 * part.size[1] * 52]);
      surface([...front, ...lower.reverse()], side);
      surface(topRing, top);
    } else if (!part.outlined) {
      // Small ports, keycaps and display markings only need their visible silhouette.
      surface([point(-1, -1, 1), point(1, -1, 1), point(1, -1, -1),
        point(1, 1, -1), point(-1, 1, -1), point(-1, 1, 1)], top);
    } else {
      surface([point(-1, -1, 1), point(1, -1, 1), point(1, 1, 1), point(-1, 1, 1)], "front");
      surface([point(1, -1, 1), point(1, -1, -1), point(1, 1, -1), point(1, 1, 1)], side);
      surface([point(-1, 1, 1), point(1, 1, 1), point(1, 1, -1), point(-1, 1, -1)], top);
    }
  }
  for (const mark of drawing.marks) {
    surfaces.push({ d: path(mark.points.map(project), false), tone: mark.finish, stroke: true });
  }
  const xs = bounds.map(p => p[0]), ys = bounds.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys), padding = 4;
  const frame = { x: x - padding, y: y - padding, w: Math.max(...xs) - x + 2 * padding, h: Math.max(...ys) - y + 2 * padding };
  const footprint: Footprint = { left: Infinity, right: -Infinity, back: Infinity, front: -Infinity };
  for (const { position: [x, , z], size: [w, , d] } of drawing.parts) {
    footprint.left = Math.min(footprint.left, x - w / 2);
    footprint.right = Math.max(footprint.right, x + w / 2);
    footprint.back = Math.min(footprint.back, z - d / 2);
    footprint.front = Math.max(footprint.front, z + d / 2);
  }
  return { surfaces, frame, footprint, viewBox: `${frame.x} ${frame.y} ${frame.w} ${frame.h}` };
}

const devices = computerCategories.map(category => category.id);
const deviceLabels = new Map(computerCategories.map(category => [category.id, category.label]));
const projections = new Map(devices.map(device => [device, projectDevice(device)]));

function DevicePaths({ device }: { device: TopologyDevice }) {
  return projections.get(device)!.surfaces.map(({ d, tone, stroke, outline }, i) => (
    <path key={i} d={d} fill={stroke ? "none" : `var(--device-${tone})`}
      stroke={stroke ? `var(--device-${tone})` : outline ? "var(--device-edge)" : "none"}
      strokeWidth={stroke ? 1.02 : .57} strokeLinejoin="round" strokeLinecap="round" />
  ));
}

export function ComputerDeviceIcon({ device }: { device: TopologyDevice }) {
  return (
    <svg className={styles.icon} viewBox={projections.get(device)!.viewBox} aria-hidden="true" focusable="false">
      <DevicePaths device={device} />
    </svg>
  );
}

type Placement = [device: TopologyDevice, centerX: number, top: number, width: number, height: number];
type Layout = { compact: boolean; width: number; height: number; devices: Placement[] };
const layouts: Layout[] = [
  {
    compact: false, width: 1040, height: 330,
    devices: [["router", 79, 190, 135, 78], ["asa", 263, 111, 144, 82], ["switch", 510, 115, 162, 82],
      ["server", 767, 0, 88, 123], ["linux", 740, 199, 140, 103], ["windows-server", 957, 107, 142, 104]],
  },
  {
    compact: true, width: 375, height: 292,
    devices: [["router", 54, 10, 87, 58], ["asa", 188, 12, 93, 53], ["switch", 315, 61, 100, 58],
      ["server", 53, 173, 59, 76], ["linux", 180, 177, 95, 72], ["windows-server", 310, 177, 97, 72]],
  },
];

function cameraFrames({ width, height, compact, devices }: Layout) {
  const frames: Record<string, string> = {};
  const centers = new Map(devices.map(([id, x, top, , h]) => [id, [x, top + h / 2] as Point]));
  for (const [device, , , w, h] of devices) {
    const [x, y] = centers.get(device)!;
    // Retain a little of the incoming connection in the frame. The router has only an outgoing link.
    const { from, to } = patchLinks.find(link => link.to === device) ?? patchLinks[0];
    const [nx, ny] = centers.get(from === device ? to : from)!;
    const { scale, offsetX, offsetY } = frameDevice(
      { width, height }, height - (compact ? 38 : 50), { width: w, height: h }, { x: nx - x, y: ny - y },
    );
    const dx = width / 2 - (x + offsetX) * scale;
    const dy = height / 2 - (y + offsetY) * scale;
    frames[`--frame-${device}`] = `translate(${dx}px, ${dy}px) scale(${scale})`;
  }
  return frames as CSSProperties;
}
// Invert the projection at desk height so this layout uses the same physical routing as WebGL.
function physicalPlacement([id, cx, top, w, h]: Placement) {
  const { frame, footprint: local } = projections.get(id)!;
  const scale = Math.min(w / frame.w, h / frame.h);
  const u = (cx - (frame.x + frame.w / 2) * scale) / 52;
  const v = (top + h / 2 - (frame.y + frame.h / 2) * scale) / 52;
  const determinant = .86 * .40 + .52 * .24;
  const x = (.40 * u + .52 * v) / determinant, z = (-.24 * u + .86 * v) / determinant;
  const footprint = { left: x + local.left * scale, right: x + local.right * scale, back: z + local.back * scale, front: z + local.front * scale };
  function socket([lx, ly, lz]: Point3, normal: Point3): CableSocket {
    return { position: [x + lx * scale, ly * scale, z + lz * scale], normal, scale, footprint };
  }
  return { footprint, socket };
}

const scenes = layouts.map(layout => {
  const mounts = new Map(layout.devices.map(p => [p[0], physicalPlacement(p)]));
  const footprints = [...mounts.values()].map(mount => mount.footprint);
  const xy = (point: Point3) => project(point).map(v => v.toFixed(2)).join(" ");
  const cables = patchLinks.map(({ from, to, start, end, startNormal, endNormal }, i) => {
    const a = mounts.get(from)!.socket(start, startNormal), b = mounts.get(to)!.socket(end, endNormal);
    const route = routePatchCable(a, b, footprints, Math.max(0, i - 2));
    const d = "M" + xy(route.start) + route.segments.map(({ corner, end }) => (corner ? "Q" + xy(corner) + " " : "L") + xy(end)).join("");
    return { from, to, a, b, d };
  });
  return { ...layout, cables, frames: cameraFrames(layout) };
});

// Face, side and top of a molded section, sharing the device projection so the plug meets the jack.
function PlugSection({ width, height, front, back, tone }: { width: number; height: number; front: number; back: number; tone: string }) {
  const x = width / 2, y = height / 2;
  const face = (points: Point3[]) => path(points.map(project));
  return <g fill={tone}>
    <path d={face([[x,-y,back], [x,-y,front], [x,y,front], [x,y,back]])} />
    <path d={face([[-x,-y,front], [x,-y,front], [x,y,front], [-x,y,front]])} />
    <path d={face([[-x,y,back], [x,y,back], [x,y,front], [-x,y,front]])} />
  </g>;
}

function PlugDefinitions({ id, sign }: { id: string; sign: 1 | -1 }) {
  const projection = ([x, y, z]: Point3): Point => project([x * sign, y, z * sign]);
  const section = (width: number, height: number, a: number, b: number, tone: string) => (
    <PlugSection width={width} height={height} back={Math.min(a * sign, b * sign)} front={Math.max(a * sign, b * sign)} tone={tone} />
  );
  return <>
    <g id={id + "-plug"} className={styles.plugShell}>
      {section(.14, .095, 0, .15, "var(--plug-shell)")}
      {Array.from({ length: 8 }, (_, i) => {
        const x = (i - 3.5) * .014;
        return <path key={i} d={path([projection([x,.052,.015]), projection([x,.052,.076])], false)} className={styles.contact} />;
      })}
      <path className={styles.latch} d={path([[0,.052,.035],[0,.076,.075],[0,.09,.145],[0,.06,.182]].map(p => projection(p as Point3)), false)} />
    </g>
    <g id={id + "-boot"} className={styles.plugBoot}>
      {section(.158, .125, .146, .207, "currentColor")}
      {section(.126, .099, .207, .263, "currentColor")}
      {section(.090, .076, .263, .332, "currentColor")}
    </g>
  </>;
}

type Cable = (typeof scenes)[number]["cables"][number];
function Connectors({ cables, id, rear }: { cables: Cable[]; id: string; rear: boolean }) {
  const facing = rear ? "rear" : "front";
  return <g className={styles.connectors} aria-hidden="true">
    {cables.map(({ from, to, a, b }) => [a, b].map(({ position, normal, scale }, i) => {
      if ((normal[2] < 0) !== rear) return null;
      const [x, y] = project(position);
      return <g key={to + i} data-cable-from={from} data-cable-to={to} data-rj45-plug={i ? "to" : "from"} data-plug-facing={facing}
        transform={`translate(${x} ${y}) scale(${scale})`}>
        <use data-plug-shell="" href={`#${id}-${facing}-plug`} />
        <use data-plug-boot="" href={`#${id}-${facing}-boot`} className={styles.bootColor} />
      </g>;
    }))}
  </g>;
}

export function ComputerTopology({ hrefs, selected }: Props) {
  const id = useId();
  const interactive = Boolean(hrefs && Object.keys(hrefs).length);
  return (
    <div data-topology-fallback="" className={styles.figure}>
      <svg width="0" height="0" aria-hidden="true" className={styles.definitions}>
        <defs>
          <PlugDefinitions id={id + "-front"} sign={1} />
          <PlugDefinitions id={id + "-rear"} sign={-1} />
          {devices.map(device => (
            <symbol key={device} id={`${id}-${device}`} viewBox={projections.get(device)!.viewBox}>
              <DevicePaths device={device} />
            </symbol>
          ))}
        </defs>
      </svg>
      {scenes.map(({ compact, width, height, devices: positions, cables, frames }) => (
        <svg key={width} className={compact ? styles.compact : styles.wide} viewBox={`0 0 ${width} ${height}`} style={frames}
          role={interactive ? "group" : "img"} aria-label="컴퓨터 네트워크 구성도">
          <desc>Router와 ASA를 거쳐 Switch에 연결됩니다. Switch는 Server, Linux, Windows Server에 연결됩니다.</desc>
          <g data-topology-camera="" className={styles.camera}>
            <g className={styles.cables} aria-hidden="true">
              {cables.map(({ from, to, d }) => (
                <g key={to} data-ethernet-run="" data-cable-from={from} data-cable-to={to}>
                  <path d={d} className={styles.cableEdge} />
                  <path d={d} data-cable-jacket="" className={styles.jacket} />
                  <path d={d} className={styles.cableGlint} />
                </g>
              ))}
            </g>
            <Connectors id={id} cables={cables} rear />
            {positions.map(([device, x, y, w, h]) => {
              const href = hrefs?.[device];
              const label = deviceLabels.get(device);
              const picture = <>
                <rect x={x - w / 2} y={y} width={w} height={h} fill="transparent" />
                <use href={`#${id}-${device}`} x={x - w / 2} y={y} width={w} height={h} />
              </>;
              return href ? (
                <a key={device} href={href} data-topology-device={device} aria-label={`${label} 글 보기`}
                  className={styles.device} aria-current={selected === device ? "true" : undefined}>{picture}</a>
              ) : (
                <g key={device} data-topology-device={device} className={styles.device} role="img" aria-label={label}>{picture}</g>
              );
            })}
            <Connectors id={id} cables={cables} rear={false} />
          </g>
        </svg>
      ))}
    </div>
  );
}
