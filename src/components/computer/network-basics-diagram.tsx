import { useId } from "react";
import styles from "./network-basics-diagram.module.css";

type Point = [number, number, number];

// Orthographic view from above the front-right corner of the two networks.
function project([x, y, z]: Point) {
  return [(.858 * x - .514 * z) * 100, (.247 * x - .878 * y + .411 * z) * 100];
}
function point(p: Point) { return project(p).map(n => n.toFixed(2)).join(" "); }
function face(...points: Point[]) { return "M" + points.map(point).join("L") + "Z"; }
function place(p: Point) { return `translate(${point(p)})`; }

function Case({ center, size, top }: { center: Point; size: Point; top?: string }) {
  const [x, y, z] = center, [w, h, d] = size.map(n => n / 2);
  return <g strokeLinejoin="round">
    <path className={styles.front} d={face([x-w,y-h,z+d], [x+w,y-h,z+d], [x+w,y+h,z+d], [x-w,y+h,z+d])} />
    <path className={styles.side} d={face([x+w,y-h,z+d], [x+w,y-h,z-d], [x+w,y+h,z-d], [x+w,y+h,z+d])} />
    <path className={top ?? styles.top} d={face([x-w,y+h,z-d], [x+w,y+h,z-d], [x+w,y+h,z+d], [x-w,y+h,z+d])} />
  </g>;
}

function Platform() {
  return <>
    <Case center={[0,.065,0]} size={[2.34,.10,2.04]} />
    <Case center={[0,.155,0]} size={[2.42,.10,2.14]} top={styles.deck} />
    {[-1.08,1.08].flatMap(x => [-.94,.94].map(z =>
      <ellipse key={x + ":" + z} transform={place([x,.212,z])} rx="2.4" ry="1.24" className={styles.bolt} />))}
  </>;
}

function Workstation() {
  return <>
    <Case center={[0,.045,0]} size={[.61,.085,.37]} />
    <Case center={[0,.22,-.08]} size={[.16,.37,.10]} />
    <Case center={[0,.69,-.11]} size={[1.21,.72,.13]} />
    <path className={styles.display} d={face([-.55,.99,-.04], [.55,.99,-.04], [.55,.408,-.04], [-.55,.408,-.04])} />
    <path className={styles.reflection} d={face([-.55,.99,-.039], [.12,.99,-.039], [-.32,.408,-.039], [-.55,.408,-.039])} />
    <circle transform={place([.50,.37,-.035])} r="1.4" className={styles.led} />
    <Case center={[-.09,.04,.47]} size={[.95,.06,.28]} />
    {[0,1,2].map(row => <g key={row} className={styles.keys}>
      {Array.from({ length: 10 }, (_, col) => {
        const x = -.52 + col * .086, z = .364 + row * .075;
        return <path key={col} d={face([x,.076,z], [x+.069,.076,z], [x+.069,.076,z+.054], [x,.076,z+.054])} />;
      })}
    </g>)}
    <ellipse transform={place([.54,.074,.45])} rx="5.1" ry="7.7" className={styles.side} />
  </>;
}

function Gateway() {
  return <g data-basics-gateway="">
    <Case center={[0,.105,0]} size={[1.30,.12,.83]} />
    <Case center={[0,.32,0]} size={[1.23,.36,.78]} />
    <Case center={[0,.53,0]} size={[1.25,.07,.80]} />
    {[-.33,.33].map(x => <path key={x} className={styles.display}
      d={face([x-.085,.306,.40], [x+.085,.306,.40], [x+.085,.183,.40], [x-.085,.183,.40])} />)}
    <path className={styles.etch} d={`M${point([-.33,.57,-.08])}L${point([.21,.57,-.08])}m-8 -7 8 7-9 3 M${point([.32,.57,.10])}L${point([-.22,.57,.10])}m8 7-8-7 9-3`} />
    <circle transform={place([.47,.31,.40])} r="2.2" className={styles.led} />
  </g>;
}

function Cable({ from, c1, c2, to }: { from: Point; c1: Point; c2: Point; to: Point }) {
  const d = `M${point(from)}C${point(c1)} ${point(c2)} ${point(to)}`;
  return <g data-basics-link="" fill="none" strokeLinecap="round">
    <path d={d} className={styles.wireEdge} /><path d={d} className={styles.wire} />
    {[from,to].map((p,i) => <g key={i} transform={place(p)}>
      <Case center={[0,0,.05]} size={[.11,.08,.10]} />
    </g>)}
  </g>;
}

const gate: Point = [0,.94,.31];
const local = (p: Point) => point([p[0]-gate[0], p[1]-gate[1], p[2]-gate[2]]);
const route = `M${local([-1.71,1.106,-.019])}Q${local([-.93,1.08,.75])} 0 0 Q${local([.93,1.08,.75])} ${local([1.71,1.106,-.019])}`;

export function NetworkBasicsDiagram() {
  const id = useId();
  return <svg className={styles.diagram} data-basics-diagram="" viewBox="-373 -216 746 369" role="img"
    aria-label="두 서브넷의 컴퓨터가 중앙 게이트웨이에 연결되어 있습니다. 노란 봉투는 한 컴퓨터에서 게이트웨이를 거쳐 다른 서브넷으로 전달되는 패킷입니다.">
    <defs>
      <g id={id+"-platform"}><Platform /></g>
      <g id={id+"-computer"}><Workstation /></g>
    </defs>
    {[-1,1].map(dir => <g key={dir} data-basics-subnet={dir < 0 ? "left" : "right"} transform={place([dir*2.25,0,0])}>
      <use href={`#${id}-platform`} />
    </g>)}
    <Gateway />
    {[-1,1].map(dir => <g key={dir} data-basics-host={dir < 0 ? "left" : "right"} transform={place([dir*2.25,.22,-.18])}>
      <use href={`#${id}-computer`} />
    </g>)}
    {[-1,1].map(dir => <Cable key={dir} from={[dir*1.71,.566,-.179]} c1={[dir*1.81,.15,.89]}
      c2={[dir*.71,.15,1.40]} to={[dir*.33,.244,.439]} />)}
    <g transform={place(gate)}>
      <g data-basics-packet="" className={styles.packet} style={{ offsetPath: `path("${route}")` }}>
        <g transform="scale(1.65)">
          <path className={styles.packetRim} d="M-18-13h34l4 4v20l-4 2h-34Z" />
          <path className={styles.packetFace} d="M-18-11h34v23h-34z" />
          <path className={styles.fold} d="m-17-10 16 13 16-13m-32 21 11-11m21 11L4 0" />
        </g>
      </g>
    </g>
  </svg>;
}
