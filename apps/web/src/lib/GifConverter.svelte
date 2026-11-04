<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import {
    decodeWithTypedErrors,
    engineErrorMessage,
    isEngineError,
  } from '@complianttools/image-engine/errors';
  import {
    GifConverterToolOptionsSchema,
    gifConverterToolOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import type { RasterImage } from '@complianttools/image-engine/types';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/gif-converter' : `/${locale}/gif-converter`);

  let status = $state('');
  let error = $state('');
  let options = $state(GifConverterToolOptionsSchema.parse({}));
  let previewImage = $state<RasterImage | null>(null);
  let previewCanvas = $state<globalThis.HTMLCanvasElement>();
  let previewFrameIndex = $state(0);
  let previewPlaying = $state(false);
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let selectedFile = $state<File | undefined>(undefined);
  let busy = $state(false);
  let dragOver = $state(false);

  onDestroy(() => clearTimeout(previewTimer));

  function drawPreviewFrame(index: number) {
    if (!previewImage || !previewCanvas) return;
    const frameCount = previewImage.frames.length;
    previewFrameIndex = ((index % frameCount) + frameCount) % frameCount;
    const context = previewCanvas.getContext('2d');
    if (!context) return;
    const frame = previewImage.frames[previewFrameIndex]!;
    const imageData = context.createImageData(previewImage.width, previewImage.height);
    imageData.data.set(frame.data);
    context.putImageData(imageData, 0, 0);
    previewCanvas.dataset.frameIndex = String(previewFrameIndex);
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    if (!previewPlaying || !previewImage) return;
    const delay = Math.max(10, previewImage.frames[previewFrameIndex]!.durationMs);
    previewTimer = setTimeout(() => {
      drawPreviewFrame(previewFrameIndex + 1);
      schedulePreview();
    }, delay);
  }

  function setPreviewPlaying(playing: boolean) {
    previewPlaying = playing;
    schedulePreview();
  }

  function selectPreviewFrame(index: number) {
    setPreviewPlaying(false);
    drawPreviewFrame(index);
  }

  async function startPreview(image: RasterImage) {
    clearTimeout(previewTimer);
    previewImage = image;
    previewFrameIndex = 0;
    previewPlaying = !globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await tick();
    if (!previewCanvas)
      throw new Error(t('gif.previewError', 'Your browser cannot create the GIF preview.'));
    previewCanvas.width = image.width;
    previewCanvas.height = image.height;
    drawPreviewFrame(0);
    schedulePreview();
  }

  function validateFile(file: File): string | null {
    if (!file.type.startsWith('image/gif') && !file.name.toLowerCase().endsWith('.gif')) {
      return t('gif.invalidType', 'Please select a valid GIF file.');
    }
    if (file.size > 100 * 1024 * 1024) {
      return t('gif.tooLarge', 'File is too large (max 100 MB).');
    }
    return null;
  }

  async function startPreviewFromFile(file: File) {
    try {
      const bytes = await file.arrayBuffer();
      const { decodeGif } = await import('@complianttools/image-engine/codecs/gif');
      const image = await decodeWithTypedErrors('gif', () => decodeGif(bytes));
      await startPreview(image);
    } catch {
      // Preview failure is non-blocking; conversion will handle errors
    }
  }

  function handleFileSelect(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) {
      selectedFile = undefined;
      previewImage = null;
      error = '';
      status = '';
      return;
    }
    const validation = validateFile(file);
    if (validation) {
      error = validation;
      selectedFile = undefined;
      previewImage = null;
      return;
    }
    error = '';
    status = '';
    selectedFile = file;
    void startPreviewFromFile(file);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragOver = false;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const validation = validateFile(file);
    if (validation) {
      error = validation;
      selectedFile = undefined;
      previewImage = null;
      return;
    }
    error = '';
    status = '';
    selectedFile = file;
    void startPreviewFromFile(file);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragOver = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragOver = false;
  }

  function clearSelection() {
    selectedFile = undefined;
    previewImage = null;
    error = '';
    status = '';
    if (previewCanvas) {
      const ctx = previewCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }
  }

  function updateOption(path: string, value: unknown) {
    if (path !== 'gif.output') return;
    const parsed = GifConverterToolOptionsSchema.safeParse({ output: value });
    if (parsed.success) options = parsed.data;
  }

  async function split(file: File | undefined) {
    if (busy) return;
    busy = true;
    status = '';
    error = '';
    if (!file) {
      busy = false;
      return;
    }
    try {
      const bytes = await file.arrayBuffer();
      const { decodeGif } = await import('@complianttools/image-engine/codecs/gif');
      const image = await decodeWithTypedErrors('gif', () => decodeGif(bytes));
      await startPreview(image);
      if (options.output === 'webp') {
        const { encodeAnimatedWebp } =
          await import('@complianttools/image-engine/codecs/animated-webp');
        const webpBytes = await encodeAnimatedWebp(image);
        const url = URL.createObjectURL(new Blob([webpBytes], { type: 'image/webp' }));
        const download = document.createElement('a');
        download.href = url;
        download.download = `${file.name.replace(/\.gif$/iu, '')}.webp`;
        download.click();
        URL.revokeObjectURL(url);
        status = `${t('gif.converted', 'Converted {value}', image.frames.length)} ${t(image.frames.length === 1 ? 'gif.frame' : 'gif.frames', image.frames.length === 1 ? 'GIF frame' : 'GIF frames')} ${t('gif.toWebp', 'to animated WebP locally')}.`;
        return;
      }
      if (options.output === 'mp4' || options.output === 'webm') {
        const canvas = document.createElement('canvas');
        const { encodeAnimationVideo } =
          await import('@complianttools/image-engine/codecs/animation-video');
        const videoBytes = await encodeAnimationVideo(image, options.output, canvas);
        const mimeType = options.output === 'mp4' ? 'video/mp4' : 'video/webm';
        const url = URL.createObjectURL(new Blob([videoBytes], { type: mimeType }));
        const download = document.createElement('a');
        download.href = url;
        download.download = `${file.name.replace(/\.gif$/iu, '')}.${options.output}`;
        download.click();
        URL.revokeObjectURL(url);
        status = `${t('gif.converted', 'Converted {value}', image.frames.length)} ${t(image.frames.length === 1 ? 'gif.frame' : 'gif.frames', image.frames.length === 1 ? 'GIF frame' : 'GIF frames')} ${t('gif.toFormat', 'to')} ${options.output.toUpperCase()} ${t('gif.locally', 'locally')}.`;
        return;
      }
      if (options.output === 'apng') {
        const { encodeApng } = await import('@complianttools/image-engine/codecs/apng');
        const bytes = await encodeApng(image);
        const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        const download = document.createElement('a');
        download.href = url;
        download.download = `${file.name.replace(/\.gif$/iu, '')}.apng`;
        download.click();
        URL.revokeObjectURL(url);
        status = `${t('gif.converted', 'Converted {value}', image.frames.length)} ${t(image.frames.length === 1 ? 'gif.frame' : 'gif.frames', image.frames.length === 1 ? 'GIF frame' : 'GIF frames')} ${t('gif.toApng', 'to APNG locally')}.`;
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error(t('gif.canvasError', 'Your browser cannot create a local canvas.'));
      for (const [index, frame] of image.frames.entries()) {
        context.putImageData(new ImageData(frame.data, image.width, image.height), 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error(t('gif.pngError', 'Unable to encode PNG.'))),
            'image/png',
          ),
        );
        const url = URL.createObjectURL(blob);
        const download = document.createElement('a');
        download.href = url;
        download.download = `${file.name.replace(/\.gif$/iu, '')}-frame-${String(index + 1).padStart(3, '0')}.png`;
        download.click();
        await new Promise((resolve) => setTimeout(resolve, 150));
        URL.revokeObjectURL(url);
      }
      status = `${t('gif.exported', 'Exported {value}', image.frames.length)} ${t(image.frames.length === 1 ? 'gif.frame' : 'gif.frames', image.frames.length === 1 ? 'GIF frame' : 'GIF frames')} ${t('gif.locally', 'locally')}.`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${t('gif.remedy', 'Choose a valid bounded GIF, reduce its dimensions or frame count, or select an output supported by this browser.')}`;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>{t('gif.title', 'GIF Converter')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t(
      'gif.metaDescription',
      'Convert and split animated GIF files locally in your browser.',
    )}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
  <meta property="og:title" content="GIF Converter" />
  <meta property="og:description" content="Convert animated GIFs locally." />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary" />
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('gif.back', '← Convert')}</a>
  <h1>{t('gif.title', 'GIF Converter')}</h1>
  <p class="description">
    {t(
      'gif.description',
      'Convert animated GIFs to WebP, MP4, WebM, or APNG, or export individual PNG frames locally. Nothing is uploaded.',
    )}
  </p>
  <p class="privacy-badge">{t('privacy.badge', 'Local only')}</p>

  <!-- Upload -->
  <section class="card" aria-label={t('gif.upload', 'Upload')}>
    <button
      type="button"
      class="upload-zone button-reset"
      class:drag-over={dragOver}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
      aria-label={t('gif.drop', 'Drop a GIF file here')}
      onclick={() => {
        const input = document.getElementById('gif-file-input') as HTMLInputElement | null;
        input?.click();
      }}
    >
      <span class="upload-icon" aria-hidden="true">📁</span>
      <h2>{t('gif.dropHeading', 'Drop your file here')}</h2>
      <p class="upload-sub">{t('gif.browseHint', 'Or browse files from your device')}</p>
      <label class="browse-label">
        <span class="button secondary">{t('gif.browse', 'Browse Files')}</span>
        <input
          id="gif-file-input"
          type="file"
          accept="image/gif,.gif"
          onchange={handleFileSelect}
          style="position:absolute;opacity:0;pointer-events:none;"
        />
      </label>
      <p class="formats">{t('gif.supported', 'Supported: GIF (up to 100 MB)')}</p>
    </button>
  </section>

  <!-- Selected file + preview -->
  {#if selectedFile}
    <section class="card" aria-label={t('gif.selected', 'Selected file')}>
      <div class="selected-header">
        <div>
          <h3>{selectedFile.name}</h3>
          <p class="meta">
            {selectedFile.type || 'image/gif'} · {Math.round(selectedFile.size / 1024)} KB · {t(
              'gif.frames',
              'Frames',
            )}: {previewImage ? previewImage.frames.length : '—'}
          </p>
        </div>
        <button
          type="button"
          class="button subtle"
          onclick={clearSelection}
          aria-label={t('gif.remove', 'Remove file')}
        >
          {t('gif.remove', 'Remove')}
        </button>
      </div>

      {#if previewImage}
        <figure class="preview-figure">
          <canvas
            bind:this={previewCanvas}
            aria-label={t('gif.previewAlt', 'Decoded GIF animation preview')}
          ></canvas>
          <div
            class="preview-controls"
            role="group"
            aria-label={t('gif.playback', 'Preview playback')}
          >
            <button
              type="button"
              onclick={() => selectPreviewFrame(previewFrameIndex - 1)}
              aria-label={t('gif.previous', 'Previous frame')}
            >
              ◀
            </button>
            <button
              type="button"
              onclick={() => setPreviewPlaying(!previewPlaying)}
              aria-label={previewPlaying
                ? t('gif.pause', 'Pause preview')
                : t('gif.play', 'Play preview')}
            >
              {previewPlaying ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              onclick={() => selectPreviewFrame(previewFrameIndex + 1)}
              aria-label={t('gif.next', 'Next frame')}
            >
              ▶
            </button>
          </div>
          <figcaption>
            {t('gif.livePreview', 'Live preview — frame')}
            {previewFrameIndex + 1}
            {t('gif.of', 'of')}
            {previewImage.frames.length}
          </figcaption>
        </figure>
      {/if}
    </section>
  {/if}

  <!-- Settings -->
  <section class="card" aria-label={t('gif.settings', 'Conversion settings')}>
    <h2>{t('gif.settings', 'Conversion settings')}</h2>
    <GeneratedControls
      descriptions={localizeOptions(locale, gifConverterToolOptionDescriptions)}
      values={{ 'gif.output': options.output }}
      onChange={updateOption}
      {locale}
    />
    <p class="help">
      {t(
        'gif.settingsHelp',
        'Choose an output format. Changing settings does not start conversion.',
      )}
    </p>
  </section>

  <!-- Action -->
  <section class="action-panel" aria-label={t('gif.action', 'Convert')}>
    <button
      class="button primary large"
      type="button"
      onclick={() => void split(selectedFile)}
      disabled={!selectedFile || busy}
      data-testid="gif-convert"
      aria-busy={busy}
    >
      {busy ? t('gif.busy', 'Converting…') : t('gif.convert', 'Convert to GIF')}
    </button>
    <p class="action-note" aria-live="polite">{status}</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </section>

  <!-- Results -->
  {#if status && !busy && !(status.includes('Converted') || status.includes('Exported')) && !error}
    <!-- No premature result shown -->
  {/if}
</main>

<style>
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  h1 {
    font-size: 2rem;
    letter-spacing: -0.02em;
    margin: 0.25rem 0 0.25rem;
  }
  .description {
    color: var(--color-text-secondary, #555);
    margin: 0 0 0.25rem;
    line-height: 1.5;
  }
  .privacy-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--color-surface-subtle, #f3f3f5);
    color: var(--color-text-secondary, #555);
    padding: 0.35rem 0.7rem;
    border-radius: 9999px;
    font-size: 0.85rem;
    margin: 0 0 1rem;
  }
  .card {
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-border, #e2e2e7);
    border-radius: 1rem;
    padding: 1.25rem 1.25rem 1.25rem;
    margin-bottom: 1rem;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }
  .card h2 {
    font-size: 1.1rem;
    margin: 0 0 0.75rem;
  }
  .upload-zone {
    border: 2px dashed var(--color-border, #d0d0d5);
    border-radius: 1rem;
    padding: 2rem 1rem;
    text-align: center;
    transition:
      border-color 0.2s ease,
      background 0.2s ease;
    cursor: pointer;
  }
  .upload-zone.drag-over {
    border-color: var(--color-primary, #2563eb);
    background: rgba(37, 99, 235, 0.04);
  }
  .upload-icon {
    font-size: 2.5rem;
    display: block;
    margin-bottom: 0.5rem;
  }
  .upload-zone h2 {
    font-size: 1.15rem;
    margin: 0.25rem 0 0.25rem;
  }
  .upload-sub {
    color: var(--color-text-secondary, #555);
    margin: 0 0 1rem;
    font-size: 0.95rem;
  }
  .browse-label {
    display: inline-block;
  }
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.6rem 1.1rem;
    border: 1px solid transparent;
    border-radius: 0.65rem;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    line-height: 1.2;
  }
  .button.secondary {
    background: var(--color-surface-subtle, #f3f3f5);
    color: var(--color-text, #111);
    border-color: var(--color-border, #e2e2e7);
  }
  .button.primary {
    background: var(--color-primary, #2563eb);
    color: #fff;
  }
  .button.subtle {
    background: transparent;
    color: var(--color-text-secondary, #555);
    border-color: var(--color-border, #e2e2e7);
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
  .formats {
    color: var(--color-text-secondary, #555);
    font-size: 0.82rem;
    margin: 0.5rem 0 0;
  }
  .selected-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  .selected-header h3 {
    margin: 0 0 0.2rem;
    font-size: 1.05rem;
    word-break: break-word;
  }
  .meta {
    color: var(--color-text-secondary, #555);
    font-size: 0.9rem;
    margin: 0;
  }
  .preview-figure {
    margin: 0.75rem 0 0;
    text-align: center;
  }
  canvas {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0 auto;
    border: 1px solid var(--color-border, #e2e2e7);
    border-radius: 0.5rem;
    background: #000;
  }
  .preview-controls {
    display: inline-flex;
    gap: 0.25rem;
    margin-top: 0.5rem;
  }
  .preview-controls button {
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--color-border, #e2e2e7);
    border-radius: 0.45rem;
    background: #fff;
    cursor: pointer;
    font-size: 0.9rem;
  }
  figcaption {
    font-size: 0.85rem;
    color: var(--color-text-secondary, #555);
    margin-top: 0.25rem;
  }
  .help {
    font-size: 0.85rem;
    color: var(--color-text-secondary, #555);
    margin: 0.5rem 0 0;
  }
  .action-panel {
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-border, #e2e2e7);
    border-radius: 1rem;
    padding: 1.25rem;
    text-align: center;
  }
  .action-note {
    min-height: 1.5rem;
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
    color: var(--color-text-secondary, #555);
  }
  .error {
    color: #b91c1c;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    padding: 0.7rem 1rem;
    margin: 0.75rem 0 0;
  }
  @media (max-width: 640px) {
    main {
      padding: 1rem 0.75rem 2rem;
    }
    h1 {
      font-size: 1.6rem;
    }
    .card {
      padding: 1rem;
    }
  }
</style>
