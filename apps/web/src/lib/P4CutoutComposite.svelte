<script lang="ts">
  import { onDestroy } from 'svelte';

  type Locale = 'en' | 'en-XA' | 'ar';
  type Kind = 'expand-image' | 'remove-background' | 'replace-background' | 'cutout' | 'composite';

  type Copy = {
    title: string;
    description: string;
    meta: string;
    choose: string;
    backgroundChoose: string;
    chooseHelp: string;
    tolerance: string;
    toleranceHelp: string;
    fill: string;
    width: string;
    height: string;
    run: string;
    processing: string;
    ready: string;
    preview: string;
    download: string;
    privacy: string;
    faq1: string;
    faq1Answer: string;
    faq2: string;
    faq2Answer: string;
    faq3: string;
    faq3Answer: string;
  };

  const EN: Copy = {
    title: 'Cutout and Composite',
    description:
      'Prepare transparent cutouts, expand a canvas, replace a background, or composite two images locally in your browser.',
    meta: 'Expand an image, remove or replace its background, refine a cutout, and composite images locally without an upload.',
    choose: 'Choose a foreground image',
    backgroundChoose: 'Choose a background image',
    chooseHelp: 'PNG, JPEG, or WebP up to 16 MiB and 12 megapixels.',
    tolerance: 'Background tolerance',
    toleranceHelp:
      'Pixels connected to the image edge and close to the top-left colour become transparent.',
    fill: 'Fill colour',
    width: 'Output width',
    height: 'Output height',
    run: 'Prepare image',
    processing: 'Processing locally…',
    ready: 'Choose an image to begin.',
    preview: 'Processed image preview',
    download: 'Download PNG',
    privacy: 'Images stay in this browser. No upload, model, or network service is used.',
    faq1: 'Is a segmentation model used?',
    faq1Answer:
      'No. This bounded route uses a deterministic edge-connected colour flood fill. Inspect the result before publishing.',
    faq2: 'Can I expand beyond the source canvas?',
    faq2Answer:
      'Yes. Expand Image places the source on a new canvas and fills the added area with the selected colour.',
    faq3: 'Can I use a transparent cutout in another image?',
    faq3Answer:
      'Yes. Replace Background and Seamless Composite keep the processing local and export a PNG with alpha where applicable.',
  };

  const AR: Copy = {
    title: 'قص وتركيب الصور',
    description:
      'أنشئ قصاصات شفافة أو وسّع اللوحة أو استبدل الخلفية أو ركّب صورتين محليًا في المتصفح.',
    meta: 'وسّع الصورة أو أزل الخلفية أو استبدلها أو ركّب الصور محليًا دون رفع الملف.',
    choose: 'اختر صورة المقدمة',
    backgroundChoose: 'اختر صورة الخلفية',
    chooseHelp: 'PNG أو JPEG أو WebP حتى 16 ميبيبايت و12 ميغابكسل.',
    tolerance: 'تسامح الخلفية',
    toleranceHelp: 'تصبح البكسلات المتصلة بحافة الصورة والقريبة من لون الزاوية العلوية شفافة.',
    fill: 'لون الملء',
    width: 'عرض الإخراج',
    height: 'ارتفاع الإخراج',
    run: 'إعداد الصورة',
    processing: 'جارٍ التنفيذ محليًا…',
    ready: 'اختر صورة للبدء.',
    preview: 'معاينة الصورة المعالجة',
    download: 'تنزيل PNG',
    privacy: 'تبقى الصور في هذا المتصفح. لا يتم رفعها ولا تُستخدم نماذج أو خدمات شبكة.',
    faq1: 'هل تُستخدم نماذج تقسيم؟',
    faq1Answer:
      'لا. يستخدم هذا المسار المحدود ملءً لونيًا متصلًا بالحافة بطريقة حتمية. افحص النتيجة قبل النشر.',
    faq2: 'هل يمكن توسيع اللوحة خارج حجم المصدر؟',
    faq2Answer: 'نعم. يضع توسيع الصورة المصدر على لوحة جديدة ويملأ المساحة المضافة باللون المحدد.',
    faq3: 'هل يمكن استخدام القصاصة الشفافة في صورة أخرى؟',
    faq3Answer:
      'نعم. يحافظ استبدال الخلفية والتركيب السلس على المعالجة المحلية ويصدر PNG عند الحاجة.',
  };

  const KIND_TITLES: Record<Kind, { readonly en: string; readonly ar: string }> = {
    'expand-image': { en: 'Expand Image', ar: 'توسيع الصورة' },
    'remove-background': { en: 'Remove Background', ar: 'إزالة الخلفية' },
    'replace-background': { en: 'Replace Background', ar: 'استبدال الخلفية' },
    cutout: { en: 'Cutout Refine', ar: 'تحسين القصاصة' },
    composite: { en: 'Seamless Composite', ar: 'تركيب سلس' },
  };

  const pseudo = (value: string) =>
    `⟦${value.replace(/[aeiou]/giu, (vowel) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[vowel.toLowerCase()] ?? vowel)}⟧`;

  let { kind, locale = 'en' }: { kind: Kind; locale?: Locale } = $props();
  let foregroundFile = $state<File>();
  let backgroundFile = $state<File>();
  let foregroundUrl = $state('');
  let outputUrl = $state('');
  let status = $state('');
  let error = $state('');
  let busy = $state(false);
  let tolerance = $state(40);
  let fillColor = $state('#ffffff');
  let outputWidth = $state(0);
  let outputHeight = $state(0);

  const copy = $derived(locale === 'ar' ? AR : EN);
  const t = (value: string) => (locale === 'en-XA' ? pseudo(value) : value);
  const routePath = $derived(`/${kind}`);
  const path = $derived(locale === 'en' ? routePath : `/${locale}${routePath}`);
  const title = $derived(t(locale === 'ar' ? KIND_TITLES[kind].ar : KIND_TITLES[kind].en));
  const description = $derived(t(copy.meta));
  const faq = $derived([
    { question: t(copy.faq1), answer: t(copy.faq1Answer) },
    { question: t(copy.faq2), answer: t(copy.faq2Answer) },
    { question: t(copy.faq3), answer: t(copy.faq3Answer) },
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

  function clearOutput() {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = '';
  }

  function chooseFile(event: Event, target: 'foreground' | 'background') {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      error = 'Choose a PNG, JPEG, or WebP image.';
      return;
    }
    if (target === 'foreground') {
      if (foregroundUrl) URL.revokeObjectURL(foregroundUrl);
      foregroundFile = file;
      foregroundUrl = URL.createObjectURL(file);
    } else {
      backgroundFile = file;
    }
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
      if (image.naturalWidth * image.naturalHeight > 12_000_000) throw new Error('Image too large');
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function colourDistance(data: Uint8ClampedArray, offset: number, rgb: readonly number[]) {
    const dr = data[offset]! - rgb[0]!;
    const dg = data[offset + 1]! - rgb[1]!;
    const db = data[offset + 2]! - rgb[2]!;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  /** Removes only the edge-connected colour region, preserving similarly coloured subjects. */
  function removeBackground(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas is unavailable');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    const seed = [data[0]!, data[1]!, data[2]!];
    const seen = new Uint8Array(canvas.width * canvas.height);
    const stack: number[] = [];
    const add = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
      const index = y * canvas.width + x;
      if (seen[index]) return;
      seen[index] = 1;
      stack.push(index);
    };
    for (let x = 0; x < canvas.width; x += 1) {
      add(x, 0);
      add(x, canvas.height - 1);
    }
    for (let y = 1; y < canvas.height - 1; y += 1) {
      add(0, y);
      add(canvas.width - 1, y);
    }
    const threshold = Math.max(0, Math.min(255, tolerance));
    while (stack.length) {
      const index = stack.pop()!;
      const offset = index * 4;
      if (colourDistance(data, offset, seed) > threshold) continue;
      data[offset + 3] = 0;
      const x = index % canvas.width;
      const y = Math.floor(index / canvas.width);
      add(x - 1, y);
      add(x + 1, y);
      add(x, y - 1);
      add(x, y + 1);
    }
    context.putImageData(pixels, 0, 0);
  }

  function fill(canvas: HTMLCanvasElement, colour: string) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.fillStyle = colour;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))),
        'image/png',
      );
    });
  }

  async function process() {
    if (!foregroundFile || busy) return;
    busy = true;
    error = '';
    clearOutput();
    try {
      const source = await decode(foregroundFile);
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = source.naturalWidth;
      sourceCanvas.height = source.naturalHeight;
      const sourceContext = sourceCanvas.getContext('2d');
      if (!sourceContext) throw new Error('Canvas is unavailable');
      sourceContext.drawImage(source, 0, 0);

      let output = sourceCanvas;
      if (kind === 'expand-image') {
        const width = Math.max(sourceCanvas.width, outputWidth || sourceCanvas.width + 128);
        const height = Math.max(sourceCanvas.height, outputHeight || sourceCanvas.height + 128);
        output = document.createElement('canvas');
        output.width = width;
        output.height = height;
        fill(output, fillColor);
        output
          .getContext('2d')!
          .drawImage(
            sourceCanvas,
            Math.round((width - sourceCanvas.width) / 2),
            Math.round((height - sourceCanvas.height) / 2),
          );
      } else if (kind === 'remove-background' || kind === 'cutout') {
        removeBackground(output);
      } else if (kind === 'replace-background') {
        removeBackground(output);
        const background = document.createElement('canvas');
        background.width = output.width;
        background.height = output.height;
        fill(background, fillColor);
        background.getContext('2d')!.drawImage(output, 0, 0);
        output = background;
      } else {
        if (!backgroundFile) throw new Error('Choose a background image first.');
        const backgroundImage = await decode(backgroundFile);
        const background = document.createElement('canvas');
        background.width = backgroundImage.naturalWidth;
        background.height = backgroundImage.naturalHeight;
        const backgroundContext = background.getContext('2d');
        if (!backgroundContext) throw new Error('Canvas is unavailable');
        backgroundContext.drawImage(backgroundImage, 0, 0);
        removeBackground(output);
        const scale = Math.min(
          (background.width * 0.72) / output.width,
          (background.height * 0.72) / output.height,
        );
        const width = Math.max(1, Math.round(output.width * scale));
        const height = Math.max(1, Math.round(output.height * scale));
        backgroundContext.drawImage(
          output,
          Math.round((background.width - width) / 2),
          Math.round((background.height - height) / 2),
          width,
          height,
        );
        output = background;
      }

      const blob = await encode(output);
      outputUrl = URL.createObjectURL(blob);
      status = t(copy.download);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Processing failed.';
    } finally {
      busy = false;
    }
  }

  function downloadName() {
    const stem = (foregroundFile?.name ?? 'image')
      .replace(/\.[^.]+$/u, '')
      .replace(/[^a-z0-9_-]/giu, '_');
    return `${stem}-${kind}.png`;
  }

  onDestroy(() => {
    if (foregroundUrl) URL.revokeObjectURL(foregroundUrl);
    clearOutput();
  });
</script>

<svelte:head>
  <title>{title} — Image Compliant Tools</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={`https://image.complianttools.com${path}`} />
  <link rel="alternate" hreflang="en" href={`https://image.complianttools.com${routePath}`} />
  <link
    rel="alternate"
    hreflang="en-XA"
    href={`https://image.complianttools.com/en-XA${routePath}`}
  />
  <link rel="alternate" hreflang="ar" href={`https://image.complianttools.com/ar${routePath}`} />
  <link
    rel="alternate"
    hreflang="x-default"
    href={`https://image.complianttools.com${routePath}`}
  />
  <!-- prettier-ignore -->
  <script type="application/ld+json">
{JSON.stringify(graph)}
  </script>
</svelte:head>

<main class="tool-page p4-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <header class="tool-intro">
    <p class="eyebrow">{t('Local image tool')}</p>
    <h1>{title}</h1>
    <p>{t(copy.description)}</p>
    <p class="privacy">{t(copy.privacy)}</p>
  </header>

  <section class="controls" aria-label={t('Image controls')}>
    <label>
      <span>{t(copy.choose)}</span>
      <input
        data-testid="p4-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onchange={(event) => chooseFile(event, 'foreground')}
      />
    </label>
    <p class="help">{t(copy.chooseHelp)}</p>
    {#if kind === 'composite'}
      <label>
        <span>{t(copy.backgroundChoose)}</span>
        <input
          data-testid="p4-background-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onchange={(event) => chooseFile(event, 'background')}
        />
      </label>
    {/if}
    {#if kind !== 'expand-image'}
      <label>
        <span>{t(copy.tolerance)}: {tolerance}</span>
        <input
          data-testid="p4-tolerance"
          type="range"
          min="0"
          max="255"
          step="1"
          bind:value={tolerance}
        />
      </label>
      <p class="help">{t(copy.toleranceHelp)}</p>
    {/if}
    {#if kind === 'expand-image' || kind === 'replace-background'}
      <label>
        <span>{t(copy.fill)}</span>
        <input data-testid="p4-fill" type="color" bind:value={fillColor} />
      </label>
    {/if}
    {#if kind === 'expand-image'}
      <div class="dimensions">
        <label
          ><span>{t(copy.width)}</span><input
            data-testid="p4-width"
            type="number"
            min="1"
            bind:value={outputWidth}
          /></label
        >
        <label
          ><span>{t(copy.height)}</span><input
            data-testid="p4-height"
            type="number"
            min="1"
            bind:value={outputHeight}
          /></label
        >
      </div>
    {/if}
    <button
      data-testid="p4-run"
      class="button primary"
      type="button"
      disabled={busy || !foregroundFile}
      onclick={process}
    >
      {busy ? t(copy.processing) : t(copy.run)}
    </button>
    {#if status}<p data-testid="p4-status" role="status" aria-live="polite">{status}</p>{:else}<p
        data-testid="p4-status"
        role="status"
        aria-live="polite"
      >
        {t(copy.ready)}
      </p>{/if}
    {#if error}<p class="error" data-testid="p4-error" role="alert">{t(error)}</p>{/if}
  </section>

  {#if foregroundUrl}<figure class="source">
      <img src={foregroundUrl} alt={t('Selected source image')} />
      <figcaption>{t('Selected source image')}</figcaption>
    </figure>{/if}
  {#if outputUrl}
    <section class="result" aria-label={t(copy.preview)}>
      <figure>
        <img data-testid="p4-preview" src={outputUrl} alt={t(copy.preview)} />
        <figcaption>{t(copy.preview)}</figcaption>
      </figure>
      <a data-testid="p4-download" class="button primary" href={outputUrl} download={downloadName()}
        >{t(copy.download)}</a
      >
    </section>
  {/if}

  <section class="tool-completion faq" aria-label={t('Questions about this tool')}>
    <h2>{t('Questions about this tool')}</h2>
    {#each faq as item (item.question)}<details>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>{/each}
  </section>
</main>

<style>
  .p4-page {
    max-width: 1120px;
    margin: 0 auto;
    padding: 0 16px 48px;
  }
  .controls,
  .result,
  .source,
  .faq {
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
  input[type='number'] {
    max-width: 160px;
    min-height: 38px;
    padding: 6px;
  }
  input[type='color'] {
    width: 56px;
    height: 38px;
    padding: 2px;
  }
  .dimensions {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
  }
  .help,
  .privacy,
  .source figcaption,
  .result figcaption {
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
  .source figcaption,
  .result figcaption {
    margin-top: 10px;
  }
  .result {
    display: grid;
    gap: 18px;
  }
  .result figure {
    margin: 0;
  }
  .result .button {
    justify-self: start;
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
