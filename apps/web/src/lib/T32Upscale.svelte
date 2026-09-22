<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import CompareCanvas from './CompareCanvas.svelte';
  import GeneratedControls from './GeneratedControls.svelte';
  import ToolPageCompletion from './ToolPageCompletion.svelte';
  import { translate, type Locale } from './i18n';
  import type { OptionDescription } from '@complianttools/image-engine/schemas/options';
  import {
    T32UpscaleOptionsSchema,
    t32UpscaleToolOptionDescriptions,
    type T32UpscaleOptions,
  } from '@complianttools/image-engine/schemas/t32-upscale-options';
  import {
    downloadAndCacheT32Model,
    loadT32ModelSources,
    readCachedT32Model,
    t32Tier2SupportIssue,
    T32_MODELS,
    type T32ModelDefinition,
    type T32ModelFactor,
    type T32ModelSources,
  } from './t32-tier2-models';

  const MAX_FILE_BYTES = 32 * 1024 * 1024;
  const MAX_SOURCE_PIXELS = 12_000_000;
  const MAX_OUTPUT_PIXELS = 4_000_000;
  const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

  type Method = T32UpscaleOptions['method'];
  type Factor = T32UpscaleOptions['factor'];
  type ErrorKind =
    | 'unsupported-file'
    | 'file-too-large'
    | 'image-too-large'
    | 'output-too-large'
    | 'decode-failed'
    | 'processing-failed'
    | 'cancelled';
  type Dimensions = { width: number; height: number };
  type WorkerResponse =
    | { type: 'result'; width: number; height: number; data: ArrayBuffer; backend?: string }
    | { type: 'error'; detail?: string };

  class UpscaleError extends Error {
    readonly kind: ErrorKind;

    constructor(kind: ErrorKind, detail?: string) {
      super(detail ?? kind);
      this.name = 'UpscaleError';
      this.kind = kind;
    }
  }

  let { locale = 'en' }: { locale?: Locale } = $props();
  let sourceFile = $state<File>();
  let sourceUrl = $state('');
  let outputUrl = $state('');
  let sourceDimensions = $state<Dimensions>();
  let outputDimensions = $state<Dimensions>();
  let outputFactor = $state<Factor>();
  let outputEngine = $state('');
  let outputBytes = $state(0);
  let decodedSource: ImageBitmap | undefined;
  let options = $state<T32UpscaleOptions>(T32UpscaleOptionsSchema.parse({}));
  const method = $derived(options.method);
  const factor = $derived(options.factor);
  let busy = $state(false);
  let status = $state('');
  let error = $state<UpscaleError>();
  let latency = $state(0);
  let tier2SupportIssue = $state('');
  let tier2Downloading = $state(false);
  let tier2CanCancelDownload = $state(false);
  let tier2CheckingRuntime = $state(false);
  let tier2DownloadBytes = $state(0);
  let tier2DownloadSource = $state<'primary' | 'fallback'>('primary');
  let tier2Status = $state('');
  let tier2Error = $state('');
  let tier2Sources = $state<Partial<Record<T32ModelFactor, T32ModelSources>>>({});
  let tier2Loaded = $state<{ factor: T32ModelFactor }>();
  let activeWorker: Worker | undefined;
  let rejectActiveWorker: ((reason: unknown) => void) | undefined;
  let tier2DownloadAbort: AbortController | undefined;
  let currentTask = 0;

  const selectedTier2Model = $derived(T32_MODELS[factor]);
  const selectedTier2Sources = $derived(tier2Sources[factor]);
  const selectedTier2Loaded = $derived(tier2Loaded?.factor === factor);
  const tier2ProgressPercent = $derived(
    Math.min(100, Math.floor((tier2DownloadBytes / selectedTier2Model.sizeBytes) * 100)),
  );

  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);

  const optionValues = $derived({
    't32.method': options.method,
    't32.factor': options.factor,
  });
  // Translators: preserve DCCI, NEDI and the numeric scale factors.
  const optionDescriptions = $derived<Record<string, OptionDescription>>({
    't32.method': {
      ...t32UpscaleToolOptionDescriptions['t32.method']!,
      label: t('t32.method', 'Scaling method'),
    },
    't32.factor': {
      ...t32UpscaleToolOptionDescriptions['t32.factor']!,
      label: t('t32.factor', 'Scale factor'),
    },
  });
  const methodOptionDescriptions = $derived({ 't32.method': optionDescriptions['t32.method']! });
  const factorOptionDescriptions = $derived({ 't32.factor': optionDescriptions['t32.factor']! });

  function updateOption(path: string, value: unknown) {
    const candidate =
      path === 't32.method'
        ? { ...options, method: value }
        : path === 't32.factor'
          ? { ...options, factor: Number(value) }
          : options;
    const parsed = T32UpscaleOptionsSchema.safeParse(candidate);
    if (parsed.success) options = parsed.data;
  }

  onMount(() => {
    tier2SupportIssue = t32Tier2SupportIssue();
    for (const modelFactor of [2, 4] as const) {
      void loadT32ModelSources(modelFactor)
        .then((sources) => {
          tier2Sources = { ...tier2Sources, [modelFactor]: sources };
        })
        .catch((cause) => {
          tier2Sources = {
            ...tier2Sources,
            [modelFactor]: { primaryUrl: '', fallbackUrl: '' },
          };
          tier2Error = cause instanceof Error ? cause.message : String(cause);
        });
    }
  });
  const title = $derived(t('t32.title', 'Image Upscaler'));
  const description = $derived(
    t(
      't32.description',
      'Scale still PNG images by 2× or 4× with DCCI or NEDI, running locally in your browser.',
    ),
  );
  const metaDescription = $derived(
    t(
      't32.metaDescription',
      'Upscale a still PNG locally with DCCI or NEDI. Compare the result before downloading a bounded PNG output.',
    ),
  );
  const faqs = $derived([
    {
      question: t('t32.faq.input', 'Which images can I use?'),
      answer: t(
        't32.faq.inputAnswer',
        'Use a still PNG up to 32 MiB and 12 megapixels. Animated PNG files are rejected.',
      ),
    },
    {
      question: t('t32.faq.methods', 'What are DCCI and NEDI?'),
      answer: t(
        't32.faq.methodsAnswer',
        'They are deterministic classical interpolation methods. Their results vary by image; this page makes no universal quality claim.',
      ),
    },
    {
      question: t('t32.faq.limits', 'How large can the output be?'),
      answer: t(
        't32.faq.limitsAnswer',
        'The output is limited to 4 megapixels and 32 MiB. Choose a smaller scale factor or source image if a limit is exceeded.',
      ),
    },
    {
      question: t('t32.faq.privacy', 'Is my image uploaded?'),
      answer: t(
        't32.faq.privacyAnswer',
        'No. Decoding, scaling, preview, and PNG export happen in your browser.',
      ),
    },
  ]);

  const remedies: Readonly<Record<ErrorKind, string>> = {
    'unsupported-file': 'Choose a valid, still PNG image.',
    'file-too-large': 'Choose a PNG smaller than 32 MiB.',
    'image-too-large': 'Choose a source image smaller than 12 megapixels.',
    'output-too-large': 'Choose a lower scale factor or a smaller source image.',
    'decode-failed': 'Export a valid, non-animated PNG and choose it again.',
    'processing-failed': 'Try again with a smaller PNG. Your source image is unchanged.',
    cancelled: 'Choose a method and run the scaling again when ready.',
  };
  const errorLabels: Readonly<Record<ErrorKind, string>> = {
    'unsupported-file': 'The selected file is not a supported still PNG.',
    'file-too-large': 'The selected PNG exceeds the input file limit.',
    'image-too-large': 'The source image exceeds the pixel limit.',
    'output-too-large': 'The scaled output exceeds a pixel or file-size limit.',
    'decode-failed': 'The browser could not decode this PNG.',
    'processing-failed': 'The local scaling worker could not finish this image.',
    cancelled: 'Scaling was cancelled.',
  };

  function clearUrls() {
    for (const url of new Set([sourceUrl, outputUrl].filter(Boolean))) URL.revokeObjectURL(url);
    sourceUrl = '';
    outputUrl = '';
  }

  function clearDecodedSource() {
    decodedSource?.close();
    decodedSource = undefined;
  }

  function readPngDimensions(file: File): Promise<Dimensions> {
    return (async () => {
      if (file.size > MAX_FILE_BYTES) throw new UpscaleError('file-too-large');
      const header = new Uint8Array(await file.slice(0, 24).arrayBuffer());
      if (
        header.length < 24 ||
        !pngSignature.every((byte, index) => header[index] === byte) ||
        String.fromCharCode(...header.slice(12, 16)) !== 'IHDR'
      )
        throw new UpscaleError('unsupported-file');

      const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
      const width = view.getUint32(16);
      const height = view.getUint32(20);
      if (!width || !height || width * height > MAX_SOURCE_PIXELS)
        throw new UpscaleError('image-too-large');

      // Walk PNG chunk headers only, rejecting APNG before the browser decodes its first frame.
      let offset = 8;
      let foundImageData = false;
      for (let chunks = 0; chunks < 128 && offset + 8 <= file.size; chunks += 1) {
        const chunk = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
        if (chunk.length !== 8) break;
        const length = new DataView(chunk.buffer, chunk.byteOffset, 4).getUint32(0);
        const type = String.fromCharCode(...chunk.slice(4, 8));
        if (type === 'acTL')
          throw new UpscaleError('unsupported-file', 'Animated PNG is not supported.');
        if (type === 'IDAT') {
          foundImageData = true;
          break;
        }
        if (type === 'IEND') break;
        offset += length + 12;
        if (offset > file.size)
          throw new UpscaleError('unsupported-file', 'Invalid PNG chunk layout.');
      }
      if (!foundImageData) throw new UpscaleError('unsupported-file', 'The PNG has no image data.');
      return { width, height };
    })();
  }

  async function validatePng(file: File, expected: Dimensions): Promise<ImageBitmap> {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      if (bitmap.width !== expected.width || bitmap.height !== expected.height)
        throw new UpscaleError('decode-failed', 'Decoded dimensions do not match the PNG header.');
      return bitmap;
    } catch (cause) {
      bitmap?.close();
      if (cause instanceof UpscaleError) throw cause;
      throw new UpscaleError(
        'decode-failed',
        cause instanceof Error ? cause.message : String(cause),
      );
    }
  }

  async function decode(expected: Dimensions): Promise<ImageData> {
    try {
      const bitmap = decodedSource;
      if (!bitmap) throw new UpscaleError('decode-failed');
      if (bitmap.width !== expected.width || bitmap.height !== expected.height)
        throw new UpscaleError('decode-failed');
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new UpscaleError('decode-failed', 'Pixel canvas is unavailable.');
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    } catch (cause) {
      if (cause instanceof UpscaleError) throw cause;
      throw new UpscaleError(
        'decode-failed',
        cause instanceof Error ? cause.message : String(cause),
      );
    }
  }

  function runWorker(image: ImageData, selectedMethod: Method, selectedFactor: Factor) {
    return new Promise<ImageData>((resolve, reject) => {
      const worker = new Worker(new URL('../workers/t32-upscale-worker.ts', import.meta.url), {
        type: 'module',
      });
      activeWorker = worker;
      rejectActiveWorker = reject;
      const finish = () => {
        worker.terminate();
        if (activeWorker === worker) activeWorker = undefined;
        if (rejectActiveWorker === reject) rejectActiveWorker = undefined;
      };
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        finish();
        if (event.data.type === 'error') {
          reject(new UpscaleError('processing-failed', event.data.detail));
          return;
        }
        resolve(
          new ImageData(
            new Uint8ClampedArray(event.data.data),
            event.data.width,
            event.data.height,
          ),
        );
      };
      worker.onerror = (event) => {
        finish();
        reject(new UpscaleError('processing-failed', event.message));
      };
      const copy = image.data.slice().buffer;
      worker.postMessage(
        {
          width: image.width,
          height: image.height,
          data: copy,
          method: selectedMethod,
          factor: selectedFactor,
        },
        [copy],
      );
    });
  }

  function encodePng(image: ImageData): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) return Promise.reject(new UpscaleError('processing-failed'));
    context.putImageData(image, 0, 0);
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new UpscaleError('processing-failed', 'PNG export failed.')),
        'image/png',
      ),
    );
  }

  async function choose(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const task = ++currentTask;
    const previousWorker = activeWorker;
    const rejectPreviousWorker = rejectActiveWorker;
    activeWorker = undefined;
    rejectActiveWorker = undefined;
    previousWorker?.terminate();
    rejectPreviousWorker?.(new UpscaleError('cancelled'));
    clearUrls();
    clearDecodedSource();
    sourceFile = undefined;
    sourceDimensions = undefined;
    outputDimensions = undefined;
    outputFactor = undefined;
    outputEngine = '';
    outputBytes = 0;
    error = undefined;
    busy = false;
    latency = 0;
    status = '';
    let bitmap: ImageBitmap | undefined;
    try {
      const dimensions = await readPngDimensions(file);
      if (task !== currentTask) return;
      bitmap = await validatePng(file, dimensions);
      if (task !== currentTask) return;
      sourceFile = file;
      sourceDimensions = dimensions;
      decodedSource = bitmap;
      bitmap = undefined;
      sourceUrl = URL.createObjectURL(file);
      outputUrl = sourceUrl;
      outputBytes = file.size;
      status = t('t32.status.ready', 'PNG ready. Choose a method and scale factor.');
    } catch (cause) {
      if (task !== currentTask) return;
      error = cause instanceof UpscaleError ? cause : new UpscaleError('decode-failed');
    } finally {
      bitmap?.close();
    }
  }

  async function upscale() {
    if (!sourceFile || !sourceDimensions || busy) return;
    const task = ++currentTask;
    const dimensions = {
      width: sourceDimensions.width * factor,
      height: sourceDimensions.height * factor,
    };
    if (dimensions.width * dimensions.height > MAX_OUTPUT_PIXELS) {
      error = new UpscaleError('output-too-large');
      return;
    }
    error = undefined;
    busy = true;
    status = t('t32.status.working', 'Scaling locally…');
    latency = 0;
    const started = performance.now();
    try {
      const image = await decode(sourceDimensions);
      if (task !== currentTask) return;
      const result = await runWorker(image, method, factor);
      if (task !== currentTask) return;
      const blob = await encodePng(result);
      if (task !== currentTask) return;
      if (blob.size > MAX_OUTPUT_BYTES) throw new UpscaleError('output-too-large');
      const nextUrl = URL.createObjectURL(blob);
      if (outputUrl && outputUrl !== sourceUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = nextUrl;
      outputBytes = blob.size;
      outputDimensions = { width: result.width, height: result.height };
      outputFactor = factor;
      outputEngine = method;
      latency = performance.now() - started;
      status = t(
        't32.status.done',
        'Scaled output: {value} pixels.',
        `${result.width} × ${result.height}`,
      );
    } catch (cause) {
      if (task !== currentTask) return;
      error = cause instanceof UpscaleError ? cause : new UpscaleError('processing-failed');
    } finally {
      if (task === currentTask) busy = false;
    }
  }

  function tier2RuntimeAvailable(): boolean {
    tier2SupportIssue = t32Tier2SupportIssue();
    return !tier2SupportIssue;
  }

  async function loadOrDownloadTier2Model() {
    if (tier2Downloading || busy) return;
    tier2Error = '';
    tier2Status = '';
    if (!tier2RuntimeAvailable()) return;
    const selectedFactor = factor;
    const definition = T32_MODELS[selectedFactor];
    tier2Downloading = true;
    tier2CanCancelDownload = false;
    tier2DownloadBytes = 0;
    try {
      tier2Status = t('t32.tier2.checking', 'Checking this browser for a previously saved model…');
      let modelBytes = await readCachedT32Model(definition);
      if (!modelBytes) {
        const sources: T32ModelSources = await loadT32ModelSources(selectedFactor);
        if (!sources.primaryUrl) {
          throw new Error('A primary model URL is not configured for this deployment.');
        }
        const storage = await navigator.storage?.estimate();
        if (
          storage?.quota !== undefined &&
          storage.usage !== undefined &&
          storage.quota - storage.usage < definition.sizeBytes + 8 * 1024 * 1024
        ) {
          throw new Error('There is not enough browser storage available to save this model.');
        }

        tier2DownloadAbort = new AbortController();
        tier2CanCancelDownload = true;
        tier2Status = t('t32.tier2.downloading', 'Downloading the experimental model…');
        modelBytes = await downloadAndCacheT32Model(
          definition,
          sources,
          tier2DownloadAbort.signal,
          (progress) => {
            tier2DownloadBytes = progress.receivedBytes;
            tier2DownloadSource = progress.source;
            tier2Status =
              progress.source === 'fallback'
                ? t(
                    't32.tier2.fallback',
                    'The primary host was unavailable. Downloading from the configured backup host…',
                  )
                : t('t32.tier2.downloading', 'Downloading the experimental model…');
          },
        );
      } else {
        tier2DownloadBytes = definition.sizeBytes;
      }
      tier2CanCancelDownload = false;
      tier2Status = t(
        't32.tier2.runtimeCheck',
        'Model bytes are verified. Checking browser runtime with a small local inference…',
      );
      tier2CheckingRuntime = true;
      const smoke = await runTier2Worker(new ImageData(8, 12), definition, modelBytes);
      if (smoke.image.width !== 8 * selectedFactor || smoke.image.height !== 12 * selectedFactor) {
        throw new Error('The browser runtime smoke returned an unexpected output size.');
      }
      tier2Loaded = { factor: selectedFactor };
      tier2DownloadBytes = definition.sizeBytes;
      tier2Status = t(
        't32.tier2.verified',
        'Model size and SHA-256 are verified, and a small browser runtime inference passed. The model is saved in this browser and ready to use.',
      );
    } catch (cause) {
      tier2DownloadBytes = 0;
      if (tier2DownloadAbort?.signal.aborted) {
        tier2Status = t('t32.tier2.cancelled', 'Model download cancelled. Tier 1 remains ready.');
      } else {
        tier2Status = '';
        tier2Error = cause instanceof Error ? cause.message : String(cause);
      }
    } finally {
      tier2Downloading = false;
      tier2CanCancelDownload = false;
      tier2CheckingRuntime = false;
      tier2DownloadAbort = undefined;
    }
  }

  function cancelTier2Download() {
    tier2DownloadAbort?.abort();
  }

  function runTier2Worker(
    image: ImageData,
    definition: T32ModelDefinition,
    modelBytes: Uint8Array,
  ): Promise<{ image: ImageData; backend: string }> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL('../workers/t32-upscale-tier2-worker.ts', import.meta.url),
        { type: 'module' },
      );
      activeWorker = worker;
      rejectActiveWorker = reject;
      const finish = () => {
        worker.terminate();
        if (activeWorker === worker) activeWorker = undefined;
        if (rejectActiveWorker === reject) rejectActiveWorker = undefined;
      };
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        finish();
        if (event.data.type === 'error') {
          reject(new UpscaleError('processing-failed', event.data.detail));
          return;
        }
        resolve({
          image: new ImageData(
            new Uint8ClampedArray(event.data.data),
            event.data.width,
            event.data.height,
          ),
          backend: event.data.backend ?? 'WASM',
        });
      };
      worker.onerror = (event) => {
        finish();
        reject(new UpscaleError('processing-failed', event.message));
      };
      const pixels = image.data.slice().buffer;
      const registeredModel = modelBytes.buffer as ArrayBuffer;
      if (modelBytes.byteOffset !== 0 || modelBytes.byteLength !== registeredModel.byteLength) {
        finish();
        reject(
          new UpscaleError('processing-failed', 'The verified model data has an invalid buffer.'),
        );
        return;
      }
      worker.postMessage(
        {
          width: image.width,
          height: image.height,
          data: pixels,
          modelData: registeredModel,
          variant: definition.variant,
          modelSizeBytes: definition.sizeBytes,
        },
        [pixels, registeredModel],
      );
    });
  }

  async function upscaleWithTier2() {
    if (!sourceFile || !sourceDimensions || !tier2Loaded || busy || tier2Downloading) return;
    if (!tier2RuntimeAvailable()) return;
    const definition = T32_MODELS[factor];
    if (tier2Loaded.factor !== factor) {
      tier2Error = `Load the ${factor}× model before running it.`;
      return;
    }
    const dimensions = {
      width: sourceDimensions.width * factor,
      height: sourceDimensions.height * factor,
    };
    if (dimensions.width * dimensions.height > MAX_OUTPUT_PIXELS) {
      error = new UpscaleError('output-too-large');
      return;
    }
    const task = ++currentTask;
    error = undefined;
    tier2Error = '';
    busy = true;
    status = t('t32.tier2.inference', 'Running the experimental AI model locally…');
    latency = 0;
    const started = performance.now();
    try {
      const image = await decode(sourceDimensions);
      if (task !== currentTask) return;
      const modelBytes = await readCachedT32Model(definition);
      if (!modelBytes)
        throw new Error(
          'The verified model is no longer available in browser storage. Load it again.',
        );
      const result = await runTier2Worker(image, definition, modelBytes);
      if (task !== currentTask) return;
      const blob = await encodePng(result.image);
      if (task !== currentTask) return;
      if (blob.size > MAX_OUTPUT_BYTES) throw new UpscaleError('output-too-large');
      const nextUrl = URL.createObjectURL(blob);
      if (outputUrl && outputUrl !== sourceUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = nextUrl;
      outputBytes = blob.size;
      outputDimensions = { width: result.image.width, height: result.image.height };
      outputFactor = factor;
      outputEngine = 'realesrgan';
      latency = performance.now() - started;
      status = t(
        't32.tier2.output',
        'Experimental AI output: {value}.',
        `${result.image.width} × ${result.image.height} pixels · ${result.backend}`,
      );
    } catch (cause) {
      if (task !== currentTask) return;
      if (cause instanceof UpscaleError && cause.kind === 'output-too-large') {
        error = cause;
      } else {
        const detail = cause instanceof Error ? cause.message : String(cause);
        tier2Error = `The experimental AI model could not run in this browser. ${detail}`;
      }
    } finally {
      if (task === currentTask) busy = false;
    }
  }

  function cancel() {
    if (!busy) return;
    currentTask += 1;
    const reject = rejectActiveWorker;
    rejectActiveWorker = undefined;
    activeWorker?.terminate();
    activeWorker = undefined;
    busy = false;
    status = '';
    error = new UpscaleError('cancelled');
    reject?.(error);
  }

  function download() {
    if (!sourceFile || !outputUrl) return;
    const base = sourceFile.name.replace(/\.png$/iu, '') || 'upscaled-image';
    const name =
      outputDimensions && outputEngine && outputFactor
        ? `${base}-${outputEngine}-${outputFactor}x.png`
        : sourceFile.name;
    const anchor = document.createElement('a');
    anchor.href = outputUrl;
    anchor.download = name;
    anchor.click();
  }

  onDestroy(() => {
    currentTask += 1;
    tier2DownloadAbort?.abort();
    rejectActiveWorker?.(new UpscaleError('cancelled'));
    activeWorker?.terminate();
    rejectActiveWorker = undefined;
    activeWorker = undefined;
    clearDecodedSource();
    clearUrls();
  });
</script>

<header class="tool-header">
  <a class="logo" href="/">ctimg</a>
  <nav>
    <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('nav.convert', 'Convert')}</a>
    <a href={locale === 'en' ? '/compress' : `/${locale}/compress`}
      >{t('nav.compress', 'Compress')}</a
    >
    <a href={locale === 'en' ? '/resize' : `/${locale}/resize`}>{t('nav.resize', 'Resize')}</a>
  </nav>
  <span class="privacy">{t('privacy.badge', 'Local only')}</span>
</header>

<main
  class="tool-page"
  lang={locale === 'en' ? 'en' : locale}
  dir={locale === 'ar' ? 'rtl' : 'ltr'}
>
  <section class="tool-intro">
    <p class="eyebrow">{t('workspace.eyebrow', 'Local image instrument')}</p>
    <h1>{title}</h1>
    <p>{description}</p>
    <p class="privacy-copy">
      {t('privacy.copy', 'Processed on your device. Nothing is uploaded.')}
    </p>
    <label class="file-entry">
      <span>{sourceFile?.name ?? t('t32.choose', 'Choose a still PNG image')}</span>
      <input
        type="file"
        accept="image/png,.png"
        aria-describedby="t32-file-help"
        data-testid="t32-file-input"
        disabled={busy || tier2CheckingRuntime}
        onchange={choose}
      />
    </label>
    <p id="t32-file-help" class="file-help">
      {t(
        't32.fileHelp',
        'Still PNG only · 32 MiB maximum · 12 megapixels maximum · animated PNG is rejected.',
      )}
    </p>
  </section>

  <section class="workspace" aria-busy={busy || tier2CheckingRuntime}>
    <div class="canvas-panel">
      {#if sourceUrl && outputUrl}
        <CompareCanvas
          beforeUrl={sourceUrl}
          afterUrl={outputUrl}
          alt={t('t32.previewAlt', 'PNG image before and after DCCI or NEDI upscaling')}
          {locale}
        />
      {:else}
        <div class="empty-canvas">
          <p>{t('workspace.empty', 'Your before-and-after preview appears here.')}</p>
        </div>
      {/if}
    </div>
    <div class="options-panel" role="region" aria-labelledby="t32-options-heading">
      <h2 id="t32-options-heading">{t('workspace.options', 'Options')}</h2>
      <fieldset class="t32-option-group" disabled={busy || tier2CheckingRuntime}>
        <legend class="t32-visually-hidden">{t('workspace.options', 'Options')}</legend>
        <GeneratedControls
          {locale}
          descriptions={methodOptionDescriptions}
          values={optionValues}
          onChange={updateOption}
        />
        <fieldset class="t32-option-group" disabled={tier2Downloading}>
          <legend class="t32-visually-hidden">{t('t32.factor', 'Scale factor')}</legend>
          <GeneratedControls
            {locale}
            descriptions={factorOptionDescriptions}
            values={optionValues}
            onChange={updateOption}
          />
        </fieldset>
      </fieldset>
      {#if sourceDimensions}
        <p data-testid="t32-source-dimensions">
          {t('t32.sourceDimensions', 'Source dimensions')}: {sourceDimensions.width} × {sourceDimensions.height}
        </p>
      {/if}
      {#if outputDimensions}
        <p data-testid="t32-output-dimensions">
          {t('t32.outputDimensions', 'Output dimensions')}: {outputDimensions.width} × {outputDimensions.height}
        </p>
      {/if}
      {#if status}<p role="status" aria-live="polite" data-testid="t32-status">{status}</p>{/if}
      {#if busy}
        <button class="button" type="button" data-testid="t32-cancel" onclick={cancel}
          >{t('t32.cancel', 'Cancel scaling')}</button
        >
      {/if}
      {#if error}
        <p role="alert" data-testid="t32-error" data-error-kind={error.kind}>
          <strong>{t('t32.error.title', 'Image upscaling could not finish')}</strong>
          <span
            >{t(
              `t32.error.${error.kind}`,
              error.message === error.kind ? errorLabels[error.kind] : error.message,
            )}</span
          >
          <span>{t(`t32.remedy.${error.kind}`, remedies[error.kind])}</span>
        </p>
      {/if}
      <p class="t32-limits">
        {t(
          't32.limits',
          'Output is limited to 4 megapixels and 32 MiB. New PNG output does not retain source metadata.',
        )}
      </p>
      <section class="tier2-panel" aria-labelledby="t32-tier2-heading" data-testid="t32-tier2">
        <h3 id="t32-tier2-heading">{t('t32.tier2.heading', 'Experimental advanced AI model')}</h3>
        <p>
          {t(
            't32.tier2.description',
            'Tier 1 is ready immediately. Real-ESRGAN is an experimental alternative; measured synthetic results did not show a general quality win. The selected file is',
          )}
          <strong> {selectedTier2Model.sizeBytes.toLocaleString()} bytes </strong>
          {t(
            't32.tier2.downloadDisclosure',
            'and downloads only after you choose it. The browser checks support after download and keeps the file in local browser storage. Review the output before using it.',
          )}
        </p>
        <p class="tier2-attribution">
          {t(
            't32.tier2.attribution',
            'Real-ESRGAN by xinntao; BSD-3-Clause per the publisher model card. The optional model stays on this device after download.',
          )}
        </p>
        {#if tier2SupportIssue}
          <p data-testid="t32-tier2-unsupported">
            {tier2SupportIssue}
            {t('t32.tier2.tier1Available', 'Tier 1 remains available.')}
          </p>
        {:else if !selectedTier2Sources}
          <p data-testid="t32-tier2-config-loading">
            {t('t32.tier2.configLoading', 'Checking whether this deployment has a model source…')}
          </p>
        {:else if selectedTier2Sources && !selectedTier2Sources.primaryUrl}
          <p data-testid="t32-tier2-unconfigured">
            {t(
              't32.tier2.unconfigured',
              'No primary model URL is configured for this deployment. Tier 1 remains available.',
            )}
          </p>
        {:else if selectedTier2Loaded}
          <p role="status" data-testid="t32-tier2-ready">
            {t(
              't32.tier2.ready',
              'The verified {value}× model is saved in this browser. Runtime support is checked when you run it.',
              factor,
            )}
          </p>
        {/if}
        {#if tier2Downloading && !tier2CheckingRuntime}
          <progress
            data-testid="t32-tier2-progress"
            value={tier2DownloadBytes}
            max={selectedTier2Model.sizeBytes}
            aria-label={t('t32.tier2.progressLabel', 'Experimental model download progress')}
          ></progress>
          <span data-testid="t32-tier2-progress-text">
            {tier2ProgressPercent}% · {tier2DownloadBytes.toLocaleString()} /
            {selectedTier2Model.sizeBytes.toLocaleString()} bytes
            {tier2DownloadSource === 'fallback' ? ` · ${t('t32.tier2.backup', 'backup host')}` : ''}
          </span>
        {/if}
        {#if tier2Status}<p role="status" aria-live="polite" data-testid="t32-tier2-status">
            {tier2Status}
          </p>{/if}
        {#if tier2Error}
          <p role="alert" data-testid="t32-tier2-error">
            {tier2Error}
            {t('t32.tier2.tier1Available', 'Tier 1 remains available.')}
          </p>
        {/if}
        {#if !tier2SupportIssue && selectedTier2Sources?.primaryUrl && !selectedTier2Loaded}
          <button
            class="button"
            type="button"
            data-testid="t32-tier2-download"
            disabled={busy || tier2Downloading || tier2CheckingRuntime}
            onclick={loadOrDownloadTier2Model}
          >
            {t('t32.tier2.downloadButton', 'Load saved or download {value}× model', factor)}
            ({Math.ceil(selectedTier2Model.sizeBytes / (1024 * 1024))} MiB)
          </button>
        {/if}
        {#if tier2Downloading && tier2CanCancelDownload}
          <button
            class="button"
            type="button"
            data-testid="t32-tier2-cancel"
            onclick={cancelTier2Download}
          >
            {t('t32.tier2.cancelDownload', 'Cancel model download')}
          </button>
        {/if}
        {#if sourceFile && selectedTier2Loaded}
          <button
            class="button"
            type="button"
            data-testid="t32-tier2-run"
            disabled={busy || tier2Downloading}
            onclick={upscaleWithTier2}
          >
            {t('t32.tier2.run', 'Run experimental AI model ({value}×)', factor)}
          </button>
        {/if}
      </section>
    </div>
  </section>

  <footer class="action-bar">
    <div>
      <strong data-testid="t32-size-summary">
        {sourceFile
          ? `${Math.round(sourceFile.size / 1000)} KB → ${Math.round(outputBytes / 1000)} KB`
          : t('status.choose', 'Choose an image to begin')}
      </strong>
      <span data-testid="t32-latency">
        {latency
          ? t('t32.status.latency', 'Scaled and encoded in {value} ms', Math.round(latency))
          : '\u00A0'}
      </span>
    </div>
    <div class="action-buttons">
      <button
        class="button"
        type="button"
        data-testid="t32-run"
        disabled={!sourceFile || busy || tier2CheckingRuntime}
        onclick={upscale}>{t('t32.run', 'Upscale')}</button
      >
      <button
        class="button primary"
        type="button"
        data-testid="t32-download"
        disabled={!outputUrl || busy || tier2CheckingRuntime}
        onclick={download}>{t('workspace.download', 'Download PNG')}</button
      >
    </div>
  </footer>

  <ToolPageCompletion
    {locale}
    route="upscale"
    {title}
    description={metaDescription}
    formatNote={t(
      't32.formatNote',
      'This page accepts still PNG images and uses DCCI or NEDI in a local worker. Model-based Tier 2 is separate; no model files are downloaded here. Inspect output before saving; source metadata is not copied into a newly encoded PNG.',
    )}
    {faqs}
  />
</main>

<style>
  .t32-option-group {
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .t32-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
