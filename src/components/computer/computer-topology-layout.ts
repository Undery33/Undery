import { deviceDrawing, type Point3, type TopologyDevice } from "./computer-topology-devices";

type Position = readonly [across: number, down: number];
type Layout = Record<TopologyDevice, Position>;
export const openingAzimuth = .54;
export const openingElevation = .50;
const ca = Math.cos(openingAzimuth), sa = Math.sin(openingAzimuth);
const ce = Math.cos(openingElevation), se = Math.sin(openingElevation);

/** Place a point on the desk from its coordinates in the opening camera view. */
export function groundPosition([across, down]: Position): Point3 {
  const depth = down / se;
  return [across * ca + depth * sa, 0, -across * sa + depth * ca];
}

export function openingProjection([x, y, z]: Point3): [number, number] {
  return [x * ca - z * sa, se * (x * sa + z * ca) - y * ce];
}

const upstream = ["router", "asa", "switch"] as const;
const column = ["server", "linux", "windows-server"] as const;
const bottomRow = ["windows-server", "linux", "server"] as const;

function projectedBounds(device: TopologyDevice) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const part of deviceDrawing(device).parts) {
    const [w, h, d] = part.size;
    const [x, y] = openingProjection(part.position);
    const a = openingAzimuth - (part.yaw ?? 0);
    const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const halfX = (w * c + d * s) / 2;
    const halfY = (h * ce + (w * s + d * c) * se) / 2;
    left = Math.min(left, x - halfX); right = Math.max(right, x + halfX);
    top = Math.min(top, y - halfY); bottom = Math.max(bottom, y + halfY);
  }
  return { width: right - left, height: bottom - top, left, top, bottom, centerX: (left + right) / 2 };
}

const bounds = Object.fromEntries(
  [...upstream, ...column].map(id => [id, projectedBounds(id)]),
) as Record<TopologyDevice, ReturnType<typeof projectedBounds>>;

function desktopGrid(): Layout {
  const gap = .92, columnGap = 1.65, rowGap = .44;
  const rowWidth = upstream.reduce((sum, id) => sum + bounds[id].width, gap * (upstream.length - 1));
  const columnWidth = Math.max(...column.map(id => bounds[id].width));
  const columnHeight = column.reduce((sum, id) => sum + bounds[id].height, rowGap * (column.length - 1));
  let x = -(rowWidth + columnGap + columnWidth) / 2;
  const centerX = x + rowWidth + columnGap + columnWidth / 2;
  const layout = {} as Layout;
  for (const id of upstream) {
    layout[id] = [x - bounds[id].left, .32 - bounds[id].bottom];
    x += bounds[id].width + gap;
  }
  let y = -columnHeight / 2;
  for (const id of column) {
    layout[id] = [centerX - bounds[id].centerX, y - bounds[id].top];
    y += bounds[id].height + rowGap;
  }
  return layout;
}

function phoneGrid(): Layout {
  const gap = .36, rowGap = 1.06;
  const widths = upstream.map((id, i) => Math.max(bounds[id].width, bounds[bottomRow[i]].width));
  let x = -widths.reduce((sum, width) => sum + width, gap * (widths.length - 1)) / 2;
  const upperHeight = Math.max(...upstream.map(id => bounds[id].height));
  const lowerHeight = Math.max(...bottomRow.map(id => bounds[id].height));
  const upperBaseline = (upperHeight - lowerHeight - rowGap) / 2;
  const lowerBaseline = upperBaseline + rowGap + lowerHeight;
  const layout = {} as Layout;
  for (const [i, upper] of upstream.entries()) {
    const lower = bottomRow[i], centerX = x + widths[i] / 2;
    layout[upper] = [centerX - bounds[upper].centerX, upperBaseline - bounds[upper].bottom];
    layout[lower] = [centerX - bounds[lower].centerX, lowerBaseline - bounds[lower].bottom];
    x += widths[i] + gap;
  }
  return layout;
}

export const topologyLayouts = { wide: desktopGrid(), compact: phoneGrid() };
