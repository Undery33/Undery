import * as THREE from "three";
import type { TopologyDevice } from "./computer-topology-devices";
import { createTopologyDevice } from "./computer-topology-models";

export type TopologyView = {
  orbit: (horizontal: number, vertical: number) => void;
  reset: () => void;
  setLinux: (open: boolean, animate: boolean, complete: () => void) => void;
  dispose: () => void;
};
type Position = [number, number];
const wide: Record<TopologyDevice, Position> = {
  router: [-6.4, 1.25], asa: [-3.65, .13], switch: [-.24, .14],
  server: [3.42, -.88], linux: [3.04, 1.91], "windows-server": [6.15, .66],
};
const compact: Record<TopologyDevice, Position> = {
  router: [-2.9, -1.6], asa: [0, -1.55], switch: [2.82, -.63],
  server: [-2.8, 2.62], linux: [.07, 2.65], "windows-server": [2.79, 2.65],
};
const connections: [TopologyDevice, TopologyDevice][] = [
  ["router", "asa"], ["asa", "switch"], ["switch", "server"], ["switch", "linux"], ["switch", "windows-server"],
];
const startAzimuth = .54;
const startElevation = .50;
const ids = Object.keys(wide) as TopologyDevice[];

// Place the equipment on one ground plane from its intended coordinates in the opening view.
function groundPoint([across, down]: Position) {
  const depth = down / Math.sin(startElevation);
  return new THREE.Vector3(
    across * Math.cos(startAzimuth) + depth * Math.sin(startAzimuth), 0,
    -across * Math.sin(startAzimuth) + depth * Math.cos(startAzimuth),
  );
}

function disposeObjects(parent: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  parent.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  materials.forEach(material => material.dispose());
  parent.clear();
}

export function createTopologyView(host: HTMLElement, labels: HTMLElement, glass: HTMLElement, initialLinux: boolean, onLost: () => void): TopologyView | null {
  const canvas = document.createElement("canvas");
  const options: WebGLContextAttributes = { alpha: true, antialias: true, powerPreference: "low-power" };
  const context = canvas.getContext("webgl2", options);
  if (!context) return null;
  const renderer = new THREE.WebGLRenderer({ canvas, context, ...options });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  canvas.dataset.topologyCanvas = "";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 120);
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-5, 11, 8);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0xb5bbc0, 1.65));
  const equipment = new THREE.Group();
  scene.add(equipment);
  const nodes = new Map<TopologyDevice, { model: THREE.Group; corners: THREE.Vector3[]; link: HTMLAnchorElement }>();
  const cableMaterial = new THREE.MeshBasicMaterial();
  const peripheralMaterials = new Set<THREE.Material>();
  const cables = connections.map(() => {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 1, 6), cableMaterial);
    scene.add(cable);
    return cable;
  });
  let azimuth = startAzimuth;
  let elevation = startElevation;
  let width = 0, height = 0;
  let disposed = false;
  let frame = 0;
  let linuxProgress = initialLinux ? 1 : 0;
  let flight: { from: number; to: number; start: number; duration: number; complete: () => void } | undefined;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const temporary = new THREE.Vector3();

  function draw() {
    frame = 0;
    if (disposed || !width || !height) return;
    let completed: (() => void) | undefined;
    if (flight) {
      const time = motion.matches || document.hidden ? 1 : Math.min(1, (performance.now() - flight.start) / flight.duration);
      linuxProgress = THREE.MathUtils.lerp(flight.from, flight.to, time * time * (3 - 2 * time));
      if (time >= 1) { completed = flight.complete; flight = undefined; }
    }
    const wideWeight = 1 - linuxProgress;
    const yaw = Math.atan2(Math.sin(azimuth), Math.cos(azimuth)) * wideWeight;
    const finalTilt = .055;
    const tilt = THREE.MathUtils.lerp(finalTilt, elevation, wideWeight);
    const screenScale = glass.offsetHeight / (.72 * Math.cos(finalTilt));
    const linuxModel = nodes.get("linux")!.model;
    // The front view uses a taller monitor on narrow screens so the case and its readable display both fit.
    const screenWidth = Math.min(1, glass.offsetWidth / (1.48 * screenScale));
    linuxModel.scale.x = THREE.MathUtils.lerp(1, screenWidth, linuxProgress);
    const peripheralOpacity = 1 - THREE.MathUtils.smoothstep(linuxProgress, .16, .68);
    for (const material of peripheralMaterials) {
      material.opacity = peripheralOpacity;
      material.transparent = peripheralOpacity < 1;
      material.depthWrite = peripheralOpacity === 1;
    }
    for (const [id, { model }] of nodes) model.visible = id === "linux" || peripheralOpacity > 0;
    for (const cable of cables) cable.visible = peripheralOpacity > 0;
    const visible = [...nodes].filter(([, { model }]) => model.visible).map(([id]) => id).join(" ");
    if (canvas.dataset.visibleDevices !== visible) {
      canvas.dataset.visibleDevices = visible;
      canvas.dataset.visibleCables = String(cables.filter(cable => cable.visible).length);
    }
    // The Linux model's glass is 1.48 × .72 and faces local +Z. Approach its actual center.
    const glassCenter = linuxModel.position.clone().add(new THREE.Vector3(0, .90, -.033));
    const target = glassCenter.clone().multiplyScalar(linuxProgress);
    const distance = THREE.MathUtils.lerp(34, 4.5, linuxProgress);
    camera.position.set(Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt)).multiplyScalar(distance).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const bounds = new THREE.Box2();
    const point = new THREE.Vector2();
    const anchors = [];
    for (const { model, corners, link } of nodes.values()) {
      const box = new THREE.Box2();
      for (const corner of corners) {
        temporary.copy(corner).multiply(model.scale).add(model.position).applyMatrix4(camera.matrixWorldInverse);
        box.expandByPoint(point.set(temporary.x, temporary.y));
      }
      bounds.union(box);
      anchors.push({ link, x: (box.min.x + box.max.x) / 2, y: box.min.y });
    }
    const marginX = width < 480 ? 23 : width * .045;
    const marginTop = width < 650 ? 38 : 16;
    const marginBottom = width < 650 ? 29 : 35;
    const wideScale = Math.min((width - 2 * marginX) / (bounds.max.x - bounds.min.x), (height - marginTop - marginBottom) / (bounds.max.y - bounds.min.y));
    const scale = wideScale * Math.pow(screenScale / wideScale, linuxProgress);
    if (!(scale > 0)) return;
    const center = bounds.getCenter(point);
    center.y += (marginTop - marginBottom) / (2 * wideScale);
    const projectedGlass = glassCenter.applyMatrix4(camera.matrixWorldInverse);
    center.x = THREE.MathUtils.lerp(center.x, projectedGlass.x, linuxProgress);
    const glassBounds = glass.getBoundingClientRect(), frameBounds = host.getBoundingClientRect();
    const glassY = glassBounds.top + glassBounds.height / 2 - frameBounds.top;
    center.y = THREE.MathUtils.lerp(center.y, projectedGlass.y + (glassY - height / 2) / screenScale, linuxProgress);
    camera.left = center.x - width / (2 * scale);
    camera.right = center.x + width / (2 * scale);
    camera.top = center.y + height / (2 * scale);
    camera.bottom = camera.top - height / scale;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    canvas.dataset.linuxProgress = linuxProgress.toFixed(4);
    for (const { link, x, y } of anchors) {
      const half = link.offsetWidth / 2 + 2;
      link.style.left = Math.max(half, Math.min(width - half, (x - camera.left) * scale)) + "px";
      link.style.top = (camera.top - y) * scale + 2 + "px";
    }
    if (flight) invalidate();
    completed?.();
  }
  function invalidate() {
    if (!disposed && !frame) frame = requestAnimationFrame(draw);
  }
  function arrange() {
    width = host.clientWidth;
    height = host.clientHeight;
    renderer.setSize(width, height, false);
    const layout = width <= 650 ? compact : wide;
    for (const [id, { model }] of nodes) model.position.copy(groundPoint(layout[id]));
    for (const [i, [from, to]] of connections.entries()) {
      const start = groundPoint(layout[from]), end = groundPoint(layout[to]);
      const vector = end.clone().sub(start);
      const cable = cables[i];
      cable.position.copy(start).addScaledVector(vector, .5);
      cable.position.y = .072;
      cable.scale.y = vector.length();
      cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
    }
    invalidate();
  }
  function buildModels() {
    disposeObjects(equipment);
    nodes.clear();
    peripheralMaterials.clear();
    peripheralMaterials.add(cableMaterial);
    const dark = document.documentElement.dataset.computerTheme === "dark";
    cableMaterial.color.setHex(dark ? 0xadb4b4 : 0x50585a);
    for (const id of ids) {
      const model = createTopologyDevice(id, dark);
      const box = new THREE.Box3().setFromObject(model);
      const corners = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
      const link = labels.querySelector<HTMLAnchorElement>(`[data-topology-device="${id}"]`)!;
      model.userData.device = id;
      if (id !== "linux") model.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) peripheralMaterials.add(material);
        }
      });
      nodes.set(id, { model, link, corners });
      equipment.add(model);
    }
    arrange();
  }
  function orbit(horizontal: number, vertical: number) {
    if (flight || linuxProgress) return;
    azimuth += horizontal;
    elevation = THREE.MathUtils.clamp(elevation + vertical, .24, 1.36);
    invalidate();
  }
  function reset() {
    if (flight || linuxProgress) return;
    azimuth = startAzimuth; elevation = startElevation; invalidate();
  }
  function setLinux(open: boolean, animate: boolean, complete: () => void) {
    const to = Number(open);
    const duration = animate && !motion.matches && !document.hidden ? 850 * Math.abs(to - linuxProgress) : 0;
    if (duration < 1) {
      flight = undefined;
      linuxProgress = to;
      invalidate();
      complete();
      return;
    }
    flight = { from: linuxProgress, to, duration, start: performance.now(), complete };
    invalidate();
  }

  const ray = new THREE.Raycaster();
  function hit(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, camera);
    // Only physical mesh surfaces are targets. Three's picking tolerance for thin lines is much wider.
    let object = ray.intersectObjects(equipment.children, true).find(item => item.object instanceof THREE.Mesh)?.object;
    while (object && !object.userData.device) object = object.parent ?? undefined;
    return object?.userData.device as TopologyDevice | undefined;
  }
  const events = new AbortController();
  const opts = { signal: events.signal };
  let drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | undefined;
  canvas.addEventListener("pointerdown", event => {
    if (flight || linuxProgress || drag || event.button !== 0 || !event.isPrimary) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
  }, opts);
  canvas.addEventListener("pointermove", event => {
    if (!drag) {
      if (event.pointerType === "mouse") canvas.style.cursor = hit(event) ? "pointer" : "grab";
      return;
    }
    if (event.pointerId !== drag.id) return;
    drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 5;
    if (drag.moved) {
      canvas.style.cursor = "grabbing";
      orbit((drag.x - event.clientX) * .008, (event.clientY - drag.y) * .006);
      drag.x = event.clientX; drag.y = event.clientY;
    }
  }, opts);
  canvas.addEventListener("pointerup", event => {
    if (event.pointerId !== drag?.id) return;
    const click = !drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5;
    drag = undefined;
    canvas.style.cursor = "grab";
    const id = click ? hit(event) : undefined;
    if (id) nodes.get(id)?.link.click();
  }, opts);
  canvas.addEventListener("lostpointercapture", () => { drag = undefined; canvas.style.cursor = "grab"; }, opts);
  canvas.addEventListener("webglcontextlost", onLost, opts);
  const sizes = new ResizeObserver(arrange);
  const themes = new MutationObserver(buildModels);
  function dispose() {
    if (disposed) return;
    disposed = true;
    events.abort();
    sizes.disconnect();
    themes.disconnect();
    cancelAnimationFrame(frame);
    nodes.clear();
    disposeObjects(scene);
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
  try {
    buildModels();
    cancelAnimationFrame(frame);
    draw();
    sizes.observe(host);
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ["data-computer-theme"] });
  } catch (error) {
    dispose();
    throw error;
  }
  return { orbit, reset, setLinux, dispose };
}
