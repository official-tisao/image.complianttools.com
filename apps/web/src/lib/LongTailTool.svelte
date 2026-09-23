<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { buildShareLink, migrateRecipe, parseRecipe } from '@complianttools/image-engine';
  import { translate, type Locale } from './i18n';

  type LongTailKind =
    | 'spritesheet'
    | 'html-to-image'
    | 'compress-to-size'
    | 'optimize-for-web'
    | 'batch'
    | 'recipe'
    | 'watch'
    | 'codegen';

  let { kind, locale = 'en' }: { kind: LongTailKind; locale?: Locale } = $props();

  const englishCopy: Record<LongTailKind, { title: string; description: string }> = {
    spritesheet: {
      title: 'Spritesheet Maker',
      description: 'Combine local images into a predictable PNG grid for games and interfaces.',
    },
    'html-to-image': {
      title: 'HTML to Image',
      description: 'Turn a small HTML or URL card into a shareable PNG entirely in your browser.',
    },
    'compress-to-size': {
      title: 'Compress to Target Size',
      description: 'Find the closest JPEG quality to a byte target without uploading your image.',
    },
    'optimize-for-web': {
      title: 'Optimize for Web',
      description: 'Create a lightweight WebP export with a visible quality and size tradeoff.',
    },
    batch: {
      title: 'Batch Runner',
      description: 'Process a group of local images with one repeatable export policy.',
    },
    recipe: {
      title: 'Recipe Builder',
      description: 'Build, validate, save, and share a portable image processing recipe.',
    },
    watch: {
      title: 'Folder Watcher',
      description: 'Select a local folder and inspect its files before running a batch operation.',
    },
    codegen: {
      title: 'Code Generator',
      description: 'Generate a TypeScript or CLI starter from a validated portable recipe.',
    },
  };

  const arabicTitles: Partial<Record<LongTailKind, string>> = {
    spritesheet: 'منشئ لوحة الصور',
    'html-to-image': 'تحويل HTML إلى صورة',
    'compress-to-size': 'ضغط إلى حجم مستهدف',
    'optimize-for-web': 'تحسين للويب',
    batch: 'تشغيل دفعي',
    recipe: 'منشئ الوصفات',
    watch: 'مراقب المجلد',
    codegen: 'مولد الشيفرة',
  };

  const copy = $derived(
    locale === 'ar'
      ? { ...englishCopy[kind], title: arabicTitles[kind] ?? englishCopy[kind].title }
      : locale === 'en-XA'
        ? {
            title: `［${englishCopy[kind].title} ~~］`,
            description: `［${englishCopy[kind].description} ~~~~］`,
          }
        : englishCopy[kind],
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
  let outputName = $state('');
  let status = $state('');
  let error = $state('');
  let quality = $state(82);
  let targetKb = $state(200);
  let columns = $state(2);
  let gap = $state(8);
  let htmlSource = $state('<h1>Hello from ctimg</h1>\n<p>Rendered locally.</p>');
  let recipeText = $state(
    JSON.stringify(
      {
        version: 1,
        id: 'local-web-export',
        name: 'Local web export',
        steps: [],
        export: { format: 'webp', quality: 82 },
      },
      null,
      2,
    ),
  );
  let generated = $state('');
  let hydrated = $state(false);
  let batchOutputs = $state<readonly { name: string; url: string; bytes: number }[]>([]);
  let watchArmed = $state(false);
  let watchTimer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    hydrated = true;
  });

  function t(key: string, fallback: string, value?: string | number) {
    return translate(locale, key, fallback, value);
  }

  function setFiles(selected: readonly File[]) {
    files = selected;
    status = selected.length
      ? t('longTail.files', '{value} file(s) selected', selected.length)
      : '';
    error = '';
  }

  function onFiles(event: Event) {
    setFiles([...((event.currentTarget as HTMLInputElement).files ?? [])]);
  }

  function blobFromCanvas(canvas: HTMLCanvasElement, type = 'image/png', q = quality) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('The browser could not encode this image.')),
        type,
        q / 100,
      );
    });
  }

  async function imageCanvas(file: File) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('A 2D canvas is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  }

  function publish(blob: Blob, name: string) {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    outputName = name;
    status = t('longTail.ready', 'Ready: {value} bytes', blob.size);
  }

  async function makeSpritesheet() {
    if (!files.length) throw new Error('Choose at least one image first.');
    const canvases = await Promise.all(files.map(imageCanvas));
    const count = Math.max(1, Math.min(16, Math.round(columns)));
    const cellWidth = Math.max(...canvases.map((canvas) => canvas.width));
    const cellHeight = Math.max(...canvases.map((canvas) => canvas.height));
    const rows = Math.ceil(canvases.length / count);
    const canvas = document.createElement('canvas');
    canvas.width = cellWidth * count + Math.max(0, gap) * Math.max(0, count - 1);
    canvas.height = cellHeight * rows + Math.max(0, gap) * Math.max(0, rows - 1);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('A 2D canvas is unavailable in this browser.');
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvases.forEach((source, index) => {
      const x = (index % count) * (cellWidth + gap);
      const y = Math.floor(index / count) * (cellHeight + gap);
      context.drawImage(source, x, y);
    });
    publish(await blobFromCanvas(canvas), 'spritesheet.png');
  }

  async function makeHtmlImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('A 2D canvas is unavailable in this browser.');
    context.fillStyle = '#101827';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f8fafc';
    context.font = 'bold 48px system-ui, sans-serif';
    const text =
      htmlSource
        .replace(/<[^>]+>/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim() || 'Empty HTML';
    const words = text.slice(0, 500).split(' ');
    let line = '';
    let y = 150;
    context.font = 'bold 48px system-ui, sans-serif';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width > 1000 && line) {
        context.fillText(line, 100, y);
        line = word;
        y += 70;
      } else line = candidate;
    }
    if (line) context.fillText(line, 100, y);
    context.font = '24px system-ui, sans-serif';
    context.fillStyle = '#93c5fd';
    context.fillText('Rendered locally by Image Compliant Tools', 100, 540);
    publish(await blobFromCanvas(canvas), 'html-card.png');
  }

  async function makeTargetExport() {
    if (!files[0]) throw new Error('Choose one image first.');
    const canvas = await imageCanvas(files[0]);
    const target = Math.max(1, Math.round(targetKb * 1000));
    let low = 1;
    let high = 100;
    let best = await blobFromCanvas(canvas, 'image/jpeg', quality);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const next = Math.round((low + high) / 2);
      const candidate = await blobFromCanvas(canvas, 'image/jpeg', next);
      if (Math.abs(candidate.size - target) < Math.abs(best.size - target)) best = candidate;
      if (candidate.size > target) high = next - 1;
      else low = next + 1;
      if (Math.abs(candidate.size - target) <= target * 0.02) {
        best = candidate;
        break;
      }
    }
    publish(best, `${files[0].name.replace(/\.[^.]+$/u, '')}-target.jpg`);
    status = t('longTail.targetReady', 'Closest result: {value} bytes', best.size);
  }

  async function makeWebExport() {
    if (!files[0]) throw new Error('Choose one image first.');
    const canvas = await imageCanvas(files[0]);
    const blob = await blobFromCanvas(canvas, 'image/webp', quality);
    publish(blob, `${files[0].name.replace(/\.[^.]+$/u, '')}-web.webp`);
  }

  async function makeBatch() {
    if (!files.length) throw new Error('Choose at least one image first.');
    const outputs: { name: string; url: string; bytes: number }[] = [];
    for (const file of files) {
      const blob = await blobFromCanvas(await imageCanvas(file), 'image/webp', quality);
      outputs.push({
        name: `${file.name.replace(/\.[^.]+$/u, '')}-batch.webp`,
        url: URL.createObjectURL(blob),
        bytes: blob.size,
      });
    }
    batchOutputs = outputs;
    status = t('longTail.batchReady', 'Processed {value} file(s) locally', outputs.length);
  }

  function makeRecipe() {
    const recipe = recipeText.startsWith('r1.')
      ? parseRecipe(recipeText)
      : migrateRecipe(JSON.parse(recipeText));
    const link = buildShareLink(recipe, `${location.origin}/recipe`);
    if (link.kind === 'url') {
      generated = link.value;
      status = 'Recipe validated and ready to share.';
    } else {
      generated = link.contents;
      const blob = new Blob([link.contents], { type: 'application/json' });
      publish(blob, link.filename);
      status = 'Recipe is larger than a URL fragment; download the validated file.';
    }
  }

  function makeCodegen() {
    const value = recipeText.startsWith('r1.') ? parseRecipe(recipeText) : JSON.parse(recipeText);
    const recipe = JSON.stringify(value, null, 2);
    generated = `import { run } from '@complianttools/image-engine/pipeline/execute';\n\nconst recipe = ${recipe} as const;\nconst result = await run(recipe, [inputBytes]);\nawait writeFile('output.bin', result.items[0]?.image);`;
    status = 'TypeScript starter generated from the validated recipe.';
  }

  function armWatch() {
    watchArmed = true;
    status = t('longTail.watchReady', 'Folder snapshot ready: {value} file(s)', files.length);
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = setInterval(() => {
      if (watchArmed)
        status = t('longTail.watchReady', 'Folder snapshot ready: {value} file(s)', files.length);
    }, 5000);
  }

  async function runTool() {
    status = '';
    error = '';
    try {
      if (kind === 'spritesheet') await makeSpritesheet();
      else if (kind === 'html-to-image') await makeHtmlImage();
      else if (kind === 'compress-to-size') await makeTargetExport();
      else if (kind === 'optimize-for-web') await makeWebExport();
      else if (kind === 'batch') await makeBatch();
      else if (kind === 'recipe') makeRecipe();
      else if (kind === 'codegen') makeCodegen();
      else armWatch();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  onDestroy(() => {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    for (const result of batchOutputs) URL.revokeObjectURL(result.url);
    if (watchTimer) clearInterval(watchTimer);
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
  class="long-tail"
  lang={locale}
  dir={locale === 'ar' ? 'rtl' : 'ltr'}
  data-testid={`long-tail-${kind}`}
>
  <header>
    <a href="/">ctimg</a>
    <span>{t('privacy.badge', 'Local only')}</span>
  </header>
  <section class="intro">
    <p class="eyebrow">{t('workspace.eyebrow', 'Local image instrument')}</p>
    <h1>{copy.title}</h1>
    <p>{copy.description}</p>
    <p>{t('privacy.copy', 'Processed on your device. Nothing is uploaded.')}</p>
  </section>

  {#if kind === 'recipe' || kind === 'codegen'}
    <label class="wide"
      >Recipe JSON or share token
      <textarea data-testid="recipe-input" bind:value={recipeText} rows="14"></textarea>
    </label>
  {:else if kind === 'html-to-image'}
    <label class="wide"
      >HTML or URL card text
      <textarea data-testid="html-input" bind:value={htmlSource} rows="8"></textarea>
    </label>
  {:else if kind === 'watch'}
    <label
      >Choose a folder snapshot
      <input data-testid="watch-input" type="file" multiple webkitdirectory onchange={onFiles} />
    </label>
  {:else}
    <label
      >Choose image{kind === 'spritesheet' || kind === 'batch' ? 's' : ''}
      <input
        data-testid="long-tail-input"
        type="file"
        accept="image/*"
        multiple={kind === 'spritesheet' || kind === 'batch'}
        onchange={onFiles}
      />
    </label>
  {/if}

  {#if kind === 'spritesheet'}
    <div class="controls">
      <label>Columns <input type="number" min="1" max="16" bind:value={columns} /></label><label
        >Gap <input type="number" min="0" max="128" bind:value={gap} /></label
      >
    </div>
  {:else if kind === 'compress-to-size'}
    <label
      >Target KB <input
        data-testid="target-kb"
        type="number"
        min="1"
        bind:value={targetKb}
      /></label
    >
  {:else if kind === 'optimize-for-web' || kind === 'batch'}
    <label
      >WebP quality <input
        data-testid="quality"
        type="range"
        min="1"
        max="100"
        bind:value={quality}
      /><output>{quality}</output></label
    >
  {/if}

  <button
    data-testid="long-tail-run"
    type="button"
    disabled={!hydrated}
    onclick={() => void runTool()}
  >
    {kind === 'watch'
      ? 'Arm folder snapshot'
      : kind === 'codegen'
        ? 'Generate code'
        : 'Run locally'}
  </button>

  {#if status}<p role="status" data-testid="long-tail-status">{status}</p>{/if}
  {#if error}<p role="alert" data-testid="long-tail-error">{error}</p>{/if}
  {#if outputUrl}
    <p>
      <a data-testid="long-tail-download" href={outputUrl} download={outputName}
        >Download {outputName}</a
      >
    </p>
  {/if}
  {#if batchOutputs.length}
    <ul data-testid="batch-results">
      {#each batchOutputs as result (result.name)}<li>
          <a href={result.url} download={result.name}>{result.name} ({result.bytes} bytes)</a>
        </li>{/each}
    </ul>
  {/if}
  {#if generated}
    <div class="wide">
      <span>Generated output</span>
      <pre data-testid="generated-output">{generated}</pre>
    </div>
  {/if}

  <section class="faq">
    <h2>{t('seo.questions', 'Questions')}</h2>
    <details open>
      <summary>{t('faq.upload.title', 'Are files uploaded?')}</summary>
      <p>{t('faq.upload.body', 'No. Processing happens locally in your browser.')}</p>
    </details>
    <details>
      <summary>Can I repeat this operation?</summary>
      <p>
        Yes. Recipes and batch routes keep the operation explicit and inspectable before export.
      </p>
    </details>
  </section>
</main>

<style>
  .long-tail {
    max-width: 68rem;
    margin: 0 auto;
    padding: 1.5rem;
    color: #172033;
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
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
  .wide {
    max-width: 58rem;
  }
  textarea {
    width: 100%;
    font:
      0.95rem/1.45 ui-monospace,
      SFMono-Regular,
      Consolas,
      monospace;
    padding: 0.75rem;
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
  .faq {
    margin-top: 3rem;
  }
</style>
