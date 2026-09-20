<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    PixelArtToolError,
    PixelArtToolOptionsSchema,
    pixelArtToolOptionDescriptions,
    type PixelArtToolErrorKind,
    type PixelArtToolOptions,
  } from '@complianttools/image-engine/schemas/pixel-art';
  import type { ScaleFactor } from '@complianttools/image-engine/cv/pixel-art';
  import CompareCanvas from './CompareCanvas.svelte';
  import GeneratedControls from './GeneratedControls.svelte';
  import ToolPageCompletion from './ToolPageCompletion.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  const MAX_FILE_BYTES = 32 * 1024 * 1024;
  const MAX_SOURCE_PIXELS = 20_000_000;
  const MAX_OUTPUT_PIXELS = 16_000_000;
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

  type PngDimensions = { width: number; height: number };
  type WorkerResponse =
    | { type: 'progress'; percent: number }
    | { type: 'result'; width: number; height: number; data: ArrayBuffer }
    | {
        type: 'error';
        kind: PixelArtToolErrorKind;
        detail?: string;
        remedy?: string;
      };

  let { locale = 'en' }: { locale?: Locale } = $props();
  let values = $state<Record<string, unknown>>(PixelArtToolOptionsSchema.parse({}));
  let sourceFile = $state<File | undefined>();
  let sourceUrl = $state('');
  let outputUrl = $state('');
  let sourceBytes = $state(0);
  let outputBytes = $state(0);
  let outputDimensions = $state<PngDimensions | undefined>();
  let busy = $state(false);
  let progress = $state(0);
  let latency = $state(0);
  let status = $state('');
  let error = $state<PixelArtToolError | undefined>();
  let decodedPixels: ImageData | undefined;
  let activeWorker: Worker | undefined;
  let currentTask = 0;

  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const title = $derived(t('t70.title', 'Pixel-Art Upscaler'));
  const description = $derived(
    t(
      't70.description',
      'Scale still PNG pixel art by 2×, 3×, or 4× with a deterministic local palette-aware scaler. The original file stays unchanged until you enable scaling.',
    ),
  );
  const metaDescription = $derived(
    t(
      't70.metaDescription',
      'Upscale still PNG pixel art locally by 2×, 3×, or 4×. Inspect a lossless PNG preview before downloading.',
    ),
  );
  const optionDescriptions = $derived(localizeOptions(locale, pixelArtToolOptionDescriptions));
  const options = $derived(PixelArtToolOptionsSchema.parse(values));
  const controlValues = $derived({
    'pixelArt.enabled': values.enabled,
    'pixelArt.factor': values.factor,
  });
  const faqs = $derived([
    {
      question: t('t70.faq.input', 'Which files can I use?'),
      answer: t(
        't70.faq.inputAnswer',
        'This page accepts still PNG images up to 32 MiB and 20 megapixels. Animated PNG files are rejected instead of silently scaling only one frame.',
      ),
    },
    {
      question: t('t70.faq.factors', 'Which scale factors are supported?'),
      answer: t(
        't70.faq.factorsAnswer',
        'Choose integer 2×, 3×, or 4×. The output is limited to 16 megapixels so the browser does not allocate an unbounded canvas.',
      ),
    },
    {
      question: t('t70.faq.alpha', 'Can transparent edges change?'),
      answer: t(
        't70.faq.alphaAnswer',
        'Yes. The edge-continuation rule can change intermediate alpha around transparent boundaries. Inspect the preview before downloading.',
      ),
    },
    {
      question: t('t70.faq.quality', 'Does the scaler improve every sprite?'),
      answer: t(
        't70.faq.qualityAnswer',
        'No broad sprite-quality claim is established. The current comparison uses four self-generated fixtures; results can depend on the sprite palette and edge pattern.',
      ),
    },
    {
      question: t('t70.faq.metadata', 'What happens to metadata?'),
      answer: t(
        't70.faq.metadataAnswer',
        'Scaled output is encoded as a new PNG from pixels, so source metadata is not copied. With scaling off, the original file is downloaded byte-for-byte unchanged.',
      ),
    },
  ]);

  const errorFallback: Readonly<Record<PixelArtToolErrorKind, string>> = {
    'unsupported-file': 'Choose a valid PNG image; this tool currently accepts PNG only.',
    'file-too-large': 'Choose a PNG smaller than 32 MiB.',
    'image-too-large':
      'Choose a smaller image or use a lower scale factor so the output stays within 16 megapixels.',
    'invalid-options': 'Choose a scale factor of 2×, 3×, or 4×, then try again.',
    'decode-failed': 'Export a valid, non-animated PNG and choose it again.',
    'processing-failed':
      'Try a smaller PNG or a lower scale factor. Your original file is unchanged.',
  };
  const detailFallback: Readonly<Record<PixelArtToolErrorKind, string>> = {
    'unsupported-file': 'The selected file is not a supported still PNG.',
    'file-too-large': 'The selected PNG exceeds the 32 MiB file limit.',
    'image-too-large': 'The source or scaled output exceeds the pixel limit.',
    'invalid-options': 'The selected scale options are invalid.',
    'decode-failed': 'The browser could not decode this PNG.',
    'processing-failed': 'The pixel-art scaler could not finish this image.',
  };

  function clearUrls() {
    const urls = new Set([sourceUrl, outputUrl].filter(Boolean));
    for (const url of urls) URL.revokeObjectURL(url);
    sourceUrl = '';
    outputUrl = '';
  }

  function setError(next: PixelArtToolError) {
    error = next;
    busy = false;
    status = '';
    progress = 0;
    outputUrl = sourceUrl;
    outputBytes = sourceBytes;
    outputDimensions = undefined;
  }

  function throwTyped(kind: PixelArtToolErrorKind, detail?: string): never {
    throw new PixelArtToolError(kind, undefined, detail);
  }

  async function readPngDimensions(file: File): Promise<PngDimensions> {
    if (file.size > MAX_FILE_BYTES) throwTyped('file-too-large');
    const header = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (
      header.length < 24 ||
      !pngSignature.every((byte, index) => header[index] === byte) ||
      String.fromCharCode(...header.slice(12, 16)) !== 'IHDR'
    ) {
      throwTyped('unsupported-file', 'The file does not have a valid PNG header.');
    }

    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (!width || !height || width * height > MAX_SOURCE_PIXELS) throwTyped('image-too-large');

    // APNG declares animation with an acTL chunk before image data. Inspect chunk headers only.
    let offset = 8;
    let reachedImageData = false;
    for (let chunks = 0; chunks < 128 && offset + 8 <= file.size; chunks += 1) {
      const chunkHeader = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      if (chunkHeader.length !== 8) break;
      const chunkView = new DataView(chunkHeader.buffer, chunkHeader.byteOffset, 4);
      const length = chunkView.getUint32(0);
      const type = String.fromCharCode(...chunkHeader.slice(4, 8));
      if (type === 'acTL') {
        throwTyped(
          'unsupported-file',
          'Animated PNG is not supported; export a single still frame.',
        );
      }
      if (type === 'IDAT') {
        reachedImageData = true;
        break;
      }
      if (type === 'IEND') break;
      offset += length + 12;
      if (offset > file.size) throwTyped('unsupported-file', 'The PNG chunk layout is invalid.');
    }
    if (!reachedImageData) throwTyped('unsupported-file', 'The PNG has no image-data chunk.');
    return { width, height };
  }

  async function validatePngImage(file: File, expected: PngDimensions) {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      if (bitmap.width !== expected.width || bitmap.height !== expected.height)
        throwTyped('decode-failed', 'The decoded PNG dimensions do not match its header.');
    } catch (cause) {
      if (cause instanceof PixelArtToolError) throw cause;
      throwTyped('decode-failed', cause instanceof Error ? cause.message : String(cause));
    } finally {
      bitmap?.close();
    }
  }

  async function decode(
    file: File,
    expected: PngDimensions,
    factor: ScaleFactor,
  ): Promise<ImageData> {
    if (expected.width * factor * expected.height * factor > MAX_OUTPUT_PIXELS)
      throw new PixelArtToolError('image-too-large');
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      if (bitmap.width !== expected.width || bitmap.height !== expected.height)
        throwTyped('decode-failed', 'The decoded PNG dimensions do not match its header.');
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context)
        throwTyped('decode-failed', 'This browser could not create a pixel-reading canvas.');
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    } catch (cause) {
      if (cause instanceof PixelArtToolError) throw cause;
      throw new PixelArtToolError(
        'decode-failed',
        undefined,
        cause instanceof Error ? cause.message : String(cause),
      );
    } finally {
      bitmap?.close();
    }
  }

  function runWorker(image: ImageData, factor: ScaleFactor): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../workers/pixel-art-worker.ts', import.meta.url), {
        type: 'module',
      });
      activeWorker = worker;
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const result = event.data;
        if (result.type === 'progress') {
          progress = result.percent;
          return;
        }
        worker.terminate();
        if (activeWorker === worker) activeWorker = undefined;
        if (result.type === 'error') {
          reject(new PixelArtToolError(result.kind, result.remedy, result.detail));
          return;
        }
        resolve(new ImageData(new Uint8ClampedArray(result.data), result.width, result.height));
      };
      worker.onerror = (event) => {
        worker.terminate();
        if (activeWorker === worker) activeWorker = undefined;
        reject(new PixelArtToolError('processing-failed', undefined, event.message));
      };
      const copy = image.data.slice().buffer;
      worker.postMessage({ width: image.width, height: image.height, data: copy, factor }, [copy]);
    });
  }

  function encodePng(image: ImageData): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) return Promise.reject(new PixelArtToolError('processing-failed'));
    context.putImageData(image, 0, 0);
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new PixelArtToolError('processing-failed', undefined, 'PNG export failed.')),
        'image/png',
      ),
    );
  }

  async function updateOutput() {
    const task = ++currentTask;
    error = undefined;
    progress = 0;
    latency = 0;
    if (!sourceFile || !sourceUrl) return;

    const parsed = PixelArtToolOptionsSchema.safeParse(values);
    if (!parsed.success) {
      setError(
        new PixelArtToolError('invalid-options', undefined, parsed.error.issues[0]?.message),
      );
      return;
    }

    if (!parsed.data.enabled) {
      if (outputUrl && outputUrl !== sourceUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = sourceUrl;
      outputBytes = sourceFile.size;
      outputDimensions = undefined;
      status = t('t70.status.unchanged', 'Original PNG is unchanged.');
      busy = false;
      return;
    }

    busy = true;
    status = t('t70.status.working', 'Scaling pixel art…');
    const started = performance.now();
    try {
      const factor = Number(parsed.data.factor) as ScaleFactor;
      if (!decodedPixels) {
        const dimensions = await readPngDimensions(sourceFile);
        if (task !== currentTask) return;
        decodedPixels = await decode(sourceFile, dimensions, factor);
      }
      if (task !== currentTask) return;
      const result = await runWorker(decodedPixels, factor);
      if (task !== currentTask) return;
      const blob = await encodePng(result);
      if (task !== currentTask) return;
      const nextUrl = URL.createObjectURL(blob);
      if (outputUrl && outputUrl !== sourceUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = nextUrl;
      outputBytes = blob.size;
      outputDimensions = { width: result.width, height: result.height };
      latency = performance.now() - started;
      progress = 100;
      status = t(
        't70.status.done',
        'Scaled output dimensions: {value} pixels.',
        `${result.width} × ${result.height}`,
      );
    } catch (cause) {
      setError(
        cause instanceof PixelArtToolError
          ? cause
          : new PixelArtToolError('processing-failed', undefined, String(cause)),
      );
    } finally {
      if (task === currentTask) busy = false;
    }
  }

  async function choose(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const task = ++currentTask;
    activeWorker?.terminate();
    activeWorker = undefined;
    clearUrls();
    sourceFile = undefined;
    decodedPixels = undefined;
    outputDimensions = undefined;
    sourceBytes = 0;
    outputBytes = 0;
    error = undefined;
    busy = false;
    latency = 0;

    try {
      const dimensions = await readPngDimensions(file);
      if (task !== currentTask) return;
      await validatePngImage(file, dimensions);
      if (task !== currentTask) return;
      sourceFile = file;
      sourceBytes = file.size;
      sourceUrl = URL.createObjectURL(file);
      outputUrl = sourceUrl;
      outputBytes = file.size;
      status = t('t70.status.unchanged', 'Original PNG is unchanged.');
      if (PixelArtToolOptionsSchema.parse(values).enabled) await updateOutput();
    } catch (cause) {
      if (task !== currentTask) return;
      setError(
        cause instanceof PixelArtToolError
          ? cause
          : new PixelArtToolError('decode-failed', undefined, String(cause)),
      );
    }
  }

  function changeOption(path: string, value: unknown) {
    const key = path === 'pixelArt.enabled' ? 'enabled' : 'factor';
    values = { ...values, [key]: value };
    if (sourceFile) void updateOutput();
  }

  function download() {
    if (!outputUrl || !sourceFile) return;
    const basename = sourceFile.name.replace(/\.png$/iu, '') || 'pixel-art';
    const filename = options.enabled ? `${basename}-${options.factor}x.png` : sourceFile.name;
    const anchor = document.createElement('a');
    anchor.href = outputUrl;
    anchor.download = filename;
    anchor.click();
  }

  onDestroy(() => {
    activeWorker?.terminate();
    for (const url of new Set([sourceUrl, outputUrl].filter(Boolean))) URL.revokeObjectURL(url);
  });
</script>

<header class="tool-header">
  <a class="logo" href="/">ctimg</a>
  <nav>
    <a href="/convert">{t('nav.convert', 'Convert')}</a>
    <a href="/compress">{t('nav.compress', 'Compress')}</a>
    <a href="/resize">{t('nav.resize', 'Resize')}</a>
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
      <span>{sourceFile?.name ?? t('t70.choose', 'Choose a still PNG image')}</span>
      <input
        data-testid="t70-file-input"
        type="file"
        accept="image/png,.png"
        disabled={busy}
        aria-describedby="t70-file-help"
        onchange={choose}
      />
    </label>
    <p id="t70-file-help" class="file-help">
      {t(
        't70.fileHelp',
        'Still PNG only · 32 MiB maximum · 20 megapixels maximum · animated PNG is rejected.',
      )}
    </p>
  </section>

  <section class="workspace" aria-busy={busy}>
    <div class="canvas-panel">
      {#if sourceUrl && outputUrl}
        <CompareCanvas
          beforeUrl={sourceUrl}
          afterUrl={outputUrl}
          alt={t('t70.previewAlt', 'Pixel-art PNG before and after scaling')}
          {locale}
        />
      {:else}
        <div class="empty-canvas">
          <p>{t('workspace.empty', 'Your before-and-after preview appears here.')}</p>
        </div>
      {/if}
    </div>
    <div class="options-panel" role="region" aria-labelledby="t70-options-heading">
      <h2 id="t70-options-heading">{t('workspace.options', 'Options')}</h2>
      <fieldset disabled={busy}>
        <GeneratedControls
          descriptions={optionDescriptions}
          values={controlValues}
          onChange={changeOption}
          {locale}
        />
      </fieldset>
      {#if outputDimensions}
        <p data-testid="t70-output-dimensions">
          {t('t70.outputDimensions', 'Output dimensions')}: {outputDimensions.width} × {outputDimensions.height}
        </p>
      {/if}
      {#if status}
        <p role="status" aria-live="polite" data-testid="t70-status">{status}</p>
      {/if}
      {#if busy}
        <label class="t70-progress-label" for="t70-progress"
          >{t('t70.progress', 'Scaling progress')}</label
        >
        <progress id="t70-progress" max="100" value={progress} data-testid="t70-progress">
          {progress}%
        </progress>
      {/if}
      {#if error}
        <p role="alert" data-testid="t70-error" data-error-kind={error.kind}>
          <strong>{t('t70.error.title', 'Pixel-art scaling could not finish')}</strong>
          <span>{t(`t70.error.${error.kind}`, detailFallback[error.kind])}</span>
          <span>{t(`t70.remedy.${error.kind}`, error.remedy)}</span>
        </p>
      {/if}
      <p class="t70-limits">
        {t(
          't70.limits',
          'Scaled output is a new PNG and source metadata is not copied. Inspect transparent edges: intermediate alpha can change.',
        )}
      </p>
    </div>
  </section>

  <footer class="action-bar">
    <div>
      <strong data-testid="t70-size-summary">
        {sourceFile
          ? `${Math.round(sourceBytes / 1000)} KB → ${Math.round(outputBytes / 1000)} KB`
          : t('status.choose', 'Choose an image to begin')}
      </strong>
      <span data-testid="t70-latency">
        {latency
          ? t('t70.status.latency', 'Scaled and encoded in {value} ms', Math.round(latency))
          : '\u00A0'}
      </span>
    </div>
    <button
      class="button primary"
      type="button"
      data-testid="t70-download"
      disabled={!outputUrl || busy}
      onclick={download}>{t('workspace.download', 'Download')}</button
    >
  </footer>

  <ToolPageCompletion
    {locale}
    route="pixel-art-upscaler"
    {title}
    description={metaDescription}
    formatNote={t(
      't70.formatNote',
      'The page accepts still PNG and writes lossless PNG. Scaling is off by default and preserves the original file byte-for-byte. Enabling the clean-room scaler uses deterministic 2×/3×/4× rules; it does not establish broad sprite preference, and transparent-edge alpha can change. Processing, preview, and export are local after the page and its worker have loaded.',
    )}
    {faqs}
  />
</main>
