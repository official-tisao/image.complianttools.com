<script lang="ts">
  import { onDestroy } from 'svelte';
  import CompareCanvas from './CompareCanvas.svelte';
  import ToolPageCompletion from './ToolPageCompletion.svelte';
  import { translate, type Locale } from './i18n';

  const MAX_FILE_BYTES = 32 * 1024 * 1024;
  const MAX_SOURCE_PIXELS = 12_000_000;
  const MAX_OUTPUT_PIXELS = 4_000_000;
  const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

  type Method = 'dcci' | 'nedi';
  type Factor = 2 | 4;
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
    | { type: 'result'; width: number; height: number; data: ArrayBuffer }
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
  let outputMethod = $state<Method>();
  let outputFactor = $state<Factor>();
  let outputBytes = $state(0);
  let method = $state<Method>('dcci');
  let factor = $state<Factor>(2);
  let busy = $state(false);
  let status = $state('');
  let error = $state<UpscaleError>();
  let latency = $state(0);
  let activeWorker: Worker | undefined;
  let rejectActiveWorker: ((reason: unknown) => void) | undefined;
  let currentTask = 0;

  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
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

  async function validatePng(file: File, expected: Dimensions) {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      if (bitmap.width !== expected.width || bitmap.height !== expected.height)
        throw new UpscaleError('decode-failed', 'Decoded dimensions do not match the PNG header.');
    } catch (cause) {
      if (cause instanceof UpscaleError) throw cause;
      throw new UpscaleError(
        'decode-failed',
        cause instanceof Error ? cause.message : String(cause),
      );
    } finally {
      bitmap?.close();
    }
  }

  async function decode(file: File, expected: Dimensions): Promise<ImageData> {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
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
    } finally {
      bitmap?.close();
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
    sourceFile = undefined;
    sourceDimensions = undefined;
    outputDimensions = undefined;
    outputMethod = undefined;
    outputFactor = undefined;
    outputBytes = 0;
    error = undefined;
    busy = false;
    latency = 0;
    status = '';
    try {
      const dimensions = await readPngDimensions(file);
      if (task !== currentTask) return;
      await validatePng(file, dimensions);
      if (task !== currentTask) return;
      sourceFile = file;
      sourceDimensions = dimensions;
      sourceUrl = URL.createObjectURL(file);
      outputUrl = sourceUrl;
      outputBytes = file.size;
      status = t('t32.status.ready', 'PNG ready. Choose a method and scale factor.');
    } catch (cause) {
      if (task !== currentTask) return;
      error = cause instanceof UpscaleError ? cause : new UpscaleError('decode-failed');
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
      const image = await decode(sourceFile, sourceDimensions);
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
      outputMethod = method;
      outputFactor = factor;
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
      outputDimensions && outputMethod && outputFactor
        ? `${base}-${outputMethod}-${outputFactor}x.png`
        : sourceFile.name;
    const anchor = document.createElement('a');
    anchor.href = outputUrl;
    anchor.download = name;
    anchor.click();
  }

  onDestroy(() => {
    currentTask += 1;
    rejectActiveWorker?.(new UpscaleError('cancelled'));
    activeWorker?.terminate();
    rejectActiveWorker = undefined;
    activeWorker = undefined;
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
        disabled={busy}
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

  <section class="workspace" aria-busy={busy}>
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
      <label for="t32-method">{t('t32.method', 'Scaling method')}</label>
      <select id="t32-method" data-testid="t32-method" bind:value={method} disabled={busy}>
        <option value="dcci">DCCI</option>
        <option value="nedi">NEDI</option>
      </select>
      <label for="t32-factor">{t('t32.factor', 'Scale factor')}</label>
      <select id="t32-factor" data-testid="t32-factor" bind:value={factor} disabled={busy}>
        <option value={2}>2×</option>
        <option value={4}>4×</option>
      </select>
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
        disabled={!sourceFile || busy}
        onclick={upscale}>{t('t32.run', 'Upscale')}</button
      >
      <button
        class="button primary"
        type="button"
        data-testid="t32-download"
        disabled={!outputUrl || busy}
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
