import type { CSSProperties, ReactNode } from "react";
import styles from "./computer-figure.module.css";

type Field = "server" | "network" | "ai";
type ActiveField = "overview" | Field;
type Point = readonly [number, number];

/** A shared projection keeps every board, trace, and component on the same plane. */
function project(u: number, v: number, base: number, z = 0): Point {
  return [360 + (u - v) * 0.86, base + (u + v) * 0.27 - z];
}

function points(vertices: readonly Point[]): string {
  return vertices.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function route(base: number, vertices: readonly Point[], z = 1): string {
  return vertices
    .map(([u, v], index) => {
      const [x, y] = project(u, v, base, z);
      return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function Box({
  u,
  v,
  w,
  d,
  h,
  base,
  z = 0,
  chip = false,
}: {
  u: number;
  v: number;
  w: number;
  d: number;
  h: number;
  base: number;
  z?: number;
  chip?: boolean;
}) {
  const p = (x: number, y: number, height: number) => project(x, y, base, height);
  return (
    <g className={chip ? styles.chip : styles.device}>
      <polygon
        className={styles.sideLeft}
        points={points([p(u, v + d, z + h), p(u + w, v + d, z + h), p(u + w, v + d, z), p(u, v + d, z)])}
      />
      <polygon
        className={styles.sideRight}
        points={points([p(u + w, v, z + h), p(u + w, v + d, z + h), p(u + w, v + d, z), p(u + w, v, z)])}
      />
      <polygon
        className={styles.topFace}
        points={points([p(u, v, z + h), p(u + w, v, z + h), p(u + w, v + d, z + h), p(u, v + d, z + h)])}
      />
    </g>
  );
}

function Plane({ u, v, base, z = 0, children }: { u: number; v: number; base: number; z?: number; children: ReactNode }) {
  const [x, y] = project(u, v, base, z);
  return <g transform={`matrix(.86 .27 -.86 .27 ${x} ${y})`}>{children}</g>;
}

function Face({ u, v, base, z = 0, children }: { u: number; v: number; base: number; z?: number; children: ReactNode }) {
  const [x, y] = project(u, v, base, z);
  return <g transform={`matrix(.86 .27 0 1 ${x} ${y})`}>{children}</g>;
}

function Pillar({ u, v, base }: { u: number; v: number; base: number }) {
  const [x, y] = project(u, v, base);
  return (
    <g className={styles.pillar}>
      <path d={`M${x - 3.6} ${y - 186}v184a3.6 1.8 0 0 0 7.2 0v-184`} />
      <ellipse cx={x} cy={y - 186} rx="3.6" ry="1.8" />
      <path className={styles.pillarGlint} d={`M${x - 1.1} ${y - 182}v175`} />
    </g>
  );
}

function Board({ base, label, half = 150, pillars = true }: { base: number; label: string; half?: number; pillars?: boolean }) {
  const p = (u: number, v: number, z = 0) => project(u, v, base, z);
  const rim = half - 11;
  return (
    <g>
      {pillars && [-1, 1].flatMap((a) => [-1, 1].map((b) => <Pillar key={`${a}-${b}`} u={a * rim} v={b * rim} base={base} />))}
      <polygon className={styles.boardShadow} points={points([p(-half, -half, -9), p(half, -half, -9), p(half, half, -9), p(-half, half, -9)])} />
      <polygon className={styles.boardLeft} points={points([p(-half, half), p(half, half), p(half, half, -12), p(-half, half, -12)])} />
      <polygon className={styles.boardRight} points={points([p(half, -half), p(half, half), p(half, half, -12), p(half, -half, -12)])} />
      <polygon className={styles.boardTop} points={points([p(-half, -half), p(half, -half), p(half, half), p(-half, half)])} />
      <polygon className={styles.boardInset} points={points([p(-rim, -rim, 0.5), p(rim, -rim, 0.5), p(rim, rim, 0.5), p(-rim, rim, 0.5)])} />
      {[-1, 1].flatMap((a) => [-1, 1].map((b) => {
        const [x, y] = p(a * (half - 8), b * (half - 8), 1);
        return <g key={`bolt-${a}-${b}`} className={styles.bolt}><ellipse cx={x} cy={y} rx="4.4" ry="2.1" /><path d={`M${x - 2} ${y - .6}l4 1.2`} /></g>;
      }))}
      {Array.from({ length: 19 }, (_, index) => {
        const u = -half + 18 + index * (half * 2 - 36) / 18;
        return <path key={`tick-${index}`} className={styles.ruler} d={route(base, [[u, -half + 6], [u, -half + (index % 3 ? 10 : 14)]])} />;
      })}
      <Face u={-half + 18} v={half} base={base} z={-8}>
        <text className={styles.boardLabel}>{label}</text>
      </Face>
      <path className={styles.boardEdge} d={route(base, [[-half, half], [half, half], [half, -half]], -1)} />
    </g>
  );
}

function Trace({ base, vertices, signal = false }: { base: number; vertices: readonly Point[]; signal?: boolean }) {
  return <path className={signal ? styles.signal : styles.trace} d={route(base, vertices)} />;
}

function Contact({ base, u, v, signal = false, z = 2 }: { base: number; u: number; v: number; signal?: boolean; z?: number }) {
  const [x, y] = project(u, v, base, z);
  return <ellipse className={signal ? styles.contactActive : styles.contact} cx={x} cy={y} rx="3.6" ry="1.9" />;
}

function Network({ base }: { base: number }) {
  return (
    <g>
      <Trace base={base} signal vertices={[[-111, -62], [-111, 1], [-48, 1]]} />
      <Trace base={base} vertices={[[-101, -62], [-101, -11], [-48, -11]]} />
      <Trace base={base} signal vertices={[[98, -90], [128, -90], [128, 12], [97, 12]]} />
      <Trace base={base} vertices={[[98, -77], [117, -77], [117, -2], [97, -2]]} />
      <Trace base={base} signal vertices={[[103, 105], [103, 80], [32, 80], [32, 34]]} />
      <Trace base={base} vertices={[[91, 105], [91, 92], [18, 92], [18, 34]]} />
      <Trace base={base} vertices={[[-125, 112], [-76, 112], [-76, 65], [-31, 65], [-31, 34]]} />
      <Box u={-128} v={-112} w={42} d={45} h={14} base={base} chip />
      <Box u={70} v={-113} w={42} d={43} h={14} base={base} chip />
      <Box u={77} v={95} w={43} d={31} h={12} base={base} chip />
      <Box u={-48} v={-30} w={145} d={64} h={27} base={base} />
      <Plane u={-34} v={-19} base={base} z={28}>
        <text className={styles.deviceLabel} y="5">NETWORK SWITCH</text>
        {Array.from({ length: 12 }, (_, i) => <path className={styles.vent} key={i} d={`M${i * 9} 16v22`} />)}
      </Plane>
      <Face u={-38} v={34.3} base={base} z={20}>
        {Array.from({ length: 8 }, (_, i) => <g key={i} transform={`translate(${i * 15.5} 0)`}><rect className={styles.port} width="10.5" height="7.5" rx=".7" /><path className={styles.portPins} d="M2 1v2m2-2v2m2-2v2m2-2v2" /><circle className={i === 2 || i === 6 ? styles.led : styles.ledOff} cx="5" cy="12" r="1.3" /></g>)}
      </Face>
      <Plane u={-121} v={-104} base={base} z={15}><rect className={styles.circuitDetail} width="27" height="27" rx="3" /><path className={styles.trace} d="M6 8h14v13H6zM10 4v23m6-23v23M2 12h24M2 18h24" /></Plane>
      <Plane u={78} v={-104} base={base} z={15}><path className={styles.trace} d="M0 4h26M0 11h26M0 18h26M0 25h26" /></Plane>
      <Plane u={83} v={102} base={base} z={13}><text className={styles.deviceLabel} y="8">I / O</text></Plane>
      <Contact base={base} u={-111} v={1} signal />
      <Contact base={base} u={128} v={12} signal />
      <Contact base={base} u={32} v={80} signal />
    </g>
  );
}

function Server({ base }: { base: number }) {
  return (
    <g>
      <Trace base={base} vertices={[[-130, 103], [-130, -100], [126, -100], [126, 103]]} />
      <Trace base={base} signal vertices={[[-120, 111], [-120, 123], [115, 123], [115, 85]]} />
      {[-113, -35, 43].map((u, index) => (
        <g key={u}>
          <Box u={u} v={-47} w={63} d={118} h={90} base={base} />
          <Plane u={u + 31.5} v={-13} base={base} z={91}>
            <circle className={styles.fanRing} r="19" /><circle className={styles.fanRing} r="16" /><circle className={styles.fanHub} r="4.6" />
            {[0, 60, 120, 180, 240, 300].map((rotation) => <path key={rotation} className={styles.fanBlade} transform={`rotate(${rotation})`} d="M3-3Q6-14 13-10Q18-4 5 0Z" />)}
          </Plane>
          <Plane u={u + 11} v={23} base={base} z={91}>
            {Array.from({ length: 7 }, (_, i) => <path key={i} className={styles.vent} d={`M0 ${i * 4}h40`} />)}
          </Plane>
          <Face u={u + 5} v={71.4} base={base} z={84}>
            <rect className={styles.bay} width="53" height="73" rx="1.8" />
            {[0, 1, 2, 3, 4, 5].map((slot) => <g key={slot} transform={`translate(5 ${6 + slot * 11})`}><rect className={styles.drive} width="33" height="5" rx=".7" /><path className={styles.driveHandle} d="M3 1v3h26V1" /><circle className={slot === index ? styles.led : styles.ledOff} cx="40" cy="2.5" r="1.3" /></g>)}
          </Face>
          <Trace base={base} vertices={[[u + 25, 71], [u + 25, 99], [115, 99]]} />
        </g>
      ))}
      <Box u={-106} v={104} w={49} d={21} h={6} base={base} chip />
      <Plane u={-101} v={109} base={base} z={7}><text className={styles.deviceLabel} y="8">POWER</text></Plane>
      <Contact base={base} u={115} v={123} signal />
    </g>
  );
}

function Ai({ base }: { base: number }) {
  const terminals: readonly Point[] = [[-100, -77], [82, -87], [-94, 82], [87, 84]];
  return (
    <g>
      {terminals.map(([u, v], index) => <g key={index}><Trace base={base} vertices={[[u, v], [u, v > 0 ? 54 : -54], [u > 0 ? 34 : -34, v > 0 ? 54 : -54], [u > 0 ? 34 : -34, v > 0 ? 15 : -15]]} signal={index === 0 || index === 3} /><Box u={u - 13} v={v - 12} w={26} d={24} h={8} base={base} chip /><Plane u={u - 8} v={v - 7} base={base} z={9}><rect className={styles.circuitDetail} width="16" height="14" rx="1" /></Plane></g>)}
      {[-1, 1].flatMap((side) => Array.from({ length: 5 }, (_, i) => <path className={styles.trace} key={`${side}-${i}`} d={route(base, [[side * (42 + i * 6), -26], [side * (42 + i * 6), -61 - i * 6], [side * 113, -61 - i * 6]])} />))}
      <Trace base={base} vertices={[[-118, 115], [-118, -112], [116, -112], [116, 115], [-118, 115]]} />
      <Box u={-38} v={-38} w={76} d={76} h={20} base={base} chip />
      <Plane u={-28} v={-28} base={base} z={21}>
        <rect className={styles.processorInset} x="-3" y="-3" width="62" height="62" rx="4" />
        {Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, col) => <rect key={`${row}-${col}`} className={row === col ? styles.computeActive : styles.computeCell} x={col * 14.5} y={row * 14.5} width="11.5" height="11.5" rx="1" />))}
      </Plane>
      {Array.from({ length: 7 }, (_, i) => <g key={i}><path className={styles.pin} d={route(base, [[-31 + i * 10.3, -46], [-31 + i * 10.3, -38]], 9)} /><path className={styles.pin} d={route(base, [[-31 + i * 10.3, 38], [-31 + i * 10.3, 46]], 9)} /><path className={styles.pin} d={route(base, [[-46, -31 + i * 10.3], [-38, -31 + i * 10.3]], 9)} /><path className={styles.pin} d={route(base, [[38, -31 + i * 10.3], [46, -31 + i * 10.3]], 9)} /></g>)}
      <Plane u={-47} v={79} base={base} z={2}><text className={styles.aiLabel}>NEURAL ENGINE</text><path className={styles.signal} d="M0 9h93" /></Plane>
      <Contact base={base} u={-100} v={-54} signal />
      <Contact base={base} u={87} v={54} signal />
    </g>
  );
}

const layers = [
  { field: "network", base: 602, label: "02  /  NETWORK", Component: Network },
  { field: "server", base: 404, label: "01  /  SERVER", Component: Server },
  { field: "ai", base: 206, label: "03  /  ARTIFICIAL INTELLIGENCE", Component: Ai },
] as const;

export function ComputerFigure({ active = "overview" }: { active?: ActiveField }) {
  const selectedIndex = layers.findIndex((layer) => layer.field === active);
  return (
    <svg
      className={styles.figure}
      viewBox="0 0 720 760"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      data-active={active}
    >
      <ellipse className={styles.groundShadow} cx="360" cy="704" rx="202" ry="23" />
      <path className={styles.groundLine} d="m95 663 265 85 265-85" />
      <path className={styles.groundLine} d="m117 670 243 78 243-78" />
      {layers.map(({ field, base, label, Component }, index) => {
        const offset = selectedIndex < 0 ? 0 : index > selectedIndex ? -24 : index < selectedIndex ? 24 : 0;
        const layerStyle = { "--layer-shift": `${offset}px` } as CSSProperties;
        return (
          <g key={field} className={styles.layer} data-selected={active === field} style={layerStyle}>
            <Board base={base} label={label} half={field === "ai" ? 138 : 150} pillars={field !== "ai"} />
            <Component base={base} />
          </g>
        );
      })}
    </svg>
  );
}
