<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { searchTargetSize } from '@complianttools/image-engine/pipeline/target-size';
  import { phaseOneOptionDescriptions } from '@complianttools/image-engine/schemas/options';
  import type { Recipe } from '@complianttools/image-engine/types';
  import CompareCanvas from './CompareCanvas.svelte';
  import GeneratedControls from './GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  type ToolKind = 'convert' | 'compress' | 'resize';
  let {
    kind,
    title,
    description,
    locale = 'en',
    canonicalPath = kind,
  } = $props<{
    kind: ToolKind;
    title: string;
    description: string;
    locale?: Locale;
    canonicalPath?: string;
  }>();
  const initialKind = untrack(() => kind);
  let values = $state<Record<string, unknown>>({
    'export.format': initialKind === 'convert' ? 'webp' : 'same',
    'export.quality': initialKind === 'compress' ? 72 : 82,
    'resize.mode': 'pixels',
    'resize.width': 1200,
    'resize.height': 800,
    'resize.value': 200,
    'resize.unit': 'KB',
  });
  let sourceUrl = $state('');
  let outputUrl = $state('');
  let sourceBytes = $state(0);
  let outputBytes = $state(0);
  let filename = $state('');
  let busy = $state(false);
  let error = $state('');
  let latency = $state(0);
  let targetProgress = $state('');
  let updateTimer: ReturnType<typeof setTimeout> | undefined;
  const relevant = $derived(
    Object.fromEntries(
      Object.entries(localizeOptions(locale, phaseOneOptionDescriptions)).filter(([path]) =>
        kind === 'resize'
          ? path.startsWith('resize.') || path.startsWith('export.')
          : path.startsWith('export.'),
      ),
    ),
  );
  const summary = $derived(
    sourceBytes && outputBytes
      ? `${formatBytes(sourceBytes)} → ${formatBytes(outputBytes)} (${Math.round((outputBytes / sourceBytes - 1) * 100)}%)`
      : translate(locale, 'status.choose', 'Choose an image to begin'),
  );
  const canonical = $derived(`https://image.complianttools.com/${canonicalPath}`);
  const jsonLd = $derived({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: title,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: translate(locale, 'faq.upload.title', 'Are images uploaded?'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: translate(
                locale,
                'faq.upload.body',
                'No. Processing happens locally in your browser.',
              ),
            },
          },
          {
            '@type': 'Question',
            name: translate(locale, 'faq.preview.title', 'Does preview match export?'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: translate(
                locale,
                'faq.preview.body',
                'The same recipe runs for preview and export.',
              ),
            },
          },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Tools',
            item: 'https://image.complianttools.com/',
          },
          { '@type': 'ListItem', position: 2, name: title, item: canonical },
        ],
      },
    ],
  });
  let currentFile: File | undefined;
  let decodedImage: ImageData | undefined;

  function formatBytes(bytes: number) {
    return bytes >= 1_000_000
      ? `${(bytes / 1_000_000).toFixed(1)} MB`
      : `${Math.round(bytes / 1000)} KB`;
  }
  function setValue(path: string, value: unknown) {
    values[path] = value;
    values = { ...values };
    if (currentFile && decodedImage) {
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        void predictSize(decodedImage!);
        void processFile(currentFile!);
      }, 120);
    }
  }
  async function decode(file: File) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }
  function workerProcess(image: ImageData, recipe: Recipe): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../workers/tool-worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event) => {
        worker.terminate();
        if (event.data.error) reject(new Error(event.data.error));
        else
          resolve(
            new ImageData(
              new Uint8ClampedArray(event.data.data),
              event.data.width,
              event.data.height,
            ),
          );
      };
      worker.onerror = reject;
      const copy = image.data.slice().buffer;
      worker.postMessage({ width: image.width, height: image.height, data: copy, recipe }, [copy]);
    });
  }
  async function predictSize(image: ImageData) {
    const started = performance.now();
    const longest = Math.max(image.width, image.height);
    const scale = Math.min(1, 1024 / longest);
    const source = document.createElement('canvas');
    source.width = image.width;
    source.height = image.height;
    source.getContext('2d')!.putImageData(image, 0, 0);
    const proxy = document.createElement('canvas');
    proxy.width = Math.max(1, Math.round(image.width * scale));
    proxy.height = Math.max(1, Math.round(image.height * scale));
    proxy.getContext('2d')!.drawImage(source, 0, 0, proxy.width, proxy.height);
    const format =
      values['export.format'] === 'same' ? currentFile!.type : `image/${values['export.format']}`;
    const encodeProxy = (quality: number, dimensionScale = 1) => {
      const candidate = document.createElement('canvas');
      candidate.width = Math.max(1, Math.round(proxy.width * dimensionScale));
      candidate.height = Math.max(1, Math.round(proxy.height * dimensionScale));
      candidate.getContext('2d')!.drawImage(proxy, 0, 0, candidate.width, candidate.height);
      return new Promise<Blob>((resolve, reject) =>
        candidate.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('Prediction encode unavailable.'))),
          format,
          quality / 100,
        ),
      );
    };
    if (kind === 'resize' && values['resize.mode'] === 'targetBytes') {
      const target =
        Number(values['resize.value']) * (values['resize.unit'] === 'MB' ? 1_000_000 : 1_000);
      const result = await searchTargetSize(
        target,
        async (quality, dimensionScale) =>
          (await encodeProxy(quality, dimensionScale)).arrayBuffer(),
        {
          strategy: 'quality-then-scale',
          onAttempt: (attempt) => {
            targetProgress = `Trying quality ${attempt.quality} → ${formatBytes(attempt.bytes)}…`;
          },
        },
      );
      outputBytes = result.bytes;
      targetProgress = result.warning
        ? `Closest result: ${formatBytes(result.bytes)}`
        : `Target found: ${formatBytes(result.bytes)}`;
      latency = performance.now() - started;
      return;
    }
    targetProgress = '';
    const blob = await encodeProxy(Number(values['export.quality']));
    const targetPixels =
      kind === 'resize'
        ? Number(values['resize.width']) * Number(values['resize.height'])
        : image.width * image.height;
    outputBytes = Math.max(
      1,
      Math.round((blob.size * targetPixels) / (proxy.width * proxy.height)),
    );
    latency = performance.now() - started;
  }
  async function processFile(file: File) {
    busy = true;
    error = '';
    try {
      const image = decodedImage ?? (await decode(file));
      decodedImage = image;
      const width = Number(values['resize.width']);
      const height = Number(values['resize.height']);
      const recipe: Recipe = {
        version: 1,
        id: kind,
        steps:
          kind === 'resize'
            ? [{ op: 'resize', options: { mode: 'pixels', width, height, allowUpscale: false } }]
            : [],
        export: {
          format: String(values['export.format']) as Recipe['export']['format'],
          quality: Number(values['export.quality']),
        },
      };
      const result = await workerProcess(image, recipe);
      const canvas = document.createElement('canvas');
      canvas.width = result.width;
      canvas.height = result.height;
      canvas.getContext('2d')!.putImageData(result, 0, 0);
      const format =
        values['export.format'] === 'same' ? file.type : `image/${values['export.format']}`;
      const quality = Number(values['export.quality']) / 100;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error('This browser cannot encode the selected format.')),
          format,
          quality,
        ),
      );
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = URL.createObjectURL(blob);
      outputBytes = blob.size;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }
  async function choose(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    currentFile = file;
    decodedImage = undefined;
    filename = file.name;
    sourceBytes = file.size;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(file);
    await processFile(file);
  }
  function download() {
    if (!outputUrl) return;
    const link = document.createElement('a');
    link.href = outputUrl;
    link.download = `${filename.replace(/\.[^.]+$/u, '')}.${values['export.format'] === 'same' ? filename.split('.').at(-1) : values['export.format']}`;
    link.click();
  }
  onDestroy(() => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
  });
</script>

<svelte:head
  ><title>{title} — ctimg</title><meta name="description" content={description} /><link
    rel="canonical"
    href={canonical}
  /><link rel="alternate" hreflang="en" href={canonical} /><link
    rel="alternate"
    hreflang="en-XA"
    href={`https://image.complianttools.com/en-XA/${kind}`}
  /><link rel="alternate" hreflang="ar" href={`https://image.complianttools.com/ar/${kind}`} /><meta
    property="og:title"
    content={title}
  /><meta property="og:description" content={description} /><meta
    property="og:image"
    content="https://image.complianttools.com/og/tools.svg"
  /><meta name="twitter:card" content="summary_large_image" /><svelte:element
    this={"script"}
    type="application/ld+json">{JSON.stringify(jsonLd)}</svelte:element
  ></svelte:head
>
<header class="tool-header">
  <a class="logo" href="/">ctimg</a>
  <nav>
    <a href="/convert">{translate(locale, 'nav.convert', 'Convert')}</a><a href="/compress"
      >{translate(locale, 'nav.compress', 'Compress')}</a
    ><a href="/resize">{translate(locale, 'nav.resize', 'Resize')}</a>
  </nav>
  <span class="privacy">{translate(locale, 'privacy.badge', 'Local only')}</span>
</header>
<main class="tool-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <section class="tool-intro">
    <p class="eyebrow">{translate(locale, 'workspace.eyebrow', 'Local image instrument')}</p>
    <h1>{title}</h1>
    <p>{description}</p>
    <p class="privacy-copy">
      {translate(locale, 'privacy.copy', 'Processed on your device. Nothing is uploaded.')}
    </p>
    <label class="file-entry"
      ><span>{filename || translate(locale, 'workspace.choose', 'Choose an image')}</span><input
        data-testid="file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onchange={choose}
      /></label
    >
  </section>
  <section class="workspace" aria-busy={busy}>
    <div class="canvas-panel">
      {#if sourceUrl && outputUrl}<CompareCanvas
          beforeUrl={sourceUrl}
          afterUrl={outputUrl}
          alt={filename}
          {locale}
        />{:else}<div class="empty-canvas">
          <p>
            {translate(locale, 'workspace.empty', 'Your before-and-after preview appears here.')}
          </p>
        </div>{/if}
    </div>
    <div class="options-panel" role="region" aria-labelledby="options-heading">
      <h2 id="options-heading">{translate(locale, 'workspace.options', 'Options')}</h2>
      <GeneratedControls
        descriptions={relevant}
        {values}
        onChange={setValue}
        {locale}
      />{#if error}<p class="error">
          <strong>{translate(locale, 'error.process', 'Couldn’t process this image.')}</strong>
          {error}
          {translate(locale, 'error.remedy', 'Try JPEG, PNG, or WebP.')}
        </p>{/if}
    </div>
  </section>
  <footer class="action-bar">
    <div>
      <strong data-testid="size-prediction">{summary}</strong><span
        >{latency
          ? translate(locale, 'status.updated', 'Updated in {value} ms', Math.round(latency))
          : '\u00A0'}</span
      >
      <span class="target-progress" data-testid="target-progress" aria-live="polite"
        >{targetProgress || '\u00A0'}</span
      >
    </div>
    <button class="button primary" type="button" disabled={!outputUrl || busy} onclick={download}
      >{translate(locale, 'workspace.download', 'Download')}</button
    >
  </footer>
  <section class="faq">
    <h2>{translate(locale, 'workspace.questions', 'Questions')}</h2>
    <details>
      <summary>{translate(locale, 'faq.upload.title', 'Are images uploaded?')}</summary>
      <p>
        {translate(
          locale,
          'faq.upload.body',
          'No. Decoding, processing, preview, and export happen locally in your browser.',
        )}
      </p>
    </details>
    <details>
      <summary>{translate(locale, 'faq.preview.title', 'Does preview match export?')}</summary>
      <p>
        {translate(
          locale,
          'faq.preview.body',
          'The same recipe runs on the proxy and full-resolution export paths.',
        )}
      </p>
    </details>
    <details>
      <summary>{translate(locale, 'faq.loss.title', 'What can be lost during processing?')}</summary
      >
      <p>
        {translate(
          locale,
          'faq.loss.body',
          'Lossy formats can discard fine detail, and metadata is removed only when you select that option. The preview and size estimate make those choices visible before download.',
        )}
      </p>
    </details>
    <p>
      {translate(
        locale,
        'workspace.substance',
        'This tool works entirely in your browser. Choose an output format and quality, inspect the comparison, and download only when the result meets your needs.',
      )}
    </p>
    <p>
      <a href="/convert">{translate(locale, 'nav.convert', 'Convert')}</a> ·
      <a href="/compress">{translate(locale, 'nav.compress', 'Compress')}</a>
      ·
      <a href="/resize">{translate(locale, 'nav.resize', 'Resize')}</a>
      · <a href="/docs/formats/jpeg">{translate(locale, 'nav.jpegGuide', 'JPEG guide')}</a> ·
      <a href="/editor">{translate(locale, 'nav.editor', 'Editor')}</a>
      · <a href="/connect-ai">{translate(locale, 'nav.connectAi', 'Connect AI')}</a>
    </p>
  </section>
</main>
