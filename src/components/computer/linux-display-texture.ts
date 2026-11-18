import * as THREE from "three";

const svgNamespace = "http://www.w3.org/2000/svg";
const paintProperties = [
  "color", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-opacity", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "opacity", "vector-effect",
];

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function copyDiagram(source: SVGSVGElement, rect: DOMRect, glass: DOMRect, inlineImage: (href: string) => Promise<string>) {
  const copy = source.cloneNode(true) as SVGSVGElement;
  const originals = [source, ...source.querySelectorAll<SVGElement>("*")];
  const copies = [copy, ...copy.querySelectorAll<SVGElement>("*")];
  const idMap = new Map<string, string>();
  for (const el of copies) {
    if (!el.id) continue;
    const localId = `${source.dataset.architecture}-${idMap.size}`;
    idMap.set(el.id, localId);
    el.id = localId;
  }
  const images: Promise<void>[] = [];
  originals.forEach((el, i) => {
    const out = copies[i];
    const style = getComputedStyle(el);
    out.removeAttribute("style");
    out.removeAttribute("class");
    for (const name of paintProperties) {
      // The HTML control is transparent in 3D because this texture supplies its visible artwork.
      out.setAttribute(name, el === source && name === "opacity" ? "1" : style.getPropertyValue(name));
    }
    for (const name of ["marker-start", "marker-mid", "marker-end"]) {
      // Computed marker URLs can contain the current page URL. Keep arrowheads local to this SVG.
      const id = style.getPropertyValue(name).match(/#([^"')]+)["']?\)$/)?.[1];
      if (id && idMap.has(id)) out.setAttribute(name, `url(#${idMap.get(id)})`);
    }
    if (el instanceof SVGImageElement) {
      images.push(inlineImage(el.href.baseVal).then(data => { out.setAttribute("href", data); }));
    }
  });
  copy.setAttribute("x", String(rect.left - glass.left));
  copy.setAttribute("y", String(rect.top - glass.top));
  copy.setAttribute("width", String(rect.width));
  copy.setAttribute("height", String(rect.height));
  await Promise.all(images);
  return copy;
}

export function createLinuxDisplay(glass: HTMLElement, invalidate: () => void, fallback: () => void) {
  const geometry = new THREE.PlaneGeometry(1.48, .72);
  const material = new THREE.MeshBasicMaterial({ toneMapped: false });
  material.visible = false;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Linux architecture display";
  mesh.position.set(0, .90, -.020);

  const stage = glass.closest<HTMLElement>("[data-computer-topology]");
  const controller = new AbortController();
  const assets = new Map<string, Promise<string>>();
  const objectUrls = new Set<string>();
  let texture: THREE.CanvasTexture<HTMLCanvasElement> | undefined;
  let frame = 0;
  let generation = 0;
  let disposed = false;

  function inlineImage(href: string) {
    if (href.startsWith("data:")) return Promise.resolve(href);
    const url = new URL(href, document.baseURI).href;
    let asset = assets.get(url);
    if (!asset) {
      asset = fetch(url, { mode: "same-origin", signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error("Could not load a Linux diagram image");
        return readDataUrl(await response.blob());
      });
      assets.set(url, asset);
    }
    return asset;
  }

  function focused() {
    return stage?.dataset.topologyView === "entering" || stage?.dataset.topologyView === "linux";
  }

  async function paint(version: number) {
    const sources = [...glass.querySelectorAll<SVGSVGElement>("svg[data-architecture]")]
      .map(svg => ({ svg, rect: svg.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const bounds = glass.getBoundingClientRect();
    if (!focused() || !sources.length || !bounds.width || !bounds.height) return;
    const valid = () => !disposed && generation === version && focused();
    const scale = Math.min(2, 2048 / Math.max(bounds.width, bounds.height));
    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));
    const artwork = document.createElementNS(svgNamespace, "svg");
    artwork.setAttribute("width", String(width));
    artwork.setAttribute("height", String(height));
    artwork.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    const layers = await Promise.all(sources.map(({ svg, rect }) => copyDiagram(svg, rect, bounds, inlineImage)));
    if (!valid()) return;
    artwork.append(...layers);
    const svg = new Blob([new XMLSerializer().serializeToString(artwork)], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svg);
    objectUrls.add(url);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!valid()) return;
      const resized = !texture || texture.image.width !== width || texture.image.height !== height;
      const canvas = resized ? document.createElement("canvas") : texture!.image;
      if (resized) { canvas.width = width; canvas.height = height; }
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable for Linux display");
      context.fillStyle = getComputedStyle(glass).getPropertyValue("--computer-paper").trim() || "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      if (resized) {
        // A texture's dimensions must remain stable after its first GPU upload.
        context.getImageData(0, 0, 1, 1);
        texture?.dispose();
        texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        material.map = texture;
        material.visible = true;
        material.needsUpdate = true;
      }
      texture!.needsUpdate = true;
      invalidate();
    } finally {
      URL.revokeObjectURL(url);
      objectUrls.delete(url);
    }
  }

  function schedule() {
    generation++;
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const version = generation;
      void paint(version).catch(() => { if (!disposed && generation === version && focused()) fallback(); });
    });
  }
  const changes = new MutationObserver(schedule);
  changes.observe(glass, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-linux-focus", "hidden"] });
  if (stage) changes.observe(stage, { attributes: true, attributeFilter: ["data-scroll-highlight", "data-topology-view"] });
  changes.observe(document.documentElement, { attributes: true, attributeFilter: ["data-computer-theme"] });
  const resize = new ResizeObserver(schedule);
  resize.observe(glass);
  schedule();

  return { mesh, dispose() {
    disposed = true;
    changes.disconnect();
    resize.disconnect();
    cancelAnimationFrame(frame);
    controller.abort();
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls.clear();
    texture?.dispose();
    material.dispose();
    geometry.dispose();
  } };
}
