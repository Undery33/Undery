import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SVGRenderer } from "three/addons/renderers/SVGRenderer.js";
import type { NetworkTopology } from "./network-topologies";

export type SceneSnapshot = {
  key: string;
  nodeIds: string[];
  edgeIds: string[];
  failedEdgeIds?: string[];
  /** Hide data packets during control-plane-only steps. Omitted means visible. */
  showPacket?: boolean;
  state: "ready" | "moving" | "success" | "blocked";
  tagged: boolean;
  paused: boolean;
};

export type NetworkSceneHandle = {
  rendererMode: "webgl" | "svg";
  update: (snapshot: SceneSnapshot) => void;
  resetView: () => void;
  zoom: (amount: number) => void;
  orbit: (horizontal: number, vertical: number) => void;
  dispose: () => void;
};

type Palette = Record<"paper" | "surface" | "soft" | "ink" | "muted" | "rule" | "accent" | "error" | "border", string>;
type MaterialRole = keyof Palette;

/** Procedural local models: no model, texture, font or network request is needed. */
export function createNetworkScene(
  host: HTMLElement,
  topology: NetworkTopology,
  onUnavailable: (rendererMode: "webgl" | "svg") => void,
  preferSvg = false,
): NetworkSceneHandle {
  let webglRenderer: THREE.WebGLRenderer | undefined;
  if (!preferSvg) {
    const canvas = document.createElement("canvas");
    const attributes: WebGLContextAttributes = { antialias: true, alpha: false, powerPreference: "low-power" };
    let context: WebGL2RenderingContext | null = null;
    try {
      // Probe once and reuse the context. Disabled WebGL never reaches Three's constructor.
      context = canvas.getContext("webgl2", attributes);
      if (context) webglRenderer = new THREE.WebGLRenderer({ canvas, context, ...attributes });
    } catch {
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }
  const renderer = webglRenderer ?? new SVGRenderer();
  const rendererMode = webglRenderer ? "webgl" : "svg";
  const softwareRendering = rendererMode === "svg";
  if (renderer instanceof THREE.WebGLRenderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } else {
    // SVGRenderer projects the same Three geometry and camera on the CPU.
    // It supports MeshStandardMaterial diffuse/emissive color, but no textures/shadows.
    renderer.setQuality("high");
    renderer.setPrecision(2);
    renderer.overdraw = 0.25;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.setAttribute("data-network-renderer", rendererMode);
  host.appendChild(renderer.domElement);
  const labelLayer = document.createElement("div");
  labelLayer.setAttribute("data-network-label-layer", "");
  labelLayer.setAttribute("aria-hidden", "true");
  host.appendChild(labelLayer);
  const labels: { anchor: THREE.Object3D; element: HTMLDivElement }[] = [];
  const labelPosition = new THREE.Vector3();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const initialPosition = new THREE.Vector3(11.5, 14, 18.5);
  const initialDirection = initialPosition.clone().normalize();
  let fittedDistance = initialPosition.length();
  camera.position.copy(initialPosition);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.25, 0);
  controls.minDistance = 12;
  controls.maxDistance = 32;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = Math.PI / 2.15;
  controls.enablePan = false;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.8;
  controls.dampingFactor = 0.09;
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionPreference.matches;
  controls.enableDamping = !reducedMotion;

  let destroyed = false;
  let frameId = 0;
  let dirty = true;
  let visible = true;
  let animationStart = 0;
  let pausedAt = 0;
  let lastRenderedAt = 0;
  let snapshot: SceneSnapshot = { key: "", nodeIds: [], edgeIds: [], state: "ready", tagged: false, paused: false };
  const materials: { material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.LineBasicMaterial | THREE.SpriteMaterial; role: MaterialRole }[] = [];
  const nodeVisuals = new Map<string, { group: THREE.Group; ring: THREE.MeshBasicMaterial; indicator: THREE.MeshStandardMaterial }>();
  const edgeVisuals = new Map<string, {
    curve: THREE.CubicBezierCurve3;
    material: THREE.MeshStandardMaterial;
    mesh: THREE.Mesh;
    failedLine: THREE.Line;
    failureMark: THREE.Group;
    from: string;
    to: string;
  }>();

  function readPalette(): Palette {
    const css = getComputedStyle(host);
    const read = (token: string, fallback: string) => css.getPropertyValue(token).trim() || fallback;
    return {
      paper: read("--computer-paper", "#f8f7f3"),
      surface: read("--computer-surface", "#fffefa"),
      soft: read("--computer-soft", "#efede6"),
      ink: read("--computer-ink", "#282923"),
      muted: read("--computer-muted", "#6f7067"),
      rule: read("--computer-rule", "#deddd5"),
      accent: read("--computer-accent", "#a9512e"),
      error: read("--computer-error", "#933d2c"),
      border: read("--computer-control-border", "#b9b9ad"),
    };
  }

  let palette = readPalette();
  function material(role: MaterialRole, metalness = 0.08) {
    const result = new THREE.MeshStandardMaterial({ color: palette[role], roughness: 0.8, metalness });
    materials.push({ material: result, role });
    return result;
  }
  const surfaceMaterial = material("surface");
  const softMaterial = material("soft");
  const inkMaterial = material("ink");
  const borderMaterial = material("border", 0.3);
  const accentMaterial = material("accent");

  function box(parent: THREE.Object3D, width: number, height: number, depth: number, x: number, y: number, z: number, mat: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function cylinder(parent: THREE.Object3D, radius: number, height: number, x: number, y: number, z: number, mat: THREE.Material, segments = 32) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, softwareRendering ? Math.min(segments, 16) : segments), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function makeLabel(parent: THREE.Group, title: string, detail: string, height = 2.1) {
    const anchor = new THREE.Object3D();
    anchor.position.set(0, height, 0);
    parent.add(anchor);
    const element = document.createElement("div");
    element.setAttribute("data-network-label", "");
    const heading = document.createElement("strong");
    heading.textContent = title;
    const description = document.createElement("small");
    description.textContent = detail;
    element.append(heading, description);
    labelLayer.appendChild(element);
    labels.push({ anchor, element });
  }

  function updateLabels() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    for (const label of labels) {
      label.anchor.getWorldPosition(labelPosition).project(camera);
      const inView = labelPosition.z >= -1 && labelPosition.z <= 1 && Math.abs(labelPosition.x) < 1.15 && Math.abs(labelPosition.y) < 1.15;
      label.element.hidden = !inView;
      if (inView) {
        label.element.style.transform = `translate(${(labelPosition.x + 1) * width / 2}px, ${(1 - labelPosition.y) * height / 2}px) translate(-50%, -50%)`;
      }
    }
  }

  function pcModel(parent: THREE.Group, indicator: THREE.Material, scale = 1) {
    const model = new THREE.Group();
    model.scale.setScalar(scale);
    parent.add(model);
    box(model, 0.85, 0.1, 0.62, 0, 0.15, 0, softMaterial);
    box(model, 0.13, 0.5, 0.15, 0, 0.45, 0, borderMaterial);
    box(model, 1.24, 0.88, 0.16, 0, 1.04, 0, surfaceMaterial);
    box(model, 1.08, 0.69, 0.02, 0, 1.06, 0.09, softMaterial);
    box(model, 0.54, 0.045, 0.024, -0.16, 1.19, 0.106, indicator);
    box(model, 0.76, 0.035, 0.024, -0.05, 1.06, 0.106, borderMaterial);
    box(model, 0.4, 0.035, 0.024, -0.23, 0.94, 0.106, borderMaterial);
    box(model, 0.82, 0.055, 0.29, 0, 0.135, 0.59, surfaceMaterial);
    for (let row = 0; row < 3; row += 1) {
      box(model, 0.68, 0.009, 0.015, 0, 0.168, 0.49 + row * 0.085, borderMaterial);
    }
    box(model, 0.36, 0.72, 0.65, 0.91, 0.46, 0.02, surfaceMaterial);
    box(model, 0.24, 0.035, 0.02, 0.91, 0.67, 0.355, inkMaterial);
    box(model, 0.045, 0.045, 0.025, 0.82, 0.32, 0.355, indicator);
    for (let row = 0; row < 5; row += 1) {
      box(model, 0.21, 0.018, 0.015, 0.91, 0.4 + row * 0.035, 0.355, borderMaterial);
    }
  }

  function switchModel(parent: THREE.Group, indicator: THREE.Material) {
    box(parent, 2.2, 0.46, 1.16, 0, 0.45, 0, surfaceMaterial);
    box(parent, 2.22, 0.055, 1.18, 0, 0.235, 0, borderMaterial);
    box(parent, 2.08, 0.27, 0.035, 0, 0.44, 0.592, softMaterial);
    for (let port = 0; port < 8; port += 1) {
      const x = -0.86 + port * 0.245;
      box(parent, 0.165, 0.13, 0.045, x, 0.44, 0.62, inkMaterial);
      box(parent, 0.105, 0.052, 0.05, x, 0.445, 0.645, borderMaterial);
      box(parent, 0.035, 0.028, 0.02, x - 0.05, 0.545, 0.62, indicator);
    }
    for (let vent = 0; vent < 9; vent += 1) {
      box(parent, 0.035, 0.009, 0.46, -0.54 + vent * 0.12, 0.685, -0.09, borderMaterial);
    }
    box(parent, 0.28, 0.016, 0.18, -0.84, 0.686, -0.2, indicator);
    [-0.96, 0.96].forEach((x) => [-0.46, 0.46].forEach((z) => cylinder(parent, 0.035, 0.018, x, 0.688, z, borderMaterial, 12)));
  }

  function routerModel(parent: THREE.Group, indicator: THREE.Material, compact = false) {
    const radius = compact ? 0.58 : 1.0;
    cylinder(parent, radius, 0.52, 0, 0.43, 0, surfaceMaterial, 48);
    cylinder(parent, radius + 0.015, 0.055, 0, 0.2, 0, borderMaterial, 48);
    cylinder(parent, radius * 0.72, 0.025, 0, 0.71, 0, softMaterial, 48);
    const arm = compact ? 0.38 : 0.64;
    box(parent, arm, 0.018, 0.075, 0, 0.735, 0, indicator);
    box(parent, 0.075, 0.018, arm, 0, 0.735, 0, indicator);
    for (let port = 0; port < 6; port += 1) {
      const angle = (port / 6) * Math.PI * 2;
      const plug = box(parent, 0.18, 0.1, 0.07, Math.sin(angle) * radius, 0.43, Math.cos(angle) * radius, inkMaterial);
      plug.rotation.y = angle;
      const led = box(parent, 0.04, 0.035, 0.025, Math.sin(angle) * (radius + 0.02), 0.55, Math.cos(angle) * (radius + 0.02), indicator);
      led.rotation.y = angle;
    }
  }

  // SVGRenderer ignores HemisphereLight and AmbientLight.intensity. Encode its
  // ambient energy in the color, then use a gentle directional light for facets.
  scene.add(softwareRendering
    ? new THREE.AmbientLight(new THREE.Color().setRGB(0.5, 0.5, 0.5))
    : new THREE.HemisphereLight(0xffffff, 0x7a786b, 2.2));
  const light = new THREE.DirectionalLight(0xffffff, softwareRendering ? 0.75 : 2.6);
  light.position.set(-5, 14, 8);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.left = -11;
  light.shadow.camera.right = 11;
  light.shadow.camera.top = 9;
  light.shadow.camera.bottom = -9;
  light.shadow.normalBias = 0.04;
  light.shadow.bias = -0.0002;
  scene.add(light);
  box(scene, 17.7, 0.12, 11.5, 0, -0.1, 0, softMaterial).renderOrder = -9;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18.8, 12.6), material("paper"));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.17;
  floor.receiveShadow = true;
  floor.renderOrder = -10;
  scene.add(floor);
  const gridPoints: THREE.Vector3[] = [];
  for (let x = -8; x <= 8; x += softwareRendering ? 2 : 1) gridPoints.push(new THREE.Vector3(x, -0.032, -5), new THREE.Vector3(x, -0.032, 5));
  for (let z = -5; z <= 5; z += softwareRendering ? 2 : 1) gridPoints.push(new THREE.Vector3(-8, -0.032, z), new THREE.Vector3(8, -0.032, z));
  const gridMaterial = new THREE.LineBasicMaterial({ color: palette.rule, transparent: true, opacity: 0.48 });
  materials.push({ material: gridMaterial, role: "rule" });
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), gridMaterial);
  grid.renderOrder = -8;
  scene.add(grid);
  [-8.4, 8.4].forEach((x) => [-5.3, 5.3].forEach((z) => cylinder(scene, 0.075, 0.025, x, -0.025, z, borderMaterial, 16)));

  for (const node of topology.nodes) {
    const group = new THREE.Group();
    group.position.set(node.position[0], 0, node.position[1]);
    scene.add(group);
    const indicator = new THREE.MeshStandardMaterial({ color: palette.border, roughness: 0.7 });
    const ringMaterial = new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.06, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.28, softwareRendering ? 24 : 48), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.052;
    ring.renderOrder = -2;
    group.add(ring);
    box(group, 2.5, 0.04, 1.85, 0, 0.025, 0, surfaceMaterial).renderOrder = -3;
    if (node.kind === "pc") pcModel(group, indicator);
    if (node.kind === "switch") switchModel(group, indicator);
    if (node.kind === "router") routerModel(group, indicator);
    if (node.kind === "gateway") routerModel(group, indicator, true);
    if (node.kind === "network") {
      pcModel(group, indicator, 0.7);
      const secondary = new THREE.Group();
      secondary.position.set(-0.9, 0, -0.45);
      group.add(secondary);
      box(secondary, 0.52, 0.68, 0.42, 0, 0.38, 0, softMaterial);
      box(secondary, 0.4, 0.45, 0.025, 0, 0.44, 0.23, surfaceMaterial);
      box(secondary, 0.22, 0.03, 0.03, 0, 0.44, 0.25, indicator);
    }
    makeLabel(group, node.label, node.detail, node.kind === "pc" ? 2.05 : 1.8);
    nodeVisuals.set(node.id, { group, ring: ringMaterial, indicator });
  }

  for (const edge of topology.edges) {
    const from = topology.nodes.find((node) => node.id === edge.from)!;
    const to = topology.nodes.find((node) => node.id === edge.to)!;
    const start = new THREE.Vector3(from.position[0], 0.13, from.position[1]);
    const end = new THREE.Vector3(to.position[0], 0.13, to.position[1]);
    const bendX = start.x + (end.x - start.x) * 0.48;
    const curve = new THREE.CubicBezierCurve3(start, new THREE.Vector3(bendX, 0.18, start.z), new THREE.Vector3(bendX, 0.18, end.z), end);
    const wireMaterial = new THREE.MeshStandardMaterial({ color: palette.border, roughness: 0.65 });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, softwareRendering ? 16 : 40, edge.id === "trunk" ? 0.065 : 0.043, softwareRendering ? 4 : 8, false), wireMaterial);
    mesh.castShadow = true;
    mesh.renderOrder = -1;
    scene.add(mesh);
    // Explicit gaps stay visible in SVGRenderer at every zoom level; material
    // dash lengths otherwise restart at each projected curve segment.
    const failedLineMaterial = new THREE.LineBasicMaterial({ color: palette.error, linewidth: 2 });
    materials.push({ material: failedLineMaterial, role: "error" });
    const failedPoints: THREE.Vector3[] = [];
    for (let dash = 0; dash < 18; dash += 1) {
      failedPoints.push(curve.getPoint(dash / 18), curve.getPoint((dash + 0.58) / 18));
    }
    const failedLine = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(failedPoints), failedLineMaterial);
    failedLine.position.y = 0.03;
    failedLine.renderOrder = 1;
    failedLine.visible = false;
    scene.add(failedLine);
    const failureMark = new THREE.Group();
    failureMark.position.copy(curve.getPoint(0.5)).add(new THREE.Vector3(0, 0.2, 0));
    const failureMaterial = new THREE.MeshBasicMaterial({ color: palette.error });
    materials.push({ material: failureMaterial, role: "error" });
    for (const angle of [-Math.PI / 4, Math.PI / 4]) {
      const bar = box(failureMark, 0.7, 0.08, 0.09, 0, 0, 0, failureMaterial);
      bar.rotation.y = angle;
      bar.renderOrder = 2;
    }
    failureMark.visible = false;
    scene.add(failureMark);
    edgeVisuals.set(edge.id, { curve, material: wireMaterial, mesh, failedLine, failureMark, from: edge.from, to: edge.to });
  }

  const packet = new THREE.Group();
  const packetMaterial = new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.5, emissive: palette.accent, emissiveIntensity: 0.1 });
  box(packet, 0.48, 0.22, 0.34, 0, 0, 0, packetMaterial);
  box(packet, 0.27, 0.015, 0.055, 0, 0.118, 0, surfaceMaterial);
  const tag = box(packet, 0.18, 0.16, 0.3, 0.29, 0.02, 0, accentMaterial);
  packet.children.forEach((child) => { child.renderOrder = 5; });
  scene.add(packet);
  packet.visible = false;

  function applyHighlight() {
    const statusColor = snapshot.state === "blocked" ? palette.error : palette.accent;
    for (const [id, visual] of nodeVisuals) {
      const active = snapshot.nodeIds.includes(id);
      visual.indicator.color.set(active ? statusColor : palette.border);
      visual.ring.color.set(statusColor);
      visual.ring.opacity = active ? 0.35 : 0.045;
    }
    for (const [id, visual] of edgeVisuals) {
      const failed = snapshot.failedEdgeIds?.includes(id) ?? false;
      const active = !failed && snapshot.edgeIds.includes(id);
      visual.mesh.visible = !failed;
      visual.failedLine.visible = failed;
      visual.failureMark.visible = failed;
      visual.material.color.set(active ? statusColor : palette.border);
      visual.material.emissive.set(active ? statusColor : "#000000");
      if (softwareRendering) visual.material.emissive.multiplyScalar(0.13);
      visual.material.emissiveIntensity = active ? 0.13 : 0;
    }
    packetMaterial.color.set(statusColor);
    packetMaterial.emissive.set(statusColor);
    if (softwareRendering) packetMaterial.emissive.multiplyScalar(0.1);
    tag.visible = snapshot.showPacket !== false && snapshot.tagged;
  }

  function animatePacket(time: number): boolean {
    if (snapshot.showPacket === false) {
      packet.visible = false;
      return false;
    }
    const path: { curve: THREE.CubicBezierCurve3; reversed: boolean }[] = [];
    let blockedAt: string | undefined;
    for (const id of snapshot.edgeIds) {
      const edge = edgeVisuals.get(id);
      if (!edge) continue;
      const fromIndex = snapshot.nodeIds.indexOf(edge.from);
      const toIndex = snapshot.nodeIds.indexOf(edge.to);
      const reversed = fromIndex >= 0 && toIndex >= 0 && fromIndex > toIndex;
      if (snapshot.failedEdgeIds?.includes(id)) {
        // Stop at the first failure. Removing only that link would incorrectly
        // let the packet jump to downstream links beyond the failed segment.
        blockedAt = reversed ? edge.to : edge.from;
        break;
      }
      path.push({ curve: edge.curve, reversed });
    }
    if (path.length === 0 || snapshot.state !== "moving") {
      const node = nodeVisuals.get(blockedAt ?? snapshot.nodeIds.at(-1) ?? "");
      packet.visible = !!node;
      if (node) packet.position.copy(node.group.position).add(new THREE.Vector3(0, 1.05, 0));
      return false;
    }
    const progress = reducedMotion ? 1 : Math.min(((snapshot.paused ? pausedAt : time) - animationStart) / 1550, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const pathProgress = eased * path.length;
    const edgeIndex = Math.min(Math.floor(pathProgress), path.length - 1);
    const segment = path[edgeIndex];
    const segmentProgress = Math.min(pathProgress - edgeIndex, 1);
    const curveProgress = segment.reversed ? 1 - segmentProgress : segmentProgress;
    const curve = segment.curve;
    packet.position.copy(curve.getPoint(curveProgress)).add(new THREE.Vector3(0, 0.5, 0));
    const tangent = curve.getTangent(curveProgress);
    if (segment.reversed) tangent.negate();
    packet.rotation.y = Math.atan2(tangent.x, tangent.z);
    packet.visible = true;
    return progress < 1 && !snapshot.paused;
  }

  function render(time: number) {
    frameId = 0;
    if (destroyed || !visible) return;
    if (softwareRendering && time - lastRenderedAt < 1000 / 30) {
      invalidate();
      return;
    }
    const moved = controls.update();
    const moving = animatePacket(time);
    if (dirty || moved || moving) {
      try {
        scene.updateMatrixWorld();
        camera.updateMatrixWorld();
        renderer.render(scene, camera);
        updateLabels();
        lastRenderedAt = time;
      } catch {
        dispose();
        onUnavailable(rendererMode);
        return;
      }
    }
    dirty = false;
    if (moved || moving) invalidate();
  }

  function invalidate() {
    dirty = true;
    if (!frameId && !destroyed && visible) frameId = window.requestAnimationFrame(render);
  }

  function resize() {
    if (destroyed) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    const nextFittedDistance = Math.max(25, 36 / camera.aspect);
    const offset = camera.position.clone().sub(controls.target);
    camera.position.copy(controls.target).add(offset.multiplyScalar(nextFittedDistance / fittedDistance));
    fittedDistance = nextFittedDistance;
    initialPosition.copy(initialDirection).multiplyScalar(fittedDistance).add(controls.target);
    controls.minDistance = fittedDistance * 0.5;
    controls.maxDistance = fittedDistance * 1.8;
    camera.updateProjectionMatrix();
    if (renderer instanceof THREE.WebGLRenderer) renderer.setSize(width, height, false);
    else renderer.setSize(width, height);
    invalidate();
  }

  function updateTheme() {
    palette = readPalette();
    scene.background = new THREE.Color(palette.paper);
    for (const entry of materials) entry.material.color.set(palette[entry.role]);
    applyHighlight();
    invalidate();
  }

  function updateMotionPreference() {
    reducedMotion = motionPreference.matches;
    controls.enableDamping = !reducedMotion;
    invalidate();
  }

  function contextLost(event: Event) {
    event.preventDefault();
    dispose();
    onUnavailable(rendererMode);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const themeObserver = new MutationObserver(updateTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-computer-theme"] });
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) invalidate();
  });
  visibilityObserver.observe(host);
  motionPreference.addEventListener("change", updateMotionPreference);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  controls.addEventListener("change", invalidate);
  updateTheme();
  resize();

  function dispose() {
    if (destroyed) return;
    destroyed = true;
    window.cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    themeObserver.disconnect();
    visibilityObserver.disconnect();
    motionPreference.removeEventListener("change", updateMotionPreference);
    renderer.domElement.removeEventListener("webglcontextlost", contextLost);
    controls.removeEventListener("change", invalidate);
    controls.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const disposableMaterials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) geometries.add(object.geometry);
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
          disposableMaterials.add(mat);
          if ("map" in mat && mat.map instanceof THREE.Texture) textures.add(mat.map);
        }
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    disposableMaterials.forEach((mat) => mat.dispose());
    textures.forEach((texture) => texture.dispose());
    light.shadow.map?.dispose();
    if (renderer instanceof THREE.WebGLRenderer) renderer.dispose();
    else renderer.clear();
    renderer.domElement.remove();
    labelLayer.remove();
  }

  return {
    rendererMode,
    update(next) {
      if (destroyed) return;
      const now = performance.now();
      if (snapshot.key !== next.key) {
        animationStart = now;
        pausedAt = now;
      } else if (next.paused && !snapshot.paused) {
        pausedAt = now;
      } else if (!next.paused && snapshot.paused) {
        animationStart += now - pausedAt;
      }
      snapshot = next;
      applyHighlight();
      invalidate();
    },
    resetView() {
      camera.position.copy(initialPosition);
      controls.target.set(0, 0.25, 0);
      controls.update();
      invalidate();
    },
    zoom(amount) {
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length() * Math.exp(amount), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(distance));
      controls.update();
      invalidate();
    },
    orbit(horizontal, vertical) {
      const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      spherical.theta += horizontal;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + vertical, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
      invalidate();
    },
    dispose,
  };
}
