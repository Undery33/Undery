type Size = { width: number; height: number };
type Point = { x: number; y: number };

// Geometry and cable offsets use the renderer's projected coordinates. Scale converts them to viewport units.
export function frameDevice(
  viewport: Size,
  availableHeight: number,
  device: Size,
  towardCable: Point,
  overviewScale = 1,
) {
  const scale = Math.min(
    overviewScale * 2.75,
    viewport.width * .57 / device.width,
    availableHeight * .68 / device.height,
  );
  const offset = (distance: number, limit: number) => Math.max(-limit, Math.min(limit, distance * .12));
  return {
    scale,
    offsetX: offset(towardCable.x, viewport.width * .06 / scale),
    offsetY: offset(towardCable.y, viewport.height * .04 / scale),
  };
}
