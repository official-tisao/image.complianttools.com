<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    HEIC_UNSUPPORTED_MESSAGE,
    decodeHeic,
    detectHeicMimeType,
    isHeicContainer,
  } from '@complianttools/image-engine/codecs/platform/heic-wasm';
  import { decodeHeicWithLibheifJs } from '@complianttools/image-engine/codecs/platform/heic-libheif';
  import { engineErrorMessage, isEngineError } from '@complianttools/image-engine/errors';
  import type { RasterImage } from '@complianttools/image-engine/types';
  import { translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/heic-converter' : `/${locale}/heic-converter`);
  const localized = (path: string) => (locale === 'en' ? path : `/${locale}${path}`);

  type Phase = 'idle' | 'ready' | 'decoding' | 'encoding' | 'done' | 'failed';
  let phase = $state<Phase>('idle');
  let statusMessage = $state('');
  let errorMessage = $state('');
  let selectedFile = $state<File | undefined>(undefined);
  let selectedBytes = $state<ArrayBuffer | undefined>(undefined);
  let selectedMime = $state('image/heic');
  let dragOver = $state(false);
  let convertGeneration = 0;

  type OutputFormat = 'png' | 'jpeg' | 'webp';
  let outputFormat = $state<OutputFormat>('png');

  let resultUrl = $state('');
  let resultName = $state('');
  let resultSize = $state(0);
  let resultDimensions = $state('');

  let fileInput = $state<HTMLInputElement>();

  const outputOptions: ReadonlyArray<{ value: OutputFormat; key: string; fallback: string }> = [
    { value: 'png', key: 'heic.format.png', fallback: 'PNG — lossless, universal' },
    { value: 'jpeg', key: 'heic.format.jpeg', fallback: 'JPEG — smaller, universal' },
    { value: 'webp', key: 'heic.format.webp', fallback: 'WebP — smaller, modern' },
  ];

  onDestroy(() => URL.revokeObjectURL(resultUrl));

  /** Bounded promise helper: rejects after the deadline so long-running
   * decoders (platform `ImageDecoder`, heic2any's libheif worker, animated
   * canvases) cannot hold this UI in 'decoding'/'encoding' forever. */
  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        window.setTimeout(() => reject(new Error(`HEIC timed out after ${ms}ms`)), ms),
      ),
    ]);
  }

  function resetResult() {
    URL.revokeObjectURL(resultUrl);
    resultUrl = '';
    resultName = '';
    resultSize = 0;
    resultDimensions = '';
  }

  function formatBytes(bytes: number) {
    return bytes >= 1_000_000
      ? `${(bytes / 1_000_000).toFixed(1)} MB`
      : `${Math.round(bytes / 1000)} KB`;
  }

  function clearSelection() {
    selectedFile = undefined;
    selectedBytes = undefined;
    phase = 'idle';
    statusMessage = '';
    errorMessage = '';
    resetResult();
    if (fileInput) fileInput.value = '';
  }

  async function acceptFile(file: File) {
    errorMessage = '';
    statusMessage = '';
    resetResult();
    if (
      !/\.(heic|heif)$/iu.test(file.name) &&
      !/^image\/heic$/iu.test(file.type) &&
      !/^image\/heif$/iu.test(file.type)
    ) {
      errorMessage = t('heic.invalidType', 'Please choose a .heic or .heif file.');
      selectedFile = undefined;
      selectedBytes = undefined;
      phase = 'failed';
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      errorMessage = t('heic.tooLarge', 'File is too large (max 200 MB).');
      selectedFile = undefined;
      selectedBytes = undefined;
      phase = 'failed';
      return;
    }
    try {
      const bytes = await file.arrayBuffer();
      if (!isHeicContainer(bytes)) {
        errorMessage = t(
          'heic.invalidContainer',
          'This file is not a valid HEIC or HEIF image. Renamed JPEG or AVIF files are rejected before decoding.',
        );
        selectedFile = undefined;
        selectedBytes = undefined;
        phase = 'failed';
        return;
      }
      selectedFile = file;
      selectedBytes = bytes;
      selectedMime = detectHeicMimeType(bytes);
      phase = 'ready';
      statusMessage = t(
        'heic.ready',
        'File ready. Choose an output format and click Convert image.',
      );
    } catch {
      errorMessage = t('heic.readError', 'The file could not be read. Try selecting it again.');
      selectedFile = undefined;
      selectedBytes = undefined;
      phase = 'failed';
    }
  }

  function handleFileSelect(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) {
      clearSelection();
      return;
    }
    void acceptFile(file);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      dragOver = false;
      void acceptFile(file);
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragOver = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
  }

  function rasterFromSource(source: unknown, width: number, height: number): RasterImage {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error(t('heic.canvasError', 'Your browser cannot create a local canvas.'));
    context.drawImage(source as never, 0, 0);
    return {
      width,
      height,
      colorSpace: 'srgb',
      bitDepth: 8,
      premultipliedAlpha: false,
      frames: [{ data: context.getImageData(0, 0, width, height).data, durationMs: 0 }],
    };
  }

  async function decodeWithNativeImagePipeline(bytes: ArrayBuffer): Promise<RasterImage> {
    const blob = new Blob([bytes], { type: detectHeicMimeType(bytes) });
    if (typeof globalThis.createImageBitmap === 'function') {
      try {
        const bitmap = await globalThis.createImageBitmap(blob);
        try {
          return rasterFromSource(bitmap, bitmap.width, bitmap.height);
        } finally {
          bitmap.close();
        }
      } catch {
        // Safari may support HEIC through its native image element but not createImageBitmap.
      }
    }
    const url = URL.createObjectURL(blob);
    try {
      const image = new globalThis.Image();
      image.src = url;
      await image.decode();
      return rasterFromSource(image, image.naturalWidth, image.naturalHeight);
    } catch {
      throw new Error(HEIC_UNSUPPORTED_MESSAGE);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function encodeOutput(image: RasterImage, format: OutputFormat): Promise<Blob> {
    if (format === 'png') {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error(t('heic.canvasError', 'Your browser cannot create a local canvas.'));
      context.putImageData(new ImageData(image.frames[0]!.data, image.width, image.height), 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error(t('heic.pngError', 'Unable to encode PNG locally.'))),
          'image/png',
        ),
      );
      return blob;
    }
    if (format === 'jpeg') {
      const { encodeRasterAsJpeg } = await import('@complianttools/image-engine/codecs/jsquash');
      const bytes = await encodeRasterAsJpeg(image, { quality: 90 });
      return new Blob([bytes], { type: 'image/jpeg' });
    }
    const { encodeRasterAsWebp } = await import('@complianttools/image-engine/codecs/jsquash');
    const bytes = await encodeRasterAsWebp(image, { quality: 90 });
    return new Blob([bytes], { type: 'image/webp' });
  }

  async function convert() {
    if (
      !selectedFile ||
      !selectedBytes ||
      !outputFormat ||
      phase === 'decoding' ||
      phase === 'encoding'
    )
      return;
    const generation = ++convertGeneration;
    phase = 'decoding';
    statusMessage = t('heic.decoding', 'Decoding your image…');
    errorMessage = '';
    resetResult();
    try {
      let image: RasterImage;
      // Use bounded promises so an unresponsive platform decoder or worker cannot
      // leave the UI stuck on 'Converting...' indefinitely.
      const decodeTimeoutMs = 60_000; // 60 s per decode attempt
      const encodeTimeoutMs = 30_000; // 30 s for re-encoding
      // Attempt WebCodecs ImageDecoder directly — it works on many browsers
      // even when isTypeSupported() returns false (licensed HEVC not required).
      try {
        image = await withTimeout(decodeHeic(selectedBytes), decodeTimeoutMs);
      } catch {
        // Fall back to native image pipeline (createImageBitmap / Image.decode)
        try {
          image = await withTimeout(decodeWithNativeImagePipeline(selectedBytes), decodeTimeoutMs);
        } catch {
          // Fall back to the bundled libheif WASM decoder — works without any
          // native browser HEIC support because it decodes entirely in WASM.
          try {
            image = await withTimeout(decodeHeicWithLibheifJs(selectedBytes), decodeTimeoutMs);
          } catch {
            // No available decoder — show useful error instead of hanging forever
            throw new Error(
              t(
                'heic.noDecoder',
                'No HEIC decoder available in this browser. Open the file on a device with HEIC support or export it as JPEG/PNG.',
              ),
            );
          }
        }
      }
      if (generation !== convertGeneration) return;
      const frame = image.frames[0];
      if (!frame) throw new Error(t('heic.noFrame', 'The HEIC decoder returned no image frame.'));
      phase = 'encoding';
      statusMessage = t('heic.encoding', 'Converting to {value}…', outputFormat.toUpperCase());
      const blob = await withTimeout(encodeOutput(image, outputFormat), encodeTimeoutMs);
      if (generation !== convertGeneration) return;
      resultName = `${selectedFile.name.replace(/\.(heic|heif)$/iu, '')}.${outputFormat}`;
      resultSize = blob.size;
      resultDimensions = `${image.width}×${image.height}`;
      resultUrl = URL.createObjectURL(blob);
      phase = 'done';
      statusMessage = t('heic.converted', 'Conversion complete. Your file is ready to download.');
    } catch (reason) {
      if (generation !== convertGeneration) return;
      phase = 'failed';
      errorMessage = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${t(
            'heic.remedy',
            'Open the file in a browser with HEIC support, export it as JPEG on its source device, or choose a valid HEIC/HEIF image.',
          )}`;
      statusMessage = '';
    }
  }
</script>

<svelte:head>
  <title>{t('heic.title', 'HEIC / HEIF Converter')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t(
      'heic.metaDescription',
      'Convert HEIC and HEIF images to PNG, JPEG, or WebP locally in your browser. Files never leave your device.',
    )}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
  <meta property="og:title" content={t('heic.title', 'HEIC / HEIF Converter')} />
  <meta property="og:description" content="Convert HEIC and HEIF locally." />
  <meta property="og:type" content="website" />
  <meta property="twitter:card" content="summary" />
</svelte:head>

<main
  lang={locale === 'en-XA' ? 'en-XA' : locale}
  dir={locale === 'ar' ? 'rtl' : 'ltr'}
  class="heic-page"
>
  <nav class="crumbs" aria-label={t('heic.breadcrumb', 'Breadcrumb')}>
    <a href={localized('/convert')}>{t('heic.back', '← Convert')}</a>
  </nav>

  <header class="intro">
    <h1>{t('heic.title', 'HEIC / HEIF Converter')}</h1>
    <p class="lede">
      {t(
        'heic.description',
        'Convert iPhone and other HEIC or HEIF photos to PNG, JPEG, or WebP right in your browser. Files are decoded locally and never uploaded.',
      )}
    </p>
    <p class="privacy-badge">{t('privacy.badge', 'Local only')}</p>
  </header>

  <!-- Upload -->
  <section class="card" aria-label={t('heic.upload', 'Upload')}>
    <button
      type="button"
      class="upload-zone"
      class:drag-over={dragOver}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
      disabled={phase === 'decoding' || phase === 'encoding'}
      aria-label={t('heic.drop', 'Drop a HEIC or HEIF file here')}
    >
      <span class="upload-icon" aria-hidden="true">🖼️</span>
      <span class="upload-heading">{t('heic.dropHeading', 'Drop your HEIC or HEIF file here')}</span
      >
      <span class="upload-sub">{t('heic.browseHint', 'Or browse files from your device')}</span>
      <input
        bind:this={fileInput}
        type="file"
        accept="image/heic,image/heif,.heic,.heif"
        aria-label={t('heic.choose', 'Choose a HEIC or HEIF image')}
        style="position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;"
        onchange={handleFileSelect}
        disabled={phase === 'decoding' || phase === 'encoding'}
      />
      <span class="button secondary browse-chip">
        {t('heic.browse', 'Browse Files')}
      </span>
      <span class="formats">{t('heic.supported', 'Accepted: .heic, .heif (up to 200 MB)')}</span>
    </button>

    {#if selectedFile}
      <div class="file-entry">
        <div class="file-meta">
          <span class="file-name">{selectedFile.name}</span>
          <span class="file-detail">
            {selectedMime} · {formatBytes(selectedFile.size)}
          </span>
        </div>
        <button
          type="button"
          class="button subtle"
          onclick={clearSelection}
          disabled={phase === 'decoding' || phase === 'encoding'}
          aria-label={t('heic.remove', 'Remove file')}
        >
          {t('heic.remove', 'Remove')}
        </button>
      </div>
    {/if}
  </section>

  <!-- Output settings -->
  <section class="card" aria-label={t('heic.settings', 'Output format')}>
    <h2>{t('heic.settings', 'Output format')}</h2>
    <div class="format-row" role="radiogroup" aria-label={t('heic.settings', 'Output format')}>
      {#each outputOptions as option (option.value)}
        <label class="format-choice" class:active={outputFormat === option.value}>
          <input
            type="radio"
            name="heic-output-format"
            value={option.value}
            bind:group={outputFormat}
            disabled={phase === 'decoding' || phase === 'encoding'}
          />
          {t(option.key, option.fallback)}
        </label>
      {/each}
    </div>
  </section>

  <!-- Action -->
  <section class="action-panel" aria-label={t('heic.action', 'Convert')}>
    <button
      type="button"
      class="button primary large"
      onclick={() => void convert()}
      disabled={!selectedFile || !outputFormat || phase === 'decoding' || phase === 'encoding'}
      data-testid="heic-convert"
      aria-busy={phase === 'decoding' || phase === 'encoding'}
    >
      {phase === 'decoding' || phase === 'encoding'
        ? t('heic.busy', 'Converting…')
        : t('heic.convert', 'Convert Image')}
    </button>
    <div class="status-area" role="status" aria-live="polite">
      {#if statusMessage}
        <p class="status-line">{statusMessage}</p>
      {:else if phase === 'idle'}
        <p class="status-line muted">{t('heic.idle', 'Select a HEIC or HEIF file to begin.')}</p>
      {/if}
    </div>
    {#if errorMessage}
      <p class="error" role="alert">{errorMessage}</p>
    {/if}
  </section>

  <!-- Result -->
  {#if phase === 'done' && resultUrl}
    <section class="card result" aria-label={t('heic.result', 'Conversion result')}>
      <p class="result-success">{t('heic.successTitle', 'Conversion succeeded locally.')}</p>
      <figure>
        <img src={resultUrl} alt={t('heic.previewAlt', 'Converted image preview')} />
        <figcaption>
          {resultName} · {resultDimensions} · {formatBytes(resultSize)} ·
          {outputFormat.toUpperCase()}
        </figcaption>
      </figure>
      <a
        href={resultUrl}
        download={resultName}
        class="button primary"
        data-testid="heic-download"
        aria-label={t('heic.download', 'Download')}
      >
        {t('heic.download', 'Download')}
      </a>
    </section>
  {/if}

  <!-- Explanation -->
  <section class="notes">
    <h2>{t('heic.faqTitle', 'Frequently asked')}</h2>
    <div>
      <h3>{t('heic.faqTitle1', 'Does HEIC encode work?')}</h3>
      <p>
        {t(
          'heic.faqAnswer1',
          'No. HEIC encoding requires HEVC patents and a GPL/commercial encoder, so only decode is offered.',
        )}
      </p>
      <h3>{t('heic.faqTitle2', 'What formats can I convert from?')}</h3>
      <p>{t('heic.faqAnswer2', 'HEIC and HEIF input files (.heic, .heif) are supported.')}</p>
      <h3>{t('heic.faqTitle3', 'Is my file uploaded?')}</h3>
      <p>{t('heic.faqAnswer3', 'No. The file is read locally; nothing is uploaded.')}</p>
    </div>
  </section>
</main>

<style>
  .heic-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
  }
  .crumbs {
    margin-bottom: 0.75rem;
  }
  .crumbs a {
    color: var(--c-text-muted, #5c5a56);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .intro {
    margin-bottom: 1.5rem;
  }
  h1 {
    font-size: 2rem;
    letter-spacing: -0.02em;
    margin: 0.25rem 0;
  }
  .lede {
    color: var(--c-text-muted, #5c5a56);
    line-height: 1.55;
    margin: 0 0 0.75rem;
  }
  .privacy-badge {
    display: inline-flex;
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--c-border, #d7d3cc);
    border-radius: var(--r-full, 999px);
    font-size: 0.8rem;
    color: var(--c-text-muted, #5c5a56);
    margin: 0;
  }
  .card {
    background: var(--c-surface, #fff);
    border: 1px solid var(--c-border, #e2e2e7);
    border-radius: var(--r-lg, 8px);
    padding: 1.25rem;
    margin-bottom: 1rem;
    box-shadow: var(--sh-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
  }
  .card h2 {
    font-size: 1.1rem;
    margin: 0 0 0.75rem;
  }
  .upload-zone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    padding: 2rem 1rem;
    border: 2px dashed var(--c-border-strong, #c9c5bd);
    border-radius: var(--r-lg, 8px);
    background: var(--c-surface-sunk, #f6f4f0);
    color: var(--c-text, #1c1a17);
    cursor: pointer;
    transition:
      border-color var(--dur-fast, 140ms) var(--ease-out, ease),
      background var(--dur-fast, 140ms) var(--ease-out, ease);
  }
  .upload-zone:hover,
  .upload-zone:focus-visible {
    border-color: var(--c-accent, #2b7a8c);
  }
  .upload-zone.drag-over {
    border-color: var(--c-accent, #2b7a8c);
    background: var(--c-accent-subtle, rgba(43, 122, 140, 0.06));
  }
  .upload-zone:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .upload-icon {
    font-size: 2rem;
  }
  .upload-heading {
    font-weight: 600;
  }
  .upload-sub {
    color: var(--c-text-muted, #5c5a56);
    font-size: 0.9rem;
  }
  .browse-chip {
    margin-top: 0.5rem;
    pointer-events: none;
  }
  .formats {
    color: var(--c-text-subtle, #8a867e);
    font-size: 0.8rem;
  }
  .upload-zone input[type='file'] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
  .file-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--c-surface, #fff);
    border: 1px solid var(--c-border, #e2e2e7);
    border-radius: var(--r-md, 5px);
  }
  .file-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .file-name {
    font-weight: 600;
    word-break: break-word;
  }
  .file-detail {
    color: var(--c-text-muted, #5c5a56);
    font-size: 0.85rem;
  }
  .format-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .format-choice {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.85rem;
    border: 1px solid var(--c-border, #d7d3cc);
    border-radius: var(--r-full, 999px);
    cursor: pointer;
    font-size: 0.9rem;
    transition:
      border-color var(--dur-fast, 140ms) var(--ease-out, ease),
      background var(--dur-fast, 140ms) var(--ease-out, ease);
  }
  .format-choice:has(input:focus-visible) {
    outline: 2px solid var(--c-accent, #1c1a17);
    outline-offset: 2px;
  }
  .format-choice.active {
    border-color: var(--c-accent, #1c1a17);
    background: var(--c-accent-subtle, rgba(43, 122, 140, 0.08));
    font-weight: 600;
  }
  .format-choice input {
    accent-color: var(--c-accent, #1c1a17);
    margin: 0;
  }
  .action-panel {
    background: var(--c-surface, #fff);
    border: 1px solid var(--c-border, #e2e2e7);
    border-radius: var(--r-lg, 8px);
    padding: 1.25rem;
    margin-bottom: 1rem;
    text-align: center;
    box-shadow: var(--sh-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
  }
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.6rem 1.1rem;
    border: 1px solid var(--c-border-strong, #c9c5bd);
    border-radius: var(--r-md, 5px);
    background: var(--c-surface, #fff);
    color: var(--c-text, #1c1a17);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    line-height: 1.2;
  }
  .button.primary {
    background: var(--c-accent, #1c1a17);
    border-color: var(--c-accent, #1c1a17);
    color: var(--c-on-accent, #fff);
  }
  .button.secondary {
    background: var(--c-surface-sunk, #f3f1ec);
    color: var(--c-text, #1c1a17);
    border-color: var(--c-border, #e2e2e7);
  }
  .button.subtle {
    background: transparent;
    color: var(--c-text-muted, #5c5a56);
    border-color: var(--c-border, #e2e2e7);
    padding: 0.35rem 0.7rem;
    font-size: 0.85rem;
  }
  .button.large {
    padding: 0.85rem 1.6rem;
    font-size: 1.05rem;
  }
  .button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .status-area {
    min-height: 1.5rem;
    margin-top: 0.5rem;
  }
  .status-line {
    margin: 0;
    font-size: 0.95rem;
    color: var(--c-text-muted, #5c5a56);
  }
  .status-line.muted {
    color: var(--c-text-subtle, #8a867e);
  }
  .error {
    color: var(--c-danger, #b3261e);
    background: var(--c-surface-sunk, #fdf2f2);
    border: 1px solid var(--c-danger, #f3c1bd);
    border-radius: var(--r-md, 5px);
    padding: 0.7rem 1rem;
    margin: 0.75rem 0 0;
    text-align: start;
    line-height: 1.5;
  }
  .result {
    border-color: var(--c-success, #3f6b3a);
  }
  .result-success {
    color: var(--c-success, #3f6b3a);
    font-weight: 600;
    margin: 0 0 0.75rem;
  }
  .result figure {
    margin: 0 0 1rem;
    text-align: center;
  }
  .result img {
    display: block;
    max-width: 100%;
    max-height: 420px;
    height: auto;
    margin: 0 auto;
    border: 1px solid var(--c-border, #e2e2e7);
    border-radius: var(--r-md, 5px);
    background: var(--c-canvas, #eee);
  }
  .result figcaption {
    color: var(--c-text-muted, #5c5a56);
    font-size: 0.85rem;
    margin-top: 0.5rem;
    word-break: break-word;
  }
  .notes {
    margin-top: 3rem;
  }
  .notes h2 {
    font-size: 1.5rem;
    font-weight: 500;
    letter-spacing: -0.01em;
    margin: 0 0 0.75rem;
  }
  .notes h3 {
    font-size: 1rem;
    margin: 1.25rem 0 0.35rem;
  }
  .notes p {
    margin: 0;
    color: var(--c-text-muted, #5c5a56);
    line-height: 1.55;
  }
  @media (max-width: 640px) {
    .heic-page {
      padding: 1rem 0.75rem 3rem;
    }
    h1 {
      font-size: 1.6rem;
    }
    .card,
    .action-panel {
      padding: 1rem;
    }
  }
</style>
