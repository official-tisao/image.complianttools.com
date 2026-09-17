export interface ScanWindow {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}
export function getBaseWindowSize(): { width: number; height: number } {
  return { width: 24, height: 24 };
}
export function generateScanWindows(
  imageWidth: number,
  imageHeight: number,
  windowW: number,
  windowH: number,
  scale = 1.0,
): ScanWindow[] {
  const windows: ScanWindow[] = [];
  const scaledW = Math.round(windowW * scale);
  const scaledH = Math.round(windowH * scale);
  if (scaledW > imageWidth || scaledH > imageHeight) return windows;
  const stepX = Math.max(1, Math.round(scaledW * 0.25));
  const stepY = Math.max(1, Math.round(scaledH * 0.25));
  for (let y = 0; y <= imageHeight - scaledH; y += stepY) {
    for (let x = 0; x <= imageWidth - scaledW; x += stepX) {
      windows.push({ x, y, width: scaledW, height: scaledH, scale });
    }
  }
  return windows;
}
export interface MultiScaleScanOptions {
  readonly scaleStep?: number;
  readonly minSize?: number;
  readonly maxScale?: number;
}
export function generateMultiScaleWindows(
  imageWidth: number,
  imageHeight: number,
  baseW: number,
  baseH: number,
  opts?: Partial<MultiScaleScanOptions>,
): ScanWindow[] {
  const scaleStep = opts?.scaleStep ?? 1.25;
  const minSize = opts?.minSize ?? 24;
  const maxScale = opts?.maxScale ?? 4.0;
  const windows: ScanWindow[] = [];
  let scale = 1.0;
  while (scale <= maxScale) {
    const scaledW = Math.round(baseW * scale);
    const scaledH = Math.round(baseH * scale);
    if (
      scaledW >= minSize &&
      scaledH >= minSize &&
      scaledW <= imageWidth &&
      scaledH <= imageHeight
    ) {
      windows.push(...generateScanWindows(imageWidth, imageHeight, baseW, baseH, scale));
    }
    scale *= scaleStep;
    if (scale > maxScale * 2) break;
  }
  return windows;
}
export interface OverlappingDetection {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly confidence: number;
}
function iou(a: OverlappingDetection, b: OverlappingDetection): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  return inter / (a.width * a.height + b.width * b.height - inter);
}
export function nms(
  detections: OverlappingDetection[],
  iouThreshold = 0.3,
): OverlappingDetection[] {
  if (detections.length === 0) return [];
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: OverlappingDetection[] = [];
  const suppressed = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(sorted[i]!);
    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;
      if (iou(sorted[i]!, sorted[j]!) > iouThreshold) suppressed.add(j);
    }
  }
  return kept;
}
export function mapDetectionToOriginal(
  det: { x: number; y: number; width: number; height: number },
  scale: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(det.x / scale),
    y: Math.round(det.y / scale),
    width: Math.round(det.width / scale),
    height: Math.round(det.height / scale),
  };
}
