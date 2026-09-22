import {
  fbm,
  radialGradient,
  valueNoiseTexture,
} from '@complianttools/image-engine/cv/procedural-synthesis';

type Mode = 'fbm' | 'value-noise' | 'radial-gradient';
type Request = { width: number; height: number; seed: number; mode: Mode };

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const { width, height, seed, mode } = event.data;
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 16 ||
      height < 16 ||
      width > 512 ||
      height > 512 ||
      !Number.isSafeInteger(seed) ||
      seed < -2147483648 ||
      seed > 2147483647 ||
      !['fbm', 'value-noise', 'radial-gradient'].includes(mode)
    )
      throw new RangeError('Invalid generator mode or dimensions.');

    const options = { width, height, seed };
    const image =
      mode === 'fbm'
        ? fbm(options)
        : mode === 'value-noise'
          ? valueNoiseTexture(options)
          : radialGradient(options);
    const pixels = image.frames[0].data;
    const buffer = pixels.buffer as ArrayBuffer;
    self.postMessage(
      { type: 'result', width: image.width, height: image.height, data: buffer },
      { transfer: [buffer] },
    );
  } catch {
    self.postMessage({ type: 'error' });
  }
};
