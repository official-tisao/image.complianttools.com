<script lang="ts">
  import { onDestroy } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
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
  let outputUrl = $state('');
  let outputs = $state<readonly { name: string; url: string }[]>([]);
  let zipUrl = $state('');
  let zipStatus = $state('');
  let zipError = $state('');
  let status = $state('');
  let error = $state('');
  let width = $state(1200);
  let height = $state(800);
  let scale = $state(2);
  let radius = $state(32);
  let columns = $state(2);
  let rows = $state(2);
  let gap = $state(8);
  let dragOver = $state(false);
  // Track URLs per file to avoid leaks
  const fileUrls = new SvelteMap<File, string>();
  let previousFiles: File[] = [];

  function t(key: string, fallback: string, value?: string | number) {
    return translate(locale, key, fallback, value);
  }
  function onFiles(event: Event) {
    const newFiles = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    // Revoke URLs for files that are no longer present
    for (const file of previousFiles) {
      const url = fileUrls.get(file);
      if (url) {
        URL.revokeObjectURL(url);
        fileUrls.delete(file);
      }
    }
    files = newFiles;
    previousFiles = newFiles;
    status = files.length ? t('longTail.files', '{value} file(s) selected', files.length) : '';
    error = '';
  }
  function getPreviewUrl(file: File): string {
    let url = fileUrls.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      fileUrls.set(file, url);
    }
    return url;
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
      const input = document.getElementById('file-input') as HTMLInputElement | null;
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
  async function publish(file: File, image: RasterImage, name: string) {
    const bytes = await encodeRaster(image, 'png');
    let url = fileUrls.get(file);
    if (!url) {
      url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      fileUrls.set(file, url);
    }
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = url;
    outputs = [...outputs, { name, url }];
  }
  function clearOutputs() {
    for (const result of outputs) URL.revokeObjectURL(result.url);
    outputs = [];
    outputUrl = '';
  }
  async function runTool() {
    clearOutputs();
    // Revoke all file URLs before reprocessing
    for (const url of fileUrls.values()) {
      URL.revokeObjectURL(url);
    }
    fileUrls.clear();
    status = '';
    error = '';
    try {
      if (!files.length) throw new Error('Choose at least one image first.');
      const decoded = await Promise.all(files.map(decode));
      if (kind === 'collage') {
        const merged = makeCollage(decoded[0]!, {
          images: decoded,
          columns,
          gap,
          background: '#ffffff',
        });
        await publish(files[0]!, merged, 'collage.png');
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
          const filename = `${files[0]?.name?.replace(/\.[^.]+$/u, '')}-tile-${index + 1}.png`;
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
          const file = files[index];
          const fileBaseName = file.name.replace(/\.[^.]+$/u, '');
          const fileSuffix = decoded.length > 1 ? `-${index + 1}` : '';
          const fileName = `${fileBaseName}-${kind}${fileSuffix}.png`;
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
          await publish(file, result, fileName);
        }
      }
      status = t('longTail.ready', 'Created {value} output(s) locally', outputs.length);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }
  onDestroy(() => {
    // Revoke all file URLs
    for (const url of fileUrls.values()) {
      URL.revokeObjectURL(url);
    }
    fileUrls.clear();
    // Revoke main output and zip URLs
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    if (zipUrl) URL.revokeObjectURL(zipUrl);
  });
</script>

<svelte:head>
  <title>{copy.title} — Image Compliant Tools</title>
  <meta name="description" content={copy.description} />
  <link rel="canonical" href={`https://image.complianttools.com${canonicalPath}`} />
  <meta property="og:title" content={copy.title} />
  <meta property="og:description" content={copy.description} />
  <meta property="og:image" content="https://image.complianttools.com/og/tools.svg" />
  <svelte:element this={"script"} type="application/ld+json">
    {JSON.stringify(jsonLd)}
  </svelte:element>
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
  {#if !files[0]}
    <div
      class="upload-area custom-upload"
      class:drag-over={dragOver}
      role="button"
      aria-label="Upload image"
      tabindex="0"
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
      onclick={() => document.getElementById('file-input')?.click()}
      onkeydown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          document.getElementById('file-input')?.click();
        }
      }}
    >
      <span class="upload-icon" aria-hidden="true">📁</span>
      <span class="upload-label">Drop your image here</span>
      <span class="upload-sub">or browse files from your device</span>
      <button
        type="button"
        class="button primary"
        aria-label="Browse files"
        onclick={(e: MouseEvent) => {
          e.stopPropagation();
          document.getElementById('file-input')?.click();
        }}
      >
        Browse Files
      </button>
      <span class="upload-formats">PNG, JPG, WEBP, AVIF</span>
      <input
        id="file-input"
        data-testid="expansion-input"
        type="file"
        accept="image/*"
        multiple={kind === 'bulk-resize' || kind === 'collage'}
        onchange={onFiles}
        style="position: absolute; opacity: 0; width: 0; height: 0;"
        aria-label="Choose an image file"
      />
    </div>
  {/if}
  {#each files as file (file.name)}
    <div class="workspace" data-testid="file-preview">
      <div class="preview-panel">
        <div class="preview-card">
          <img src={getPreviewUrl(file)} alt={file.name} />
        </div>
        <div class="preview-meta">
          <strong>{file.name}</strong>
          <span>{file.type || 'image'} · {Math.round(file.size / 1024)} KB</span>
          <button
            type="button"
            class="button secondary replace-button"
            aria-label="Replace uploaded image"
            onclick={() => document.getElementById('file-input')?.click()}>Replace image</button
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
          <button data-testid="expansion-run" type="button" onclick={() => void runTool()}>
            Run Locally
          </button>
        </aside>
      {/if}
    </div>
  {/each}
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
  {#if kind !== 'split-image' && files[0]}
    <button data-testid="expansion-run" type="button" onclick={() => void runTool()}>
      Run locally
    </button>
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
</style>
