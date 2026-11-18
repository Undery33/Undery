import { useId } from "react";
import { computerCategories } from "@/lib/computer-categories";
import { deviceDrawing, type Point3, type TopologyDevice } from "./computer-topology-devices";
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
      surfaces.push({ d: path(points), tone, outline: part.outlined });
    };
    const top = part.finish;
    const side = part.outlined ? "side" : top;
    if (part.shape === "drum") {
      const topRing = Array.from({ length: 48 }, (_, i) => {
        const angle = (i / 48) * Math.PI * 2;
        return point(Math.cos(angle), 1, Math.sin(angle));
      });
      const order = [...topRing.keys()].sort((a, b) => topRing[a][0] - topRing[b][0]);
      const left = order[0], right = order[order.length - 1];
      const front = Array.from({ length: (left - right + 48) % 48 + 1 }, (_, i) => topRing[(right + i) % 48]);
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
  return { surfaces, viewBox: [x - padding, y - padding, Math.max(...xs) - x + 2 * padding, Math.max(...ys) - y + 2 * padding].join(" ") };
}

const devices = computerCategories.map(category => category.id);
const deviceLabels = new Map(computerCategories.map(category => [category.id, category.label]));
const projections = new Map(devices.map(device => [device, projectDevice(device)]));

function DevicePaths({ device }: { device: TopologyDevice }) {
  return projections.get(device)!.surfaces.map(({ d, tone, stroke, outline }, i) => (
    <path key={i} d={d} fill={stroke ? "none" : `var(--device-${tone})`}
      stroke={stroke ? `var(--device-${tone})` : outline ? "var(--device-edge)" : "none"}
      strokeWidth={stroke ? 1.9 : 1.05} strokeLinejoin="round" strokeLinecap="round" />
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
const layouts: { compact: boolean; viewBox: string; devices: Placement[]; cables: string[] }[] = [
  {
    compact: false, viewBox: "0 0 1040 330",
    devices: [["router", 79, 190, 135, 78], ["asa", 263, 111, 144, 82], ["switch", 510, 115, 162, 82],
      ["server", 767, 0, 88, 123], ["linux", 740, 199, 140, 103], ["windows-server", 957, 107, 142, 104]],
    cables: ["M101 221 142 194 223 162", "M298 154 343 149 456 164", "M543 143 621 105 745 84",
      "M556 160 653 150 791 165 942 156", "M550 176 604 198 644 231 732 252"],
  },
  {
    compact: true, viewBox: "0 0 375 292",
    devices: [["router", 54, 10, 87, 58], ["asa", 188, 12, 93, 53], ["switch", 315, 61, 100, 58],
      ["server", 53, 173, 59, 76], ["linux", 180, 177, 95, 72], ["windows-server", 310, 177, 97, 72]],
    cables: ["M84 36 110 28 157 35", "M219 40 252 54 282 80", "M302 108 268 146 117 146 59 195",
      "M310 109 281 157 229 157 192 192", "M323 110 333 151 315 190"],
  },
];

export function ComputerTopology({ hrefs, selected }: Props) {
  const id = useId();
  const interactive = Boolean(hrefs && Object.keys(hrefs).length);
  return (
    <div data-topology-fallback="" className={styles.figure}>
      <svg width="0" height="0" aria-hidden="true" className={styles.definitions}>
        <defs>
          {devices.map(device => (
            <symbol key={device} id={`${id}-${device}`} viewBox={projections.get(device)!.viewBox}>
              <DevicePaths device={device} />
            </symbol>
          ))}
        </defs>
      </svg>
      {layouts.map(({ compact, viewBox, devices: positions, cables }) => (
        <svg key={viewBox} className={compact ? styles.compact : styles.wide} viewBox={viewBox}
          role={interactive ? "group" : "img"} aria-label="컴퓨터 네트워크 구성도">
          <desc>Router와 ASA를 거쳐 Switch에 연결됩니다. Switch는 Server, Linux, Windows Server에 연결됩니다.</desc>
          <g className={styles.cables} aria-hidden="true">{cables.map(d => <path key={d} d={d} />)}</g>
          {positions.map(([device, x, y, w, h]) => {
            const href = hrefs?.[device];
            const label = deviceLabels.get(device);
            const labelY = y + h + (compact ? 15 : 20);
            const picture = <>
              <rect x={x - w / 2} y={y} width={w} height={labelY - y + 6} fill="transparent" />
              <use href={`#${id}-${device}`} x={x - w / 2} y={y} width={w} height={h} />
              <text x={x} y={labelY} textAnchor="middle">{label}</text>
            </>;
            return href ? (
              <a key={device} href={href} data-topology-device={device} aria-label={`${label} 글 보기`}
                className={styles.device} aria-current={selected === device ? "true" : undefined}>{picture}</a>
            ) : (
              <g key={device} data-topology-device={device} className={styles.device}>{picture}</g>
            );
          })}
        </svg>
      ))}
    </div>
  );
}
