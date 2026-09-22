<script lang="ts">
  import { onDestroy } from 'svelte';

  type Locale = 'en' | 'en-XA' | 'ar';
  type GeneratorMode = 'fbm' | 'value-noise' | 'radial-gradient';
  type Copy = {
    title: string;
    description: string;
    meta: string;
    width: string;
    height: string;
    seed: string;
    mode: string;
    fbm: string;
    valueNoise: string;
    radial: string;
    seedHelp: string;
    seedUnused: string;
    generate: string;
    generating: string;
    download: string;
    preview: string;
    local: string;
    scope: string;
    invalid: string;
    failed: string;
    done: (width: number, height: number) => string;
    back: string;
  };

  const copy: Record<Locale, Copy> = {
    en: {
      title: 'Procedural Generator',
      description:
        'Create a still grayscale noise texture or radial gradient in your browser. Choose a seed, set bounded dimensions, preview the PNG, and download it.',
      meta: 'Generate seeded grayscale noise or a radial gradient locally, preview it, and download a PNG.',
      width: 'Width in pixels',
      height: 'Height in pixels',
      seed: 'Seed',
      mode: 'Pattern',
      fbm: 'Fractal noise (seeded)',
      valueNoise: 'Value noise (seeded)',
      radial: 'Radial gradient',
      seedHelp: 'The same pattern and seed produce the same pixels.',
      seedUnused: 'The radial gradient does not use a seed.',
      generate: 'Generate preview',
      generating: 'Generating locally…',
      download: 'Download PNG',
      preview: 'Generated grayscale pattern preview',
      local: 'Generation runs in your browser. No image is uploaded.',
      scope: 'This first version creates only grayscale fractal noise, value noise, or a radial gradient.',
      invalid: 'Use whole-number dimensions from 16 to 512 pixels and a whole-number seed from −2147483648 to 2147483647.',
      failed: 'Could not create the pattern. Try smaller dimensions or another seed.',
      done: (width, height) => `Created a ${width} × ${height} pixel PNG locally.`,
      back: 'Back to tools',
    },
    'en-XA': {
      title: '⟦Procedural Generator⟧',
      description:
        '⟦Create a still grayscale noise texture or radial gradient in your browser. Choose a seed, set bounded dimensions, preview the PNG, and download it.⟧',
      meta: '⟦Generate seeded grayscale noise or a radial gradient locally, preview it, and download a PNG.⟧',
      width: '⟦Width in pixels⟧',
      height: '⟦Height in pixels⟧',
      seed: '⟦Seed⟧',
      mode: '⟦Pattern⟧',
      fbm: '⟦Fractal noise (seeded)⟧',
      valueNoise: '⟦Value noise (seeded)⟧',
      radial: '⟦Radial gradient⟧',
      seedHelp: '⟦The same pattern and seed produce the same pixels.⟧',
      seedUnused: '⟦The radial gradient does not use a seed.⟧',
      generate: '⟦Generate preview⟧',
      generating: '⟦Generating locally…⟧',
      download: '⟦Download PNG⟧',
      preview: '⟦Generated grayscale pattern preview⟧',
      local: '⟦Generation runs in your browser. No image is uploaded.⟧',
      scope: '⟦This first version creates only grayscale fractal noise, value noise, or a radial gradient.⟧',
      invalid: '⟦Use whole-number dimensions from 16 to 512 pixels and a whole-number seed from −2147483648 to 2147483647.⟧',
      failed: '⟦Could not create the pattern. Try smaller dimensions or another seed.⟧',
      done: (width, height) => `⟦Created a ${width} × ${height} pixel PNG locally.⟧`,
      back: '⟦Back to tools⟧',
    },
    ar: {
      title: 'مولّد الصور الإجرائي',
      description:
        'أنشئ نسيج ضوضاء رماديًا ثابتًا أو تدرجًا شعاعيًا في متصفحك. اختر بذرة وأبعادًا محدودة، ثم عاين صورة PNG ونزّلها.',
      meta: 'أنشئ ضوضاء رمادية ببذرة ثابتة أو تدرجًا شعاعيًا محليًا، وعاين صورة PNG ونزّلها.',
      width: 'العرض بالبكسل',
      height: 'الارتفاع بالبكسل',
      seed: 'البذرة',
      mode: 'النمط',
      fbm: 'ضوضاء كسرية (ببذرة)',
      valueNoise: 'ضوضاء القيم (ببذرة)',
      radial: 'تدرج شعاعي',
      seedHelp: 'تعطي الطريقة والبذرة نفسيهما البكسلات نفسها.',
      seedUnused: 'لا يستخدم التدرج الشعاعي بذرة.',
      generate: 'إنشاء معاينة',
      generating: 'جارٍ الإنشاء محليًا…',
      download: 'تنزيل PNG',
      preview: 'معاينة النمط الرمادي المُنشأ',
      local: 'يعمل الإنشاء في متصفحك. لا تُرفع أي صورة.',
      scope: 'ينشئ هذا الإصدار ضوضاء كسرية رمادية أو ضوضاء القيم أو تدرجًا شعاعيًا فقط.',
      invalid: 'استخدم أبعادًا صحيحة من 16 إلى 512 بكسل، وبذرة صحيحة من ‎−2147483648 إلى 2147483647.',
      failed: 'تعذر إنشاء النمط. جرّب أبعادًا أصغر أو بذرة أخرى.',
      done: (width, height) => `أُنشئت صورة PNG محلية بأبعاد ${width} × ${height} بكسل.`,
      back: 'العودة إلى الأدوات',
    },
  };

  type WorkerMessage =
    | { type: 'result'; width: number; height: number; data: ArrayBuffer }
    | { type: 'error' };

  let { locale = 'en' }: { locale?: Locale } = $props();
  const text = $derived(copy[locale] ?? copy.en);
  const prefix = $derived(locale === 'en' ? '' : `/${locale}`);
  const canonical = $derived(`https://image.complianttools.com${prefix}/generate`);

  let width = $state('256');
  let height = $state('256');
  let seed = $state('42');
  let mode = $state<GeneratorMode>('fbm');
  let previewUrl = $state('');
  let busy = $state(false);
  let status = $state('');
  let error = $state('');
  let activeWorker: Worker | undefined;
  let activeTask = 0;

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }

  function invalidateOutput() {
    clearPreview();
    status = '';
    error = '';
  }

  function parseOptions() {
    const w = Number(width);
    const h = Number(height);
    const parsedSeed = mode === 'radial-gradient' ? 0 : Number(seed);
    if (
      !Number.isSafeInteger(w) ||
      !Number.isSafeInteger(h) ||
      w < 16 ||
      h < 16 ||
      w > 512 ||
      h > 512 ||
      !Number.isSafeInteger(parsedSeed) ||
      parsedSeed < -2147483648 ||
      parsedSeed > 2147483647
    )
      return undefined;
    return { width: w, height: h, seed: parsedSeed };
  }

  async function generate() {
    invalidateOutput();
    const options = parseOptions();
    if (!options) {
      error = text.invalid;
      status = '';
      return;
    }

    activeTask += 1;
    const task = activeTask;
    activeWorker?.terminate();
    activeWorker = undefined;
    clearPreview();
    error = '';
    status = text.generating;
    busy = true;

    const worker = new Worker(new URL('../workers/t79-generator.worker.ts', import.meta.url), {
      type: 'module',
    });
    activeWorker = worker;
    worker.onmessage = async (event: MessageEvent<WorkerMessage>) => {
      if (task !== activeTask) return;
      worker.terminate();
      if (activeWorker === worker) activeWorker = undefined;
      if (event.data.type !== 'result') {
        busy = false;
        status = '';
        error = text.failed;
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = event.data.width;
        canvas.height = event.data.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable.');
        context.putImageData(
          new ImageData(
            new Uint8ClampedArray(event.data.data),
            event.data.width,
            event.data.height,
          ),
          0,
          0,
        );
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) => (result ? resolve(result) : reject(new Error('PNG encode failed.'))),
            'image/png',
          );
        });
        if (task !== activeTask) return;
        previewUrl = URL.createObjectURL(blob);
        status = text.done(event.data.width, event.data.height);
      } catch {
        if (task === activeTask) {
          status = '';
          error = text.failed;
        }
      } finally {
        if (task === activeTask) busy = false;
      }
    };
    worker.onerror = () => {
      if (task !== activeTask) return;
      worker.terminate();
      if (activeWorker === worker) activeWorker = undefined;
      busy = false;
      status = '';
      error = text.failed;
    };
    worker.postMessage({ ...options, mode });
  }

  onDestroy(() => {
    activeTask += 1;
    activeWorker?.terminate();
    clearPreview();
  });
</script>

<svelte:head>
  <title>{text.title} — Image Compliant Tools</title>
  <meta name="description" content={text.meta} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href="https://image.complianttools.com/generate" />
  <link rel="alternate" hreflang="en-XA" href="https://image.complianttools.com/en-XA/generate" />
  <link rel="alternate" hreflang="ar" href="https://image.complianttools.com/ar/generate" />
  <link rel="alternate" hreflang="x-default" href="https://image.complianttools.com/generate" />
  <meta property="og:title" content={text.title} />
  <meta property="og:description" content={text.meta} />
</svelte:head>

<main class="t79-page" lang={locale === 'en' ? 'en' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a class="t79-back" href={`${prefix}/convert`}>{text.back}</a>
  <header>
    <h1>{text.title}</h1>
    <p>{text.description}</p>
    <p class="t79-local">{text.local}</p>
  </header>

  <section class="t79-tool" aria-label={text.title}>
    <div class="t79-controls">
      <label>
        <span>{text.width}</span>
        <input
          data-testid="t79-width"
          type="number"
          min="16"
          max="512"
          step="1"
          bind:value={width}
          oninput={invalidateOutput}
          disabled={busy}
        />
      </label>
      <label>
        <span>{text.height}</span>
        <input
          data-testid="t79-height"
          type="number"
          min="16"
          max="512"
          step="1"
          bind:value={height}
          oninput={invalidateOutput}
          disabled={busy}
        />
      </label>
      <label>
        <span>{text.mode}</span>
        <select data-testid="t79-mode" bind:value={mode} onchange={invalidateOutput} disabled={busy}>
          <option value="fbm">{text.fbm}</option>
          <option value="value-noise">{text.valueNoise}</option>
          <option value="radial-gradient">{text.radial}</option>
        </select>
      </label>
      <label>
        <span>{text.seed}</span>
        <input
          data-testid="t79-seed"
          type="number"
          min="-2147483648"
          max="2147483647"
          step="1"
          bind:value={seed}
          oninput={invalidateOutput}
          disabled={busy || mode === 'radial-gradient'}
        />
      </label>
      <p class="t79-help">{mode === 'radial-gradient' ? text.seedUnused : text.seedHelp}</p>
      <p class="t79-scope">{text.scope}</p>
      <button
        data-testid="t79-generate"
        class="t79-primary"
        type="button"
        onclick={() => void generate()}
        disabled={busy}
      >
        {busy ? text.generating : text.generate}
      </button>
      {#if previewUrl}
        <a
          data-testid="t79-download"
          class="t79-download"
          href={previewUrl}
          download={`procedural-${mode}.png`}>{text.download}</a
        >
      {/if}
      {#if error}
        <p data-testid="t79-error" class="t79-error" role="alert">{error}</p>
      {/if}
      <p data-testid="t79-status" role="status" aria-live="polite">{status}</p>
    </div>

    <section class="t79-preview" aria-label={text.preview}>
      {#if previewUrl}
        <img data-testid="t79-preview-image" src={previewUrl} alt={text.preview} />
      {:else}
        <p>{text.preview}</p>
      {/if}
    </section>
  </section>
</main>

<style>
  .t79-page {
    max-width: 1120px;
    margin: 0 auto;
    padding: 32px 24px 72px;
    color: #1c1a17;
  }
  .t79-back {
    display: inline-block;
    margin-bottom: 24px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  header {
    max-width: 760px;
    margin: 0 auto 28px;
    text-align: center;
  }
  h1 {
    margin: 8px 0 14px;
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 550;
    letter-spacing: -0.04em;
  }
  header p { color: #5c5a56; line-height: 1.6; }
  .t79-local { font-size: 0.9rem; }
  .t79-tool {
    display: grid;
    grid-template-columns: minmax(250px, 340px) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }
  .t79-controls,
  .t79-preview {
    border: 1px solid #1c1a1724;
    border-radius: 12px;
    background: #fff;
    padding: 24px;
  }
  .t79-controls { display: grid; gap: 14px; }
  label { display: grid; gap: 6px; font-size: 0.94rem; }
  input,
  select {
    width: 100%;
    min-height: 42px;
    padding: 8px 10px;
    border: 1px solid #1c1a1740;
    border-radius: 6px;
    background: white;
    color: inherit;
  }
  input:disabled { opacity: 0.55; }
  .t79-help,
  .t79-scope {
    margin: 0;
    color: #5c5a56;
    font-size: 0.88rem;
    line-height: 1.5;
  }
  .t79-primary,
  .t79-download {
    display: inline-flex;
    min-height: 42px;
    align-items: center;
    justify-content: center;
    border: 1px solid #1c1a17;
    border-radius: 24px;
    padding: 8px 18px;
    background: #1c1a17;
    color: white;
    cursor: pointer;
    text-align: center;
  }
  .t79-primary:disabled { opacity: 0.55; cursor: wait; }
  .t79-download { background: white; color: #1c1a17; }
  .t79-error { margin: 0; color: #a32020; }
  .t79-preview {
    min-height: 420px;
    display: grid;
    place-items: center;
    overflow: auto;
    background-color: #f6f4f0;
  }
  .t79-preview p { color: #5c5a56; text-align: center; }
  .t79-preview img {
    display: block;
    max-width: 100%;
    max-height: 70vh;
    object-fit: contain;
    image-rendering: pixelated;
  }
  @media (max-width: 760px) {
    .t79-tool { grid-template-columns: 1fr; }
    .t79-preview { min-height: 280px; }
  }
</style>
