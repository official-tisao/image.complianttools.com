import type { RasterImage } from '../types.js';
import { ResizeOptionsSchema } from '../schemas/options.js';
import { resizeRaster } from '../ops/resize.js';

const proxyCache = new WeakMap<object, Map<number, RasterImage>>();

export function proxyLongestEdge(deviceMemoryGb = 4): number {
  return deviceMemoryGb <= 2 ? 1024 : 2048;
}

export function createProxy(image: RasterImage, deviceMemoryGb = 4): RasterImage {
  const edge = proxyLongestEdge(deviceMemoryGb);
  if (Math.max(image.width, image.height) <= edge) return image;
  let byEdge = proxyCache.get(image as object);
  if (!byEdge) {
    byEdge = new Map();
    proxyCache.set(image as object, byEdge);
  }
  const cached = byEdge.get(edge);
  if (cached) return cached;
  const scale = edge / Math.max(image.width, image.height);
  const proxy = resizeRaster(
    image,
    ResizeOptionsSchema.parse({
      mode: 'pixels',
      width: Math.round(image.width * scale),
      height: Math.round(image.height * scale),
      allowUpscale: false,
    }),
  );
  byEdge.set(edge, proxy);
  return proxy;
}

export function debounceCommittedPreview<T extends readonly unknown[], R>(
  callback: (...args: T) => Promise<R>,
  delayMs = 120,
): (...args: T) => Promise<R> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args) =>
    new Promise((resolve, reject) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void callback(...args).then(resolve, reject), delayMs);
    });
}
