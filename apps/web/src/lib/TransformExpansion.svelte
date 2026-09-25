<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    canvasResize,
    createRaster,
    encodeRaster,
    enlarge,
    makeCollage,
    resizeRaster,
    roundCorners,
    splitImage,
    ResizeOptionsSchema,
    type RasterImage,
  } from '@complianttools/image-engine';
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

  function t(key: string, fallback: string, value?: string | number) {
    return translate(locale, key, fallback, value);
  }
  function onFiles(event: Event) {
    files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    sourceName = files[0]?.name.replace(/\.[^.]+$/u, '') ?? 'image';
    status = files.length ? t('longTail.files', '{value} file(s) selected', files.length) : '';
    error = '';
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
    for (const result of outputs) URL.revokeObjectURL(result.url);
    outputs = [];
    outputUrl = '';
  }
  async function runTool() {
    clearOutputs();
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
        await publish(merged, 'collage.png');
      } else if (kind === 'split-image') {
        const tiles = splitImage(decoded[0]!, {
          enabled: true,
          cols: columns,
          rows,
          output: 'array',
        });
        for (const [index, tile] of tiles.entries())
          await publish(tile, `${sourceName}-tile-${index + 1}.png`);
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
  onDestroy(clearOutputs);
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
  <label
    >Choose image{kind === 'bulk-resize' || kind === 'collage' ? 's' : ''}<input
      data-testid="expansion-input"
      type="file"
      accept="image/*"
      multiple={kind === 'bulk-resize' || kind === 'collage'}
      onchange={onFiles}
    /></label
  >
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
  {#if kind === 'collage' || kind === 'split-image'}<div class="controls">
      <label>Columns <input type="number" min="1" max="16" bind:value={columns} /></label
      >{#if kind === 'collage'}<label>Gap <input type="number" min="0" bind:value={gap} /></label
        >{:else}<label>Rows <input type="number" min="1" max="16" bind:value={rows} /></label>{/if}
    </div>{/if}
  <button data-testid="expansion-run" type="button" onclick={() => void runTool()}
    >Run locally</button
  >
  {#if status}<p role="status" data-testid="expansion-status">{status}</p>{/if}
  {#if error}<p role="alert" data-testid="expansion-error">{error}</p>{/if}
  {#if outputs.length}<ul data-testid="expansion-results">
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
  [role='status'] {
    color: #075e31;
  }
  [role='alert'] {
    color: #a12626;
  }
</style>
