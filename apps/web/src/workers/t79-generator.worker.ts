import {
  T79GeneratorError,
  T79GeneratorOptionsSchema,
  type T79GeneratorErrorKind,
} from '@complianttools/image-engine/schemas/procedural-generator';
import {
  fbm,
  radialGradient,
  valueNoiseTexture,
} from '@complianttools/image-engine/cv/procedural-synthesis';

type WorkerResponse =
  | {
      readonly type: 'result';
      readonly width: number;
      readonly height: number;
      readonly data: ArrayBuffer;
    }
  | { readonly type: 'error'; readonly kind: T79GeneratorErrorKind };

function reportError(kind: T79GeneratorErrorKind) {
  const message: WorkerResponse = { type: 'error', kind };
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<unknown>) => {
  const parsed = T79GeneratorOptionsSchema.safeParse(event.data);
  if (!parsed.success) {
    reportError('invalid-options');
    return;
  }

  const options = parsed.data;
  try {
    const image =
      options.mode === 'fbm'
        ? fbm(options)
        : options.mode === 'value-noise'
          ? valueNoiseTexture(options)
          : radialGradient(options);
    const pixels = image.frames[0]?.data;
    if (
      image.width !== options.width ||
      image.height !== options.height ||
      !pixels ||
      pixels.length !== options.width * options.height * 4
    ) {
      throw new T79GeneratorError('processing-failed');
    }
    const buffer = pixels.buffer as ArrayBuffer;
    const result: WorkerResponse = {
      type: 'result',
      width: image.width,
      height: image.height,
      data: buffer,
    };
    self.postMessage(result, { transfer: [buffer] });
  } catch (cause) {
    reportError(cause instanceof T79GeneratorError ? cause.kind : 'processing-failed');
  }
};
