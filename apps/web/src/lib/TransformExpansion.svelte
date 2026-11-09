<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    splitImage,
    createRaster,
    encodeRaster,
    ResizeOptionsSchema,
    makeCollage,
    resizeRaster,
    canvasResize,
    enlarge,
    roundCorners,
    type RasterImage,
  } from '@complianttools/image-engine';
  import { zipSync } from 'fflate';
  import { translate, type Locale } from './i18n';

  type ExpansionKind =
    'bulk-resize' | 'canvas-resize' | 'enlarge' | 'round-corners' | 'collage' | 'split-image';

  let { kind, locale = 'en' }: { kind: ExpansionKind; locale?: Locale } = $props();
  const copies: Record<ExpansionKind, { title: string; description: string }> = {
    'bulk-resize': {
      title: 'Bulk Resize',
      description: 'Resize a group of images to a predictable target.',
    },
    'canvas-resize': {
      title: 'Canvas Resize',
      description: 'Expand or crop the canvas with an explicit anchor and fill.',
    },
    enlarge: {
      title: 'Image Enlarger',
      description: 'Enlarge a local image with a deterministic browser resampler.',
    },
    'round-corners': {
      title: 'Round Corners',
      description: 'Add transparent or coloured rounded corners locally.',
    },
    collage: { title: 'Collage Maker', description: 'Combine local images into a simple grid.' },
    'split-image': {
      title: 'Split Image',
      description: 'Split one image into a grid of downloadable tiles.',
    },
  };
  const arabicTitles: Partial<Record<ExpansionKind, string>> = {
    'bulk-resize': 'تغيير حجم دفعي',
    'canvas-resize': 'تغيير حجم اللوحة',
    enlarge: 'تكبير الصورة',
    'round-corners': 'زوايا مستديرة',
    collage: 'منشئ الكولاج',
    'split-image': 'تقسيم الصورة',
  };
  const copy = $derived(
    locale === 'ar'
      ? { ...copies[kind], title: arabicTitles[kind] ?? copies[kind].title }
      : locale === 'en-XA'
        ? {
            title: `［${copies[kind].title} ~~］`,
            description: `［${copies[kind].description} ~~~~］`,
          }
        : copies[kind],
  );
  const canonicalPath = $derived(locale === 'en' ? `/${kind}` : `/${locale}/${kind}`);
  const jsonLd = $derived({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: copy.title,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
  });

  let files = $state<readonly File[]>([]);
  let previews = $state<string[]>([]);
  let outputUrl = $state('');
  let outputs = $state<readonly { name: string; url: string }[]>([]);
  let zipUrl = $state('');
  let zipStatus = $state('');
  let zipError = $state('');
  let inputRef = $state<HTMLInputElement | null>(null);
  let status = $state('');
  let error = $state('');
  let width = $state(1200);
  let height = $state(800);
  let scale = $state(2);
  let radius = $state(32);
  let columns = $state(2);
  let rows = $state(2);
  let gap = $state(8);
  let sourceName = $state('image');
  let dragOver = $state(false);

  function fileCountText(files: readonly File[]): string {
    if (files.length === 0) return 'No files selected';
    return `${files.length} file${files.length === 1 ? '' : 's'} selected`;
  }

  function removeFile(index: number) {
    URL.revokeObjectURL(previews[index]!);
    files = files.filter((_, i) => i !== index);
    previews = previews.filter((_, i) => i !== index);
    clearOutputs();
    if (files.length === 0) {
      sourceName = 'image';
      status = fileCountText(files);
    } else {
      sourceName = files[0]!.name.replace(/\.[^.]+$/u, '') ?? 'image';
      status = fileCountText(files);
    }
    error = '';
  }

  function t(key: string, fallback: string, value?: string | number) {
    return translate(locale, key, fallback, value);
  }
  function onFiles(event: Event) {
    const picker = event.currentTarget as HTMLInputElement;
    const selected = Array.from(picker.files ?? []);
    picker.value = '';
    if (!selected.length) return;
    const supportsMultiple = kind === 'bulk-resize' || kind === 'collage';
    const nextPreviews = selected.map((file) => URL.createObjectURL(file));
    if (supportsMultiple) {
      files = [...files, ...selected];
      previews = [...previews, ...nextPreviews];
    } else {
      clearPreviews();
      files = selected;
      previews = nextPreviews;
    }
    clearOutputs();
    sourceName = files[0]?.name.replace(/\.[^.]+$/u, '') ?? 'image';
    status = fileCountText(files);
    error = '';
  }
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }
  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const dropped = e.dataTransfer?.files;
    if (dropped && dropped.length) {
      const input = inputRef;
      if (input) {
        const dt = new DataTransfer();
        for (let i = 0; i < dropped.length; i++) dt.items.add(dropped[i]!);
        input.files = dt.files;
        onFiles({ currentTarget: input } as unknown as Event);
      }
    }
  }
  async function decode(file: File): Promise<RasterImage> {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('A 2D canvas is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return createRaster(
      canvas.width,
      canvas.height,
      context.getImageData(0, 0, canvas.width, canvas.height).data,
    );
  }
  async function publish(image: RasterImage, name: string) {
    const bytes = await encodeRaster(image, 'png');
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    outputs = [...outputs, { name, url }];
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = url;
  }
  function clearOutputs() {
    const urls = outputs.map((result) => result.url);
    if (outputUrl && !urls.includes(outputUrl)) urls.push(outputUrl);
    if (zipUrl && !urls.includes(zipUrl)) urls.push(zipUrl);
    for (const url of urls) URL.revokeObjectURL(url);
    outputs = [];
    outputUrl = '';
    zipUrl = '';
    zipStatus = '';
    zipError = '';
  }
  function clearPreviews() {
    for (const url of previews) URL.revokeObjectURL(url);
    previews = [];
  }
  async function runTool() {
    clearOutputs();
    status = '';
    error = '';
    try {
      if (!files.length) throw new Error('Choose at least one image first.');
      if (kind === 'collage' && files.length < 2) {
        throw new Error('Choose at least two images to make a collage.');
      }
      const decoded = await Promise.all(files.map(decode));
      if (kind === 'collage') {
        const merged = makeCollage(decoded[0]!, {
          images: decoded,
          columns,
          gap,
          background: '#ffffff',
        });
        await publish(merged, 'collage.png');
      } else if (kind === 'split-image') {
        const tiles = splitImage(decoded[0]!, {
          enabled: true,
          cols: columns,
          rows,
          output: 'array',
        });
        const tileEntries: [string, Uint8Array][] = [];
        for (const [index, tile] of tiles.entries()) {
          const bytes = await encodeRaster(tile, 'png');
          const filename = `${sourceName}-tile-${index + 1}.png`;
          tileEntries.push([filename, new Uint8Array(bytes)]);
        }
        const zipBuffer = zipSync(Object.fromEntries(tileEntries), {
          level: 0,
          mtime: new Date(1980, 0, 1),
        });
        zipStatus = 'Preparing ZIP...';
        zipError = '';
        zipUrl = URL.createObjectURL(new Blob([zipBuffer], { type: 'application/zip' }));
        outputs = [...outputs, { name: 'split-image-tiles.zip', url: zipUrl }];
        zipStatus = 'ZIP ready';
      } else {
        for (const [index, image] of decoded.entries()) {
          const result =
            kind === 'bulk-resize'
              ? resizeRaster(
                  image,
                  ResizeOptionsSchema.parse({
                    mode: 'pixels',
                    width,
                    height,
                    allowUpscale: false,
                    lockAspect: true,
                  }),
                )
              : kind === 'canvas-resize'
                ? canvasResize(image, { width, height, anchor: 'center', fillColor: '#ffffff' })
                : kind === 'enlarge'
                  ? enlarge(image, { scale })
                  : roundCorners(image, { radius, background: 'transparent' });
          await publish(
            result,
            `${sourceName}-${kind}${decoded.length > 1 ? `-${index + 1}` : ''}.png`,
          );
        }
      }
      status = t('longTail.ready', 'Created {value} output(s) locally', outputs.length);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }
  onDestroy(() => {
    clearOutputs();
    clearPreviews();
  });
</script>

<svelte:head>
  <title>{copy.title} — Image Compliant Tools</title>
  <meta name="description" content={copy.description} />
  <link rel="canonical" href={`https://image.complianttools.com${canonicalPath}`} />
  <meta property="og:title" content={copy.title} />
  <meta property="og:description" content={copy.description} />
  <meta property="og:image" content="https://image.complianttools.com/og/tools.svg" />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(jsonLd)}</svelte:element
  >
</svelte:head>

<main
  class="expansion"
  lang={locale}
  dir={locale === 'ar' ? 'rtl' : 'ltr'}
  data-testid={`transform-expansion-${kind}`}
>
  <header><a href="/">ctimg</a><span>{t('privacy.badge', 'Local only')}</span></header>
  <section class="intro">
    <p class="eyebrow">{t('workspace.eyebrow', 'Local image instrument')}</p>
    <h1>{copy.title}</h1>
    <p>{copy.description}</p>
    <p>{t('privacy.copy', 'Processed on your device. Nothing is uploaded.')}</p>
  </section>
  <input
    id="file-input"
    bind:this={inputRef}
    data-testid="expansion-input"
    type="file"
    accept="image/*"
    multiple={kind === 'bulk-resize' || kind === 'collage'}
    onchange={onFiles}
    class="file-input"
    aria-label={t('transform.choose', 'Choose Images')}
  />
  {#if !files[0]}
    <div
      class="upload-area custom-upload"
      class:drag-over={dragOver}
      role="group"
      aria-label="Drop images to upload"
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
    >
      <span class="upload-icon" aria-hidden="true">📁</span>
      <span class="upload-label">Drop your image here</span>
      <span class="upload-sub">or browse files from your device</span>
      <button
        type="button"
        class="button primary"
        aria-label={t('transform.choose', 'Choose Images')}
        onclick={(e: MouseEvent) => {
          e.stopPropagation();
          inputRef?.click();
        }}>{t('transform.choose', 'Choose Images')}</button
      >
      <span class="upload-formats">PNG, JPG, WEBP, AVIF</span>
    </div>
  {/if}
  {#if files[0]}
    <div class="workspace" data-testid="file-preview">
      <div class="preview-panel">
        <div class="preview-card">
          <img src={previews[0]} alt={files[0].name} />
        </div>
        <div class="preview-meta">
          <strong>{files[0].name}</strong>
          <span>{files[0].type || 'image'} · {Math.round(files[0].size / 1024)} KB</span>
          <button
            type="button"
            class="button secondary replace-button"
            aria-label={kind === 'bulk-resize' || kind === 'collage'
              ? t('transform.choose', 'Choose Images')
              : 'Replace uploaded image'}
            onclick={() => inputRef?.click()}
            >{kind === 'bulk-resize' || kind === 'collage'
              ? t('transform.choose', 'Choose Images')
              : 'Replace image'}</button
          >
        </div>
      </div>
      {#if kind === 'split-image'}
        <aside class="config-panel" aria-label="Split configuration">
          <h3>Split configuration</h3>
          <div class="controls split-controls">
            <label>Columns <input type="number" min="1" max="16" bind:value={columns} /></label>
            <label>Rows <input type="number" min="1" max="16" bind:value={rows} /></label>
          </div>
          <button data-testid="expansion-run" type="button" onclick={() => void runTool()}
            >Split Image</button
          >
        </aside>
      {/if}
    </div>
  {/if}
  <p data-testid="file-count" class="file-count">{fileCountText(files)}</p>
  {#if files.length && (kind === 'bulk-resize' || kind === 'collage')}
    <div class="previews" data-testid="expansion-previews">
      {#each files as file, index (previews[index])}
        <div class="preview" data-testid={`preview-${index}`}>
          <img src={previews[index]} alt={file.name} width="72" height="72" loading="lazy" />
          <button
            type="button"
            class="remove"
            aria-label={t('collage.remove', 'Remove {name}', file.name)}
            onclick={() => removeFile(index)}
          >
            ×
          </button>
        </div>
      {/each}
    </div>
  {/if}
  {#if kind === 'bulk-resize' || kind === 'canvas-resize'}<div class="controls">
      <label>Width <input type="number" min="1" bind:value={width} /></label><label
        >Height <input type="number" min="1" bind:value={height} /></label
      >
    </div>{/if}
  {#if kind === 'enlarge'}<label
      >Scale <input type="number" min="1" max="8" step="0.5" bind:value={scale} /></label
    >{/if}
  {#if kind === 'round-corners'}<label
      >Radius <input type="number" min="0" bind:value={radius} /></label
    >{/if}
  {#if kind === 'collage' || (kind === 'split-image' && !files[0])}<div class="controls">
      <label>Columns <input type="number" min="1" max="16" bind:value={columns} /></label
      >{#if kind === 'collage'}<label>Gap <input type="number" min="0" bind:value={gap} /></label
        >{:else}<label>Rows <input type="number" min="1" max="16" bind:value={rows} /></label>{/if}
    </div>{/if}
  {#if kind !== 'split-image'}
    <button
      data-testid="expansion-run"
      type="button"
      onclick={() => void runTool()}
      disabled={kind === 'collage' && files.length < 2}
      data-disabled={kind === 'collage' && files.length < 2 ? 'true' : undefined}
      >Run locally</button
    >
  {/if}
  {#if status}<p role="status" data-testid="expansion-status">{status}</p>{/if}
  {#if error}<p role="alert" data-testid="expansion-error">{error}</p>{/if}
  {#if kind === 'split-image' && zipStatus === 'ZIP ready'}
    <div
      class="download-card"
      data-testid="expansion-results"
      role="region"
      aria-label="Download split tiles"
    >
      <div class="download-header">
        <span class="download-icon" aria-hidden="true">📦</span>
        <h3>Your split images are ready</h3>
      </div>
      <div class="download-meta">
        <strong>split-image-tiles.zip</strong>
        <span>{columns * rows} tiles</span>
      </div>
      <p class="download-sub">All generated tiles are included in one ZIP archive.</p>
      <a
        class="button primary download-button"
        href={zipUrl}
        download="split-image-tiles.zip"
        aria-label="Download ZIP archive of split tiles"
      >
        <span aria-hidden="true">⬇</span> Download ZIP
      </a>
    </div>
  {/if}
  {#if kind !== 'split-image' && outputs.length}<ul data-testid="expansion-results">
      {#each outputs as result (result.name)}<li>
          <a href={result.url} download={result.name}>{result.name}</a>
        </li>{/each}
    </ul>{/if}
  <section class="faq">
    <h2>{t('seo.questions', 'Questions')}</h2>
    <details open>
      <summary>{t('faq.upload.title', 'Are files uploaded?')}</summary>
      <p>{t('faq.upload.body', 'No. Processing happens locally in your browser.')}</p>
    </details>
  </section>
  {#if zipStatus}<p role="status" data-testid="zip-status">{zipStatus}</p>{/if}
  {#if zipError}<p role="alert" data-testid="zip-error">{zipError}</p>{/if}
</main>

<style>
  .expansion {
    max-width: 68rem;
    margin: 0 auto;
    padding: 1.5rem;
    color: #172033;
  }
  header {
    display: flex;
    justify-content: space-between;
  }
  .intro {
    margin: 3rem 0 2rem;
  }
  .eyebrow {
    color: #52627a;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  label {
    display: grid;
    gap: 0.35rem;
    margin: 1rem 0;
    font-weight: 600;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }
  button[data-disabled='true'] {
    opacity: 0.55;
    cursor: not-allowed;
  }
  button {
    margin: 1rem 0;
    padding: 0.7rem 1.1rem;
    cursor: pointer;
  }
  .workspace {
    display: grid;
    gap: 2rem;
    align-items: start;
    grid-template-columns: 1fr;
    margin: 1.5rem 0;
  }
  @media (min-width: 48rem) {
    .workspace {
      grid-template-columns: 1fr 1fr;
      gap: 2.5rem;
    }
  }
  .preview-panel {
    min-width: 0;
  }
  .preview-card {
    background: #fff;
    border: 1px solid #1c1a1720;
    border-radius: 12px;
    padding: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
  }
  .preview-card img {
    max-height: 320px;
    max-width: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
    border-radius: 6px;
  }
  @media (max-width: 47.99rem) {
    .preview-card img {
      max-height: 240px;
    }
  }
  .preview-meta {
    margin-top: 0.75rem;
    font-size: 0.85rem;
    color: #52627a;
    word-break: break-word;
  }
  .config-panel {
    background: #f8f6f3;
    border: 1px solid #1c1a1720;
    border-radius: 12px;
    padding: 1.25rem;
  }
  .config-panel h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: -0.5px;
  }
  .split-controls {
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .config-panel button {
    width: 100%;
    margin: 0;
  }
  .custom-upload {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 2.5rem 2rem;
    border: 2px dashed #1c1a1720;
    border-radius: 16px;
    background: #fff;
    text-align: center;
    cursor: pointer;
    transition:
      border-color 0.2s,
      background 0.2s;
    margin: 1.5rem 0;
  }
  .custom-upload.drag-over,
  .custom-upload:focus-within {
    border-color: #1c1a17;
    background: #f8f6f3;
  }
  .custom-upload .upload-icon {
    font-size: 2.5rem;
    line-height: 1;
  }
  .custom-upload .upload-label {
    font-size: 1.15rem;
    font-weight: 600;
    letter-spacing: -0.4px;
    color: #1c1a17;
  }
  .custom-upload .upload-sub {
    font-size: 0.9rem;
    color: #52627a;
  }
  .custom-upload .upload-formats {
    font-size: 0.78rem;
    color: #8a8682;
    letter-spacing: 0.02em;
  }
  .custom-upload .button {
    margin: 0.25rem 0;
  }
  .replace-button {
    font-size: 0.75rem;
    padding: 0.35rem 0.7rem;
    margin: 0.25rem 0 0;
    border-radius: 999px;
    background: #fff;
    border: 1px solid #1c1a1720;
  }
  .download-card {
    background: #fff;
    border: 1px solid #1c1a1720;
    border-radius: 12px;
    padding: 1.5rem;
    margin: 1.5rem 0;
    max-width: 480px;
  }
  .download-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .download-header h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: -0.4px;
  }
  .download-icon {
    font-size: 1.5rem;
  }
  .download-meta {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    margin-bottom: 0.25rem;
    font-size: 0.9rem;
    color: #52627a;
  }
  .download-meta strong {
    color: #1c1a17;
    font-weight: 600;
  }
  .download-sub {
    margin: 0.5rem 0 1rem;
    font-size: 0.85rem;
    color: #5c5a56;
  }
  .download-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.7rem 1.2rem;
    border-radius: 999px;
    text-decoration: none;
  }
  [role='status'] {
    color: #075e31;
  }
  [role='alert'] {
    color: #a12626;
  }
  .previews {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 1rem 0;
  }
  .preview {
    position: relative;
    width: 72px;
    height: 72px;
    border: 1px solid #c0c0c0;
    border-radius: 4px;
    background: #f8f8f8;
  }
  .preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ff4d4d;
    color: white;
    font-size: 12px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: none;
    padding: 0;
  }
  .remove:hover {
    background: #ff3333;
  }
  .file-count {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: #52627a;
  }

  .file-input {
    display: none;
  }
</style>
