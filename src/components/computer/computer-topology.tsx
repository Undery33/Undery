import { useId, type CSSProperties } from "react";
import { computerCategories } from "@/lib/computer-categories";
import { deviceDrawing, type Point3, type TopologyDevice } from "./computer-topology-devices";
import { frameDevice } from "./computer-topology-framing";
import { patchLinks } from "./computer-topology-ports";
import { bootTip, jacketRoute, type CableSpan } from "./computer-topology-routing";
import { groundPosition, openingAzimuth, openingProjection, topologyLayouts } from "./computer-topology-layout";
import styles from "./computer-topology.module.css";

type Point = [number, number];
type Props = { hrefs?: Partial<Record<TopologyDevice, string>>; selected?: string };

// Round only when serializing. Signed zero and subpixel trig differences must produce the same server and browser markup.
function svgNumber(value: number, precision = 3) {
  return Number(value.toFixed(precision));
}
function svgPoint([x, y]: Point, precision = 3) {
  return `${svgNumber(x, precision)} ${svgNumber(y, precision)}`;
}

// Orthographic projection from above the front-right corner, also used for card thumbnails.
function project(p: Point3): Point {
  const [across, down] = openingProjection(p);
  return [across * 52, down * 52];
}
function path(points: Point[], closed = true) {
  return points.map((p, i) => `${i ? "L" : "M"}${svgPoint(p, 2)}`).join("") + (closed ? "Z" : "");
}

function beveledPolygon(points: Point[], radius: number) {
  const toward = (a: Point, b: Point): string => {
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const fraction = Math.min(.24, radius / distance);
    return svgPoint([a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction], 2);
  };
  return points.map((p, i) => {
    const previous = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
    return `${i ? "L" : "M"}${toward(p, previous)}Q${svgPoint(p, 2)} ${toward(p, next)}`;
  }).join("") + "Z";
}

function projectDevice(device: TopologyDevice) {
  const drawing = deviceDrawing(device);
  const bounds: Point[] = [];
  const surfaces: { d: string; tone: string; outline?: boolean; stroke?: boolean }[] = [];
  for (const part of drawing.parts) {
    const [cx, cy, cz] = part.position;
    const [w, h, d] = part.size.map(value => value / 2);
    const yaw = part.yaw ?? 0, ca = Math.cos(yaw), sa = Math.sin(yaw);
    const point = (x: number, y: number, z: number) => project([cx + x * w * ca + z * d * sa, cy + y * h, cz - x * w * sa + z * d * ca]);
    const leftRight = Math.sin(openingAzimuth - yaw) >= 0 ? 1 : -1;
    const frontBack = Math.cos(openingAzimuth - yaw) >= 0 ? 1 : -1;
    if ((part.decoratedFace === "right" && leftRight < 0) || (part.decoratedFace === "left" && leftRight > 0)) continue;
    const visible = (x: number, y: number, z: number) => point(x * leftRight, y, z * frontBack);
    const surface = (points: Point[], tone: string) => {
      bounds.push(...points);
      surfaces.push({ d: part.bevel ? beveledPolygon(points, part.bevel * 38) : path(points), tone, outline: part.outlined });
    };
    const top = part.finish;
    const side = part.outlined ? "side" : top;
    if (part.shape === "dome") {
      const left = point(-.86, 0, .52), right = point(.86, 0, -.52);
      bounds.push(left, right, point(0, 2, 0));
      surfaces.push({ tone: top, outline: true, d: `M${svgPoint(left)}Q${svgPoint(point(-.4, 3.35, .2))} ${svgPoint(right)}Q${svgPoint(point(.47, -.1, 1.5))} ${svgPoint(left)}Z` });
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
      surface([visible(-1, -1, 1), visible(1, -1, 1), visible(1, -1, -1),
        visible(1, 1, -1), visible(-1, 1, -1), visible(-1, 1, 1)], top);
    } else {
      surface([visible(-1, -1, 1), visible(1, -1, 1), visible(1, 1, 1), visible(-1, 1, 1)], "front");
      surface([visible(1, -1, 1), visible(1, -1, -1), visible(1, 1, -1), visible(1, 1, 1)], side);
      surface([visible(-1, 1, 1), visible(1, 1, 1), visible(1, 1, -1), visible(-1, 1, -1)], top);
    }
  }
  for (const mark of drawing.marks) {
    surfaces.push({ d: path(mark.points.map(project), false), tone: mark.finish, stroke: true });
  }
  const xs = bounds.map(p => p[0]), ys = bounds.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys), padding = 4;
  const frame = { x: x - padding, y: y - padding, w: Math.max(...xs) - x + 2 * padding, h: Math.max(...ys) - y + 2 * padding };
  return { surfaces, frame, viewBox: `${svgPoint([frame.x, frame.y])} ${svgPoint([frame.w, frame.h])}` };
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
    frames[`--frame-${device}`] = `translate(${svgNumber(dx)}px, ${svgNumber(dy)}px) scale(${svgNumber(scale, 6)})`;
  }
  return frames as CSSProperties;
}
// The opening projection maps each physical circular bend onto an ellipse in the SVG.
function wirePath(spans: CableSpan[], screen: (p: Point3) => Point) {
  let d = "M" + svgPoint(screen(spans[0].start));
  for (const span of spans) {
    const end = svgPoint(screen(span.end));
    if (span.kind === "line") { d += "L" + end; continue; }
    const [cx, cy] = screen(span.center), [sx, sy] = screen(span.start);
    const [tx, ty] = screen(span.center.map((v, i) => v + span.tangent[i] * span.radius) as Point3);
    const ax = sx - cx, ay = sy - cy, bx = tx - cx, by = ty - cy;
    const xx = ax * ax + bx * bx, yy = ay * ay + by * by, xyProduct = ax * ay + bx * by;
    const difference = Math.hypot(xx - yy, 2 * xyProduct);
    const major = Math.sqrt((xx + yy + difference) / 2), minor = Math.sqrt(Math.max(0, (xx + yy - difference) / 2));
    const rotation = Math.atan2(2 * xyProduct, xx - yy) * 90 / Math.PI;
    d += minor < .001 ? "L" + end : `A${svgPoint([major, minor])} ${svgNumber(rotation)} 0 ${ax * by - ay * bx > 0 ? 1 : 0} ${end}`;
  }
  return d;
}

function makeScene(compact: boolean) {
  const width = compact ? 375 : 1040, height = compact ? 292 : 330;
  const layout = topologyLayouts[compact ? "compact" : "wide"];
  const boxes = devices.map(device => {
    const [x, y] = project(groundPosition(layout[device]));
    const { frame } = projections.get(device)!;
    return { device, left: x + frame.x, top: y + frame.y, w: frame.w, h: frame.h };
  });
  function socket(device: TopologyDevice, local: Point3, normal: Point3) {
    const [x, , z] = groundPosition(layout[device]);
    const position: Point3 = [x + local[0], local[1], z + local[2]];
    return { position, normal, tip: bootTip(position, normal) };
  }
  const routes = patchLinks.map(({ from, to, start, end, startNormal, endNormal }) => {
    const a = socket(from, start, startNormal), b = socket(to, end, endNormal);
    return { from, to, a, b, spans: jacketRoute(to, a.tip, b.tip, startNormal, endNormal, compact) };
  });
  const cablePoints = routes.flatMap(route => route.spans.flatMap(span => [project(span.start), project(span.end)]));
  const left = Math.min(...boxes.map(b => b.left), ...cablePoints.map(p => p[0]));
  const right = Math.max(...boxes.map(b => b.left + b.w), ...cablePoints.map(p => p[0]));
  const top = Math.min(...boxes.map(b => b.top), ...cablePoints.map(p => p[1]));
  const bottom = Math.max(...boxes.map(b => b.top + b.h), ...cablePoints.map(p => p[1]));
  const scale = Math.min((width - 12) / (right - left), (height - 12) / (bottom - top));
  const fit = ([x, y]: Point): Point => [width / 2 + (x - (left + right) / 2) * scale, height / 2 + (y - (top + bottom) / 2) * scale];
  const positions: Placement[] = boxes.map(b => {
    const [cx, y] = fit([b.left + b.w / 2, b.top]);
    return [b.device, cx, y, b.w * scale, b.h * scale];
  });
  const cables = routes.map(({ from, to, a, b, spans }) => {
    const place = (plug: typeof a) => ({ point: fit(project(plug.position)), normal: plug.normal, scale });
    return { from, to, a: place(a), b: place(b), d: wirePath(spans, p => fit(project(p))) };
  });
  return { width, height, compact, devices: positions, cables, frames: cameraFrames({ width, height, compact, devices: positions }) };
}
const scenes = [makeScene(false), makeScene(true)];

// Face, side and top of a molded section, sharing the device projection so the plug meets the jack.
function PlugDefinitions({ id, normal }: { id: string; normal: Point3 }) {
  const yaw = Math.atan2(normal[0], normal[2]), ca = Math.cos(yaw), sa = Math.sin(yaw);
  const projection = ([x, y, z]: Point3): Point => project([x * ca + z * sa, y, -x * sa + z * ca]);
  const face = (points: Point3[]) => path(points.map(projection));
  function section(width: number, height: number, a: number, b: number, tone: string) {
    const x = width / 2 * (Math.sin(openingAzimuth - yaw) >= 0 ? 1 : -1), y = height / 2;
    const [back, front] = Math.cos(openingAzimuth - yaw) >= 0 ? [a, b] : [b, a];
    return <g fill={tone}>
      <path d={face([[x,-y,back], [x,-y,front], [x,y,front], [x,y,back]])} />
      <path d={face([[-x,-y,front], [x,-y,front], [x,y,front], [-x,y,front]])} />
      <path d={face([[-x,y,back], [x,y,back], [x,y,front], [-x,y,front]])} />
    </g>;
  }
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
    {cables.map(({ from, to, a, b }) => [a, b].map(({ point: [x, y], normal, scale }, i) => {
      if ((normal[0] * Math.sin(openingAzimuth) + normal[2] * Math.cos(openingAzimuth) < 0) !== rear) return null;
      const plugId = `${id}-${to}-${i}`;
      return <g key={to + i} data-cable-from={from} data-cable-to={to} data-rj45-plug={i ? "to" : "from"} data-plug-facing={facing}
        transform={`translate(${svgPoint([x, y])}) scale(${svgNumber(scale, 6)})`}>
        <use data-plug-shell="" href={`#${plugId}-plug`} />
        <use data-plug-boot="" href={`#${plugId}-boot`} className={styles.bootColor} />
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
          {patchLinks.flatMap(({ to, startNormal, endNormal }) => [startNormal, endNormal].map((normal, i) =>
            <PlugDefinitions key={to + i} id={`${id}-${to}-${i}`} normal={normal} />))}

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
              const bounds = { x: svgNumber(x - w / 2), y: svgNumber(y), width: svgNumber(w), height: svgNumber(h) };
              const picture = <>
                <rect {...bounds} fill="transparent" />
                <use href={`#${id}-${device}`} {...bounds} />
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
