<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    AdjustOptionsSchema,
    applyAdjustments,
    applyEnhanceToggle,
    applyRecolour,
    applyCurves,
    convertColorSpace,
    createRaster,
    extractPalette,
    type RasterImage,
  } from '@complianttools/image-engine';

  type Locale = 'en' | 'en-XA' | 'ar';
  type Kind =
    'adjust' | 'filters' | 'curves' | 'color-space' | 'enhance' | 'color-picker' | 'recolor';
  type Filter = 'grayscale' | 'sepia' | 'invert';
  type CurvePreset = 'identity' | 'lift' | 's-curve';
  type Space = 'srgb' | 'display-p3' | 'adobe-rgb-compatible' | 'gray';
  type PaletteEntry = {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly population: number;
  };

  const TITLES: Record<Kind, { readonly en: string; readonly ar: string }> = {
    adjust: { en: 'Adjust', ar: 'ضبط الصورة' },
    filters: { en: 'Filters', ar: 'المرشحات' },
    curves: { en: 'Curves', ar: 'المنحنيات' },
    'color-space': { en: 'Colour Space', ar: 'مساحة الألوان' },
    enhance: { en: 'Enhance', ar: 'تحسين الصورة' },
    'color-picker': { en: 'Colour Picker', ar: 'منتقي الألوان' },
    recolor: { en: 'Recolour', ar: 'إعادة تلوين' },
  };

  const EN = {
    description: 'Apply deterministic colour adjustments and analysis locally in your browser.',
    meta: 'Adjust, filter, curve, enhance, recolour, analyse, and convert image colour locally without an upload.',
    choose: 'Choose a raster image',
    chooseHelp: 'PNG, JPEG, or WebP up to 16 MiB and 6 megapixels.',
    run: 'Process image',
    processing: 'Processing locally…',
    ready: 'Choose an image to begin.',
    download: 'Download PNG',
    preview: 'Processed image preview',
    privacy: 'The image stays in this browser. No upload, model, or network service is used.',
    brightness: 'Brightness',
    contrast: 'Contrast',
    saturation: 'Saturation',
    filter: 'Filter',
    grayscale: 'Grayscale',
    sepia: 'Sepia',
    invert: 'Invert',
    curve: 'Curve preset',
    identity: 'Identity',
    lift: 'Lift midtones',
    sCurve: 'S-curve contrast',
    space: 'Target colour space',
    srgb: 'sRGB',
    p3: 'Display P3',
    adobe: 'Adobe RGB compatible',
    gray: 'Gray',
    amount: 'Enhancement amount',
    count: 'Palette colours',
    method: 'Palette method',
    kmeans: 'K-means',
    medianCut: 'Median cut',
    hue: 'Target hue',
    tolerance: 'Hue tolerance',
    replacement: 'Replacement colour',
    faq1: 'Are images uploaded?',
    faq1Answer: 'No. Decoding, processing, palette extraction, and PNG export run locally.',
    faq2: 'Are the results deterministic?',
    faq2Answer:
      'Yes. The controls call fixed engine formulas and the palette seed is fixed for repeatable output.',
    faq3: 'Can I undo a result?',
    faq3Answer:
      'The source file is never changed. Choose it again or adjust the controls to produce a new preview.',
  } as const;

  const AR = {
    ...EN,
    description: 'طبّق تعديلات وتحليلات لونية حتمية محليًا في المتصفح.',
    meta: 'اضبط الألوان أو طبّق المرشحات أو المنحنيات أو التحسين أو إعادة التلوين محليًا دون رفع الصورة.',
    choose: 'اختر صورة نقطية',
    chooseHelp: 'PNG أو JPEG أو WebP حتى 16 ميبيبايت و6 ميغابكسلات.',
    run: 'معالجة الصورة',
    processing: 'جارٍ التنفيذ محليًا…',
    ready: 'اختر صورة للبدء.',
    download: 'تنزيل PNG',
    preview: 'معاينة الصورة المعالجة',
    privacy: 'تبقى الصورة في هذا المتصفح. لا يتم رفعها ولا تُستخدم نماذج أو خدمات شبكة.',
    brightness: 'السطوع',
    contrast: 'التباين',
    saturation: 'التشبع',
    filter: 'المرشح',
    grayscale: 'تدرج رمادي',
    sepia: 'بني داكن',
    invert: 'عكس الألوان',
    curve: 'إعداد المنحنى',
    identity: 'هوية',
    lift: 'رفع الدرجات المتوسطة',
    sCurve: 'تباين منحنى S',
    space: 'مساحة الألوان المستهدفة',
    srgb: 'sRGB',
    p3: 'Display P3',
    adobe: 'Adobe RGB متوافق',
    gray: 'رمادي',
    amount: 'مقدار التحسين',
    count: 'ألوان اللوحة',
    method: 'طريقة اللوحة',
    kmeans: 'K-means',
    medianCut: 'قص الوسيط',
    hue: 'درجة اللون المستهدفة',
    tolerance: 'تسامح درجة اللون',
    replacement: 'لون الاستبدال',
    faq1: 'هل يتم رفع الصور؟',
    faq1Answer: 'لا. فك الترميز والمعالجة واستخراج اللوحة وتصدير PNG محلية.',
    faq2: 'هل النتائج حتمية؟',
    faq2Answer: 'نعم. تستخدم عناصر التحكم صيغًا ثابتة وبذرة لوحة ثابتة لإخراج قابل للتكرار.',
    faq3: 'هل يمكنني التراجع عن النتيجة؟',
    faq3Answer: 'لا يتغير الملف المصدر. اختره مجددًا أو عدّل عناصر التحكم لإنشاء معاينة جديدة.',
  } as const;

  const pseudo = (value: string) =>
    `⟦${value.replace(/[aeiou]/giu, (vowel) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[vowel.toLowerCase()] ?? vowel)}⟧`;

  let { kind, locale = 'en' }: { kind: Kind; locale?: Locale } = $props();
  let sourceFile = $state<File>();
  let sourceUrl = $state('');
  let outputUrl = $state('');
  let status = $state('');
  let error = $state('');
  let busy = $state(false);
  let brightness = $state(0);
  let contrast = $state(0);
  let saturation = $state(0);
  let filter = $state<Filter>('grayscale');
  let curve = $state<CurvePreset>('identity');
  let space = $state<Space>('srgb');
  let amount = $state(50);
  let paletteCount = $state(8);
  let paletteMethod = $state<'kmeans' | 'median-cut'>('kmeans');
  let targetHue = $state(0);
  let hueTolerance = $state(15);
  let replacement = $state('#00aaff');
  let palette = $state<readonly PaletteEntry[]>([]);

  const title = $derived(pseudoIf(locale, locale === 'ar' ? TITLES[kind].ar : TITLES[kind].en));
  const description = $derived(pseudoIf(locale, locale === 'ar' ? AR.description : EN.description));
  const meta = $derived(pseudoIf(locale, locale === 'ar' ? AR.meta : EN.meta));
  const path = $derived(`/${kind}`);
  const canonicalPath = $derived(locale === 'en' ? path : `/${locale}${path}`);
  const copy = $derived(locale === 'ar' ? AR : EN);
  const faq = $derived([
    { question: pseudoIf(locale, copy.faq1), answer: pseudoIf(locale, copy.faq1Answer) },
    { question: pseudoIf(locale, copy.faq2), answer: pseudoIf(locale, copy.faq2Answer) },
    { question: pseudoIf(locale, copy.faq3), answer: pseudoIf(locale, copy.faq3Answer) },
  ]);
  const graph = $derived({
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
        mainEntity: faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
  });
  void graph;

  function pseudoIf(currentLocale: Locale, value: string) {
    return currentLocale === 'en-XA' ? pseudo(value) : value;
  }

  function clearOutput() {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = '';
    palette = [];
  }

  function choose(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      error = 'Choose a PNG, JPEG, or WebP image.';
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceFile = file;
    sourceUrl = URL.createObjectURL(file);
    clearOutput();
    error = '';
    status = file.name;
  }

  async function decode(file: File): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('Invalid image');
      if (image.naturalWidth * image.naturalHeight > 6_000_000) throw new Error('Image too large');
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function toRaster(canvas: HTMLCanvasElement): RasterImage {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas is unavailable');
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return createRaster(canvas.width, canvas.height, new Uint8ClampedArray(data));
  }

  function putRaster(canvas: HTMLCanvasElement, raster: RasterImage) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.putImageData(
      new ImageData(new Uint8ClampedArray(raster.frames[0]!.data), raster.width, raster.height),
      0,
      0,
    );
  }

  function hexColour(value: string): { r: number; g: number; b: number } {
    const hex = value.replace('#', '');
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }

  function applyFilter(raster: RasterImage): RasterImage {
    const data = new Uint8ClampedArray(raster.frames[0]!.data);
    for (let offset = 0; offset < data.length; offset += 4) {
      const r = data[offset]!;
      const g = data[offset + 1]!;
      const b = data[offset + 2]!;
      if (filter === 'grayscale') {
        const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        data[offset] = gray;
        data[offset + 1] = gray;
        data[offset + 2] = gray;
      } else if (filter === 'sepia') {
        data[offset] = Math.min(255, Math.round(0.393 * r + 0.769 * g + 0.189 * b));
        data[offset + 1] = Math.min(255, Math.round(0.349 * r + 0.686 * g + 0.168 * b));
        data[offset + 2] = Math.min(255, Math.round(0.272 * r + 0.534 * g + 0.131 * b));
      } else {
        data[offset] = 255 - r;
        data[offset + 1] = 255 - g;
        data[offset + 2] = 255 - b;
      }
    }
    return createRaster(raster.width, raster.height, data);
  }

  function applyCurve(raster: RasterImage): RasterImage {
    if (curve === 'identity') return raster;
    const points =
      curve === 'lift'
        ? ([
            [0, 0],
            [64, 82],
            [128, 150],
            [192, 210],
            [255, 255],
          ] as const)
        : ([
            [0, 0],
            [64, 45],
            [128, 128],
            [192, 211],
            [255, 255],
          ] as const);
    return applyCurves(raster, { rgb: points });
  }

  async function process() {
    if (!sourceFile || busy) return;
    busy = true;
    clearOutput();
    error = '';
    try {
      const image = await decode(sourceFile);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      context.drawImage(image, 0, 0);
      let raster = toRaster(canvas);
      if (kind === 'adjust') {
        raster = applyAdjustments(
          raster,
          AdjustOptionsSchema.parse({ brightness, contrast, saturation, exposure: 0, gamma: 1 }),
        );
      } else if (kind === 'filters') {
        raster = applyFilter(raster);
      } else if (kind === 'curves') {
        raster = applyCurve(raster);
      } else if (kind === 'color-space') {
        raster = convertColorSpace(raster, space, 8, false, false);
      } else if (kind === 'enhance') {
        raster = applyEnhanceToggle(raster, amount);
      } else if (kind === 'recolor') {
        raster = applyRecolour(raster, {
          targetHue,
          tolerance: hueTolerance,
          replacement: hexColour(replacement),
          feather: 8,
        });
      } else {
        const extracted = extractPalette(raster, paletteMethod, paletteCount, 0x5eed0000);
        palette = extracted.entries;
      }
      putRaster(canvas, raster);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('PNG export failed'))),
          'image/png',
        ),
      );
      outputUrl = URL.createObjectURL(blob);
      status = pseudoIf(locale, copy.download);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Processing failed.';
    } finally {
      busy = false;
    }
  }

  onDestroy(() => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    clearOutput();
  });
</script>

<svelte:head>
  <title>{title} — Image Compliant Tools</title>
  <meta name="description" content={meta} />
  <link rel="canonical" href={`https://image.complianttools.com${canonicalPath}`} />
  <link rel="alternate" hreflang="en" href={`https://image.complianttools.com${path}`} />
  <link rel="alternate" hreflang="en-XA" href={`https://image.complianttools.com/en-XA${path}`} />
  <link rel="alternate" hreflang="ar" href={`https://image.complianttools.com/ar${path}`} />
  <link rel="alternate" hreflang="x-default" href={`https://image.complianttools.com${path}`} />
  <!-- prettier-ignore -->
  <script type="application/ld+json">
{JSON.stringify(graph)}
  </script>
</svelte:head>

<main class="tool-page advanced-colour" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <header class="tool-intro">
    <p class="eyebrow">{pseudoIf(locale, 'Local image tool')}</p>
    <h1>{title}</h1>
    <p>{description}</p>
    <p class="privacy">{pseudoIf(locale, copy.privacy)}</p>
  </header>
  <section class="controls" aria-label={pseudoIf(locale, 'Image controls')}>
    <label><span>{pseudoIf(locale, copy.choose)}</span><input data-testid="p3a-file-input" type="file" accept="image/png,image/jpeg,image/webp" onchange={choose} /></label>
    <p class="help">{pseudoIf(locale, copy.chooseHelp)}</p>
    {#if kind === 'adjust'}
      <label><span>{pseudoIf(locale, copy.brightness)}: {brightness}</span><input data-testid="p3a-brightness" type="range" min="-100" max="100" bind:value={brightness} /></label>
      <label><span>{pseudoIf(locale, copy.contrast)}: {contrast}</span><input data-testid="p3a-contrast" type="range" min="-100" max="100" bind:value={contrast} /></label>
      <label><span>{pseudoIf(locale, copy.saturation)}: {saturation}</span><input data-testid="p3a-saturation" type="range" min="-100" max="100" bind:value={saturation} /></label>
    {:else if kind === 'filters'}
      <label><span>{pseudoIf(locale, copy.filter)}</span><select data-testid="p3a-filter" bind:value={filter}><option value="grayscale">{pseudoIf(locale, copy.grayscale)}</option><option value="sepia">{pseudoIf(locale, copy.sepia)}</option><option value="invert">{pseudoIf(locale, copy.invert)}</option></select></label>
    {:else if kind === 'curves'}
      <label><span>{pseudoIf(locale, copy.curve)}</span><select data-testid="p3a-curve" bind:value={curve}><option value="identity">{pseudoIf(locale, copy.identity)}</option><option value="lift">{pseudoIf(locale, copy.lift)}</option><option value="s-curve">{pseudoIf(locale, copy.sCurve)}</option></select></label>
    {:else if kind === 'color-space'}
      <label><span>{pseudoIf(locale, copy.space)}</span><select data-testid="p3a-space" bind:value={space}><option value="srgb">{pseudoIf(locale, copy.srgb)}</option><option value="display-p3">{pseudoIf(locale, copy.p3)}</option><option value="adobe-rgb-compatible">{pseudoIf(locale, copy.adobe)}</option><option value="gray">{pseudoIf(locale, copy.gray)}</option></select></label>
    {:else if kind === 'enhance'}
      <label><span>{pseudoIf(locale, copy.amount)}: {amount}</span><input data-testid="p3a-amount" type="range" min="0" max="100" bind:value={amount} /></label>
    {:else if kind === 'color-picker'}
      <label><span>{pseudoIf(locale, copy.count)}: {paletteCount}</span><input data-testid="p3a-count" type="range" min="2" max="16" bind:value={paletteCount} /></label>
      <label><span>{pseudoIf(locale, copy.method)}</span><select data-testid="p3a-method" bind:value={paletteMethod}><option value="kmeans">{pseudoIf(locale, copy.kmeans)}</option><option value="median-cut">{pseudoIf(locale, copy.medianCut)}</option></select></label>
    {:else}
      <label><span>{pseudoIf(locale, copy.hue)}: {targetHue}</span><input data-testid="p3a-hue" type="range" min="0" max="360" bind:value={targetHue} /></label>
      <label><span>{pseudoIf(locale, copy.tolerance)}: {hueTolerance}</span><input data-testid="p3a-tolerance" type="range" min="0" max="180" bind:value={hueTolerance} /></label>
      <label><span>{pseudoIf(locale, copy.replacement)}</span><input data-testid="p3a-replacement" type="color" bind:value={replacement} /></label>
    {/if}
    <button data-testid="p3a-run" class="button primary" type="button" disabled={busy || !sourceFile} onclick={process}>{busy ? pseudoIf(locale, copy.processing) : pseudoIf(locale, copy.run)}</button>
    {#if status}<p data-testid="p3a-status" role="status" aria-live="polite">{status}</p>{:else}<p data-testid="p3a-status" role="status" aria-live="polite">{pseudoIf(locale, copy.ready)}</p>{/if}
    {#if error}<p class="error" role="alert" data-testid="p3a-error">{pseudoIf(locale, error)}</p>{/if}
  </section>
  {#if sourceUrl}<figure class="source"><img src={sourceUrl} alt={pseudoIf(locale, 'Selected source image')} /><figcaption>{pseudoIf(locale, 'Selected source image')}</figcaption></figure>{/if}
  {#if outputUrl}<section class="result"><figure><img data-testid="p3a-preview" src={outputUrl} alt={pseudoIf(locale, copy.preview)} /><figcaption>{pseudoIf(locale, copy.preview)}</figcaption></figure><a data-testid="p3a-download" class="button primary" href={outputUrl} download={`${kind}.png`}>{pseudoIf(locale, copy.download)}</a></section>{/if}
  {#if kind === 'color-picker' && palette.length}
    <section class="palette" data-testid="p3a-palette" aria-label={pseudoIf(locale, 'Extracted palette')}>
      {#each palette as entry, index (index)}<div class="swatch" style={`background:rgb(${entry.r} ${entry.g} ${entry.b})`} title={`rgb(${entry.r}, ${entry.g}, ${entry.b})`}><span>{entry.r},{entry.g},{entry.b}</span></div>{/each}
    </section>
  {/if}
  <section class="tool-completion faq"><h2>{pseudoIf(locale, 'Questions about this tool')}</h2>{#each faq as item (item.question)}<details><summary>{item.question}</summary><p>{item.answer}</p></details>{/each}</section>
</main>

<style>
  .advanced-colour {
    max-width: 1120px;
    margin: 0 auto;
    padding: 0 16px 48px;
  }
  .controls,
  .result,
  .source,
  .faq,
  .palette {
    margin: 24px auto;
    padding: 20px;
    border: 1px solid #1c1a1720;
    border-radius: 12px;
    background: #fff;
  }
  .controls {
    display: grid;
    gap: 14px;
  }
  label {
    display: grid;
    gap: 8px;
    font-weight: 600;
  }
  input[type='file'] {
    font-weight: 400;
  }
  input[type='range'] {
    accent-color: #165dff;
  }
  input[type='color'] {
    width: 56px;
    height: 38px;
    padding: 2px;
  }
  select {
    min-height: 38px;
    max-width: 320px;
  }
  .help,
  .privacy,
  figure figcaption {
    color: #5c5a56;
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .source {
    max-width: 700px;
  }
  .source img,
  .result img {
    display: block;
    max-width: 100%;
    max-height: 560px;
    object-fit: contain;
    margin: 0 auto;
    background: #f2f2f2;
  }
  figure {
    margin: 0;
  }
  figure figcaption {
    margin-top: 10px;
  }
  .result {
    display: grid;
    gap: 18px;
  }
  .result .button {
    justify-self: start;
  }
  .palette {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .swatch {
    width: 94px;
    height: 70px;
    display: grid;
    align-items: end;
    border-radius: 8px;
    border: 1px solid #0003;
    overflow: hidden;
  }
  .swatch span {
    background: #fff;
    color: #111;
    font-size: 0.75rem;
    padding: 4px;
  }
  .faq details {
    border-top: 1px solid #1c1a1720;
    padding: 12px 0;
  }
  .faq summary {
    cursor: pointer;
    font-weight: 600;
  }
  .error {
    color: #a01818;
  }
</style>
