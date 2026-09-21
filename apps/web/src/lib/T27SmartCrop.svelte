<script lang="ts">
  import { onDestroy } from 'svelte';
  import type {
    OptionDescription,
    SmartCropOptions,
  } from '@complianttools/image-engine/schemas/options';
  import {
    SmartCropOptionsSchema,
    smartCropToolOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import {
    approximateSaliencyCropRect,
    centerCropRect,
    ruleOfThirdsCropRect,
    smartCropAnalysisSize,
  } from '@complianttools/image-engine/ops/smart-crop';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  type Locale = 'en' | 'en-XA' | 'ar';
  type Method = SmartCropOptions['method'];
  type RatioId = SmartCropOptions['ratio'];
  type Dimensions = { readonly width: number; readonly height: number };
  type Crop = {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  type ErrorKind =
    | 'unsupported-file'
    | 'file-too-large'
    | 'image-too-large'
    | 'animated-image'
    | 'invalid-image'
    | 'decode-failed'
    | 'canvas-unavailable'
    | 'output-too-large'
    | 'processing-failed';

  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_PIXELS = 12_000_000;
  const MAX_OUTPUT_BYTES = 24 * 1024 * 1024;
  const ORIGIN = 'https://image.complianttools.com';
  const RATIOS: Readonly<Record<Exclude<RatioId, 'original'>, number>> = {
    square: 1,
    portrait: 4 / 5,
    landscape: 3 / 2,
    wide: 16 / 9,
  };

  // Translators: keep PNG, JPEG, MiB, pixel counts, and aspect-ratio numerals unchanged.
  const en = {
    title: 'Smart Crop',
    description:
      'Crop a still image to a chosen aspect ratio with a centered, rule-of-thirds, or approximate visual-saliency placement. Processing stays in your browser.',
    metaDescription:
      'Crop a still PNG or JPEG to a chosen aspect ratio. Compare center, rule-of-thirds, and approximate visual-saliency placement locally in your browser.',
    eyebrow: 'Local image tool',
    privacy: 'Your image stays in this browser. No upload, model, or network service is used.',
    chooseImage: 'Choose a still PNG or JPEG',
    inputHelp: 'Still PNG or JPEG, up to 20 MiB and 12 megapixels.',
    aspect: 'Crop aspect ratio',
    original: 'Original ratio',
    ratioHelp: 'Original ratio keeps the whole image; other choices crop to a fixed ratio.',
    square: 'Square · 1:1',
    portrait: 'Portrait · 4:5',
    landscape: 'Landscape · 3:2',
    wide: 'Wide · 16:9',
    placement: 'Crop placement',
    methodHelp: 'Placement changes only where the selected crop is taken from.',
    center: 'Center crop',
    thirds: 'Rule-of-thirds placement',
    saliency: 'Visual-saliency estimate',
    centerHelp: 'Places the crop in the center of the image.',
    thirdsHelp:
      'Moves the image center toward the nearest rule-of-thirds grid intersection where the crop allows.',
    saliencyHelp:
      'Uses local colour variation and edge contrast as a rough visual-interest estimate. It does not recognize subjects or faces.',
    run: 'Preview crop',
    ready: 'Choose an image, then select a crop ratio and placement.',
    busy: 'Preparing the crop locally…',
    source: 'Source image and crop boundary',
    result: 'Cropped preview',
    done: 'Preview ready. Check the crop before downloading.',
    download: 'Download cropped PNG',
    dimensions: 'Output dimensions',
    helpTitle: 'About the placement options',
    helpCenter: 'Center placement keeps the crop centered and is a useful baseline.',
    helpThirds:
      'Rule-of-thirds placement uses the image center as its focal point. You can inspect the boundary before exporting.',
    helpSaliency:
      'The saliency estimate scores colour variation and edge contrast in a small image preview. It is a heuristic and may miss the subject; inspect the crop and try another placement when needed.',
    related: 'Related tools',
    convert: 'Convert images',
    errorPrefix: 'Try this',
    errors: {
      'unsupported-file': 'Choose a PNG or JPEG image.',
      'file-too-large': 'The selected image exceeds the 20 MiB file limit.',
      'image-too-large': 'The image must be at most 12 megapixels.',
      'animated-image': 'Animated PNG is not supported.',
      'invalid-image': 'The image file is incomplete or invalid.',
      'decode-failed': 'The browser could not decode this image.',
      'canvas-unavailable': 'The browser could not create a local image canvas.',
      'output-too-large': 'The cropped PNG exceeds the 24 MiB output limit.',
      'processing-failed': 'The local crop could not be prepared.',
    } satisfies Record<ErrorKind, string>,
    remedies: {
      'unsupported-file': 'Export the image as a still PNG or JPEG and choose it again.',
      'file-too-large': 'Choose an image smaller than 20 MiB.',
      'image-too-large': 'Choose a smaller image with no more than 12 megapixels.',
      'animated-image': 'Export a single still frame as a regular PNG.',
      'invalid-image': 'Export a valid PNG or JPEG and try again.',
      'decode-failed': 'Try exporting a valid, non-animated PNG or JPEG.',
      'canvas-unavailable': 'Try a browser with local 2D canvas support.',
      'output-too-large': 'Choose a smaller source image or a different crop ratio.',
      'processing-failed': 'Try again with a smaller image. Your source file is unchanged.',
    } satisfies Record<ErrorKind, string>,
  } as const;

  // Translators: preserve PNG, JPEG, MiB, pixel counts, and ratio numerals in Arabic copy.
  const ar = {
    title: 'اقتصاص ذكي',
    description:
      'اقتص الصورة الثابتة إلى نسبة أبعاد محددة مع توسيط أو وضع تقريبي وفق قاعدة الأثلاث أو التباين البصري. تتم المعالجة في المتصفح.',
    metaDescription:
      'اقتص صور PNG أو JPEG ثابتة إلى نسبة أبعاد محددة، وقارن مواضع الاقتصاص محليًا في المتصفح.',
    eyebrow: 'أداة صور محلية',
    privacy: 'تبقى الصورة في هذا المتصفح. لا يتم رفعها ولا تُستخدم نماذج أو خدمات شبكة.',
    chooseImage: 'اختر صورة PNG أو JPEG ثابتة',
    inputHelp: 'صورة PNG أو JPEG ثابتة، حتى 20 ميبيبايت و12 ميغابكسل.',
    aspect: 'نسبة أبعاد الاقتصاص',
    original: 'النسبة الأصلية',
    ratioHelp: 'تحافظ النسبة الأصلية على الصورة كاملة؛ أما الخيارات الأخرى فتقصها إلى نسبة ثابتة.',
    square: 'مربع · 1:1',
    portrait: 'عمودي · 4:5',
    landscape: 'أفقي · 3:2',
    wide: 'عريض · 16:9',
    placement: 'موضع الاقتصاص',
    methodHelp: 'يغيّر الموضع مكان الاقتصاص المحدد فقط.',
    center: 'اقتصاص من الوسط',
    thirds: 'موضع وفق قاعدة الأثلاث',
    saliency: 'تقدير البروز البصري',
    centerHelp: 'يضع الاقتصاص في وسط الصورة.',
    thirdsHelp: 'يحرّك مركز الصورة نحو أقرب نقطة تقاطع لشبكة الأثلاث ضمن حدود الاقتصاص.',
    saliencyHelp:
      'يستخدم اختلاف الألوان وحوافها كتقدير تقريبي للاهتمام البصري، ولا يتعرف على الأشخاص أو الوجوه.',
    run: 'معاينة الاقتصاص',
    ready: 'اختر صورة ثم حدد نسبة الاقتصاص وموضعه.',
    busy: 'جارٍ إعداد الاقتصاص محليًا…',
    source: 'الصورة الأصلية وحدود الاقتصاص',
    result: 'معاينة الصورة المقصوصة',
    done: 'المعاينة جاهزة. افحص الاقتصاص قبل التنزيل.',
    download: 'تنزيل PNG المقصوصة',
    dimensions: 'أبعاد الإخراج',
    helpTitle: 'حول خيارات موضع الاقتصاص',
    helpCenter: 'يحافظ خيار الوسط على الاقتصاص في منتصف الصورة وهو خط أساس مفيد.',
    helpThirds: 'يستخدم خيار الأثلاث مركز الصورة كنقطة تركيز. افحص الحدود قبل التصدير.',
    helpSaliency:
      'يقيّم التقدير اختلاف الألوان والحواف في معاينة صغيرة. هو أسلوب تقريبي وقد لا يحدد العنصر المطلوب؛ افحص الاقتصاص وجرب موضعًا آخر عند الحاجة.',
    related: 'أدوات ذات صلة',
    convert: 'تحويل الصور',
    errorPrefix: 'جرّب هذا',
    errors: {
      'unsupported-file': 'اختر صورة PNG أو JPEG.',
      'file-too-large': 'يتجاوز حجم الصورة حد 20 ميبيبايت.',
      'image-too-large': 'يجب ألا تتجاوز الصورة 12 ميغابكسل.',
      'animated-image': 'لا يدعم PNG المتحرك.',
      'invalid-image': 'ملف الصورة غير مكتمل أو غير صالح.',
      'decode-failed': 'تعذر على المتصفح فك ترميز الصورة.',
      'canvas-unavailable': 'تعذر إنشاء لوحة صور محلية.',
      'output-too-large': 'تتجاوز صورة PNG المقصوصة حد 24 ميبيبايت.',
      'processing-failed': 'تعذر إعداد الاقتصاص محليًا.',
    } satisfies Record<ErrorKind, string>,
    remedies: {
      'unsupported-file': 'صدّر الصورة بصيغة PNG أو JPEG ثابتة ثم اخترها مجددًا.',
      'file-too-large': 'اختر صورة أصغر من 20 ميبيبايت.',
      'image-too-large': 'اختر صورة أصغر لا تتجاوز 12 ميغابكسل.',
      'animated-image': 'صدّر إطارًا ثابتًا واحدًا بصيغة PNG عادية.',
      'invalid-image': 'صدّر PNG أو JPEG صالحة ثم أعد المحاولة.',
      'decode-failed': 'جرّب تصدير PNG أو JPEG صالحة غير متحركة.',
      'canvas-unavailable': 'جرّب متصفحًا يدعم لوحة 2D محلية.',
      'output-too-large': 'اختر صورة مصدر أصغر أو نسبة اقتصاص أخرى.',
      'processing-failed': 'أعد المحاولة بصورة أصغر. يبقى الملف الأصلي دون تغيير.',
    } satisfies Record<ErrorKind, string>,
  } as const;

  type TextKey = Exclude<keyof typeof en, 'errors' | 'remedies'>;
  let { locale = 'en' }: { locale?: Locale } = $props();
  let sourceFile = $state<File>();
  let sourceUrl = $state('');
  let outputUrl = $state('');
  let sourceDimensions = $state<Dimensions>();
  let outputDimensions = $state<Dimensions>();
  let cropBox = $state<Crop>();
  let options = $state<SmartCropOptions>(SmartCropOptionsSchema.parse({}));
  let busy = $state(false);
  let status = $state('');
  let error = $state<ErrorKind>();
  let selectionNumber = 0;

  const pseudo = (value: string) =>
    `⟦${value.replace(/[aeiou]/giu, (vowel) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[vowel.toLowerCase()] ?? vowel)}⟧`;
  const t = (key: TextKey) => {
    const value = locale === 'ar' ? ar[key] : en[key];
    return locale === 'en-XA' ? pseudo(value) : value;
  };
  const optionValues = $derived({
    't27.ratio': options.ratio,
    't27.method': options.method,
  });
  const optionDescriptions = $derived<Record<string, OptionDescription>>({
    't27.ratio': {
      ...smartCropToolOptionDescriptions['t27.ratio']!,
      label: t('aspect'),
      help: t('ratioHelp'),
      optionLabels: {
        original: t('original'),
        square: t('square'),
        portrait: t('portrait'),
        landscape: t('landscape'),
        wide: t('wide'),
      },
    },
    't27.method': {
      ...smartCropToolOptionDescriptions['t27.method']!,
      label: t('placement'),
      help: t('methodHelp'),
      optionLabels: {
        center: t('center'),
        thirds: t('thirds'),
        saliency: t('saliency'),
      },
    },
  });
  const path = $derived(locale === 'en' ? '/smart-crop' : `/${locale}/smart-crop`);
  const title = $derived(t('title'));
  const description = $derived(t('metaDescription'));
  const faq = $derived([
    { question: t('center'), answer: t('helpCenter') },
    { question: t('thirds'), answer: t('helpThirds') },
    { question: t('saliency'), answer: t('helpSaliency') },
  ]);

  function errorText(kind: ErrorKind) {
    const selected = locale === 'ar' ? ar : en;
    const main = selected.errors[kind];
    const remedy = selected.remedies[kind];
    return `${locale === 'en-XA' ? pseudo(main) : main} ${t('errorPrefix')}: ${locale === 'en-XA' ? pseudo(remedy) : remedy}`;
  }

  function clearOutput() {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = '';
    outputDimensions = undefined;
    cropBox = undefined;
  }

  async function inspectImage(file: File): Promise<Dimensions> {
    if (file.size > MAX_FILE_BYTES) throw new Error('file-too-large');
    if (file.type !== 'image/png' && file.type !== 'image/jpeg')
      throw new Error('unsupported-file');
    const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const isPng =
      head.length >= 24 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => head[index] === byte);
    const isJpeg = head.length >= 4 && head[0] === 0xff && head[1] === 0xd8;
    if (file.type === 'image/png' && !isPng) throw new Error('invalid-image');
    if (file.type === 'image/jpeg' && !isJpeg) throw new Error('invalid-image');

    if (isPng) {
      if (String.fromCharCode(...head.slice(12, 16)) !== 'IHDR') throw new Error('invalid-image');
      const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
      const dimensions = { width: view.getUint32(16), height: view.getUint32(20) };
      if (
        !dimensions.width ||
        !dimensions.height ||
        dimensions.width * dimensions.height > MAX_PIXELS
      )
        throw new Error('image-too-large');
      let offset = 8;
      let foundImageData = false;
      for (let count = 0; count < 256 && offset + 8 <= file.size; count += 1) {
        const chunk = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
        if (chunk.length !== 8) break;
        const view = new DataView(chunk.buffer, chunk.byteOffset, 4);
        const length = view.getUint32(0);
        const type = String.fromCharCode(...chunk.slice(4, 8));
        if (type === 'acTL') throw new Error('animated-image');
        if (type === 'IDAT') {
          foundImageData = true;
          break;
        }
        if (type === 'IEND' || offset + length + 12 > file.size) break;
        offset += length + 12;
      }
      if (!foundImageData) throw new Error('invalid-image');
      return dimensions;
    }

    // Read JPEG markers without decoding pixel data, so oversized dimensions are rejected first.
    const bytes = new Uint8Array(
      await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer(),
    );
    let offset = 2;
    const sof = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    while (offset + 4 <= bytes.length) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if (sof.has(marker)) {
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        if (!width || !height || width * height > MAX_PIXELS) throw new Error('image-too-large');
        return { width, height };
      }
      offset += length;
    }
    throw new Error('invalid-image');
  }

  async function chooseImage(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const task = ++selectionNumber;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = '';
    sourceFile = undefined;
    clearOutput();
    error = undefined;
    status = '';
    try {
      const dimensions = await inspectImage(file);
      if (task !== selectionNumber) return;
      sourceDimensions = dimensions;
      sourceFile = file;
      sourceUrl = URL.createObjectURL(file);
      status = file.name;
    } catch (cause) {
      if (task !== selectionNumber) return;
      sourceDimensions = undefined;
      error =
        cause instanceof Error && cause.message in en.errors
          ? (cause.message as ErrorKind)
          : 'invalid-image';
    }
  }

  function targetCrop(dimensions: Dimensions, targetRatio: number): Crop {
    return centerCropRect(dimensions.width, dimensions.height, targetRatio);
  }

  function placementCrop(image: ImageBitmap, targetRatio: number, placement: Method): Crop {
    const dimensions = { width: image.width, height: image.height };
    const center = targetCrop(dimensions, targetRatio);
    const maxX = Math.max(0, dimensions.width - center.width);
    const maxY = Math.max(0, dimensions.height - center.height);
    if (placement === 'center' || (!maxX && !maxY)) return center;
    if (placement === 'thirds') return ruleOfThirdsCropRect(image.width, image.height, center);
    return saliencyCrop(image, center);
  }

  function saliencyCrop(image: ImageBitmap, base: Crop): Crop {
    const { width, height, scale } = smartCropAnalysisSize(image.width, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('canvas-unavailable');
    context.drawImage(image, 0, 0, width, height);
    return approximateSaliencyCropRect(base, context.getImageData(0, 0, width, height), scale);
  }

  async function previewCrop() {
    if (!sourceFile || !sourceDimensions || busy) return;
    busy = true;
    error = undefined;
    status = '';
    clearOutput();
    let bitmap: ImageBitmap | undefined;
    try {
      try {
        bitmap = await createImageBitmap(sourceFile);
      } catch {
        throw new Error('decode-failed');
      }
      if (bitmap.width !== sourceDimensions.width || bitmap.height !== sourceDimensions.height)
        throw new Error('decode-failed');
      const targetRatio =
        options.ratio === 'original'
          ? sourceDimensions.width / sourceDimensions.height
          : RATIOS[options.ratio];
      const crop = placementCrop(bitmap, targetRatio, options.method);
      const width = Math.max(1, Math.round(crop.width));
      const height = Math.max(1, Math.round(crop.height));
      if (!width || !height || width * height > MAX_PIXELS) throw new Error('image-too-large');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas-unavailable');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('processing-failed'))),
          'image/png',
        );
      });
      if (blob.size > MAX_OUTPUT_BYTES) throw new Error('output-too-large');
      outputUrl = URL.createObjectURL(blob);
      outputDimensions = { width, height };
      cropBox = crop;
      status = t('done');
    } catch (cause) {
      error =
        cause instanceof Error && cause.message in en.errors
          ? (cause.message as ErrorKind)
          : 'processing-failed';
    } finally {
      bitmap?.close();
      busy = false;
    }
  }

  function updateOption(path: string, value: unknown) {
    const candidate =
      path === 't27.ratio'
        ? { ...options, ratio: value }
        : path === 't27.method'
          ? { ...options, method: value }
          : undefined;
    if (!candidate) return;
    const parsed = SmartCropOptionsSchema.safeParse(candidate);
    if (!parsed.success) return;
    options = parsed.data;
    clearOutput();
    status = '';
    error = undefined;
  }

  /* eslint-disable no-control-regex -- Reject ASCII control bytes in exported filenames. */
  function downloadName(file: File) {
    const stem =
      file.name
        .replace(/\.[^.]+$/u, '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '_')
        .slice(0, 100) || 'image';
    return `${stem}-crop.png`;
  }

  const canonical = $derived(`${ORIGIN}${path}`);
  const schema = $derived({
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

  onDestroy(() => {
    selectionNumber += 1;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    clearOutput();
  });
</script>

<svelte:head>
  <title>{title} — Image Compliant Tools</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${ORIGIN}/smart-crop`} />
  <link rel="alternate" hreflang="en-XA" href={`${ORIGIN}/en-XA/smart-crop`} />
  <link rel="alternate" hreflang="ar" href={`${ORIGIN}/ar/smart-crop`} />
  <link rel="alternate" hreflang="x-default" href={`${ORIGIN}/smart-crop`} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={`${ORIGIN}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(schema)}</svelte:element
  >
</svelte:head>

<main class="tool-page t27-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <header class="tool-intro">
    <p class="eyebrow">{t('eyebrow')}</p>
    <h1>{title}</h1>
    <p>{t('description')}</p>
    <p class="privacy-copy">{t('privacy')}</p>
  </header>

  <section class="t27-controls" aria-labelledby="t27-controls-heading">
    <h2 id="t27-controls-heading">
      {locale === 'ar'
        ? 'إعداد الاقتصاص'
        : locale === 'en-XA'
          ? pseudo('Crop settings')
          : 'Crop settings'}
    </h2>
    <label class="t27-upload">
      <span>{t('chooseImage')}</span>
      <input
        data-testid="t27-file-input"
        type="file"
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        aria-label={t('chooseImage')}
        onchange={chooseImage}
      />
      {#if sourceFile && sourceDimensions}<small data-testid="t27-selected"
          >{sourceFile.name} · {sourceDimensions.width} × {sourceDimensions.height}</small
        >{/if}
    </label>
    <p class="t27-help">{t('inputHelp')}</p>

    <GeneratedControls
      descriptions={optionDescriptions}
      values={optionValues}
      onChange={updateOption}
      {locale}
    />

    <button
      class="button primary"
      data-testid="t27-run"
      type="button"
      disabled={busy || !sourceFile}
      onclick={previewCrop}>{t('run')}</button
    >
    {#if busy}<p data-testid="t27-status" role="status" aria-live="polite">{t('busy')}</p>
    {:else if status}<p data-testid="t27-status" role="status" aria-live="polite">{status}</p>
    {:else}<p data-testid="t27-status" role="status" aria-live="polite">{t('ready')}</p>{/if}
    {#if error}<p class="error" role="alert" data-testid="t27-error" data-error-kind={error}>
        {errorText(error)}
      </p>{/if}
  </section>

  {#if sourceFile && sourceUrl && sourceDimensions}
    <section class="t27-previews" aria-label={t('source')}>
      <figure class="t27-source-card">
        <figcaption>{t('source')}</figcaption>
        <div
          class="t27-source-frame"
          style={`aspect-ratio:${sourceDimensions.width} / ${sourceDimensions.height}`}
        >
          <img data-testid="t27-source" src={sourceUrl} alt={t('source')} />
          {#if cropBox}
            <div
              data-testid="t27-crop-box"
              data-x={cropBox.x}
              data-y={cropBox.y}
              data-width={cropBox.width}
              data-height={cropBox.height}
              class="t27-crop-box"
              style={`left:${(cropBox.x / sourceDimensions.width) * 100}%;top:${(cropBox.y / sourceDimensions.height) * 100}%;width:${(cropBox.width / sourceDimensions.width) * 100}%;height:${(cropBox.height / sourceDimensions.height) * 100}%`}
              aria-hidden="true"
            ></div>
          {/if}
        </div>
      </figure>
      {#if outputUrl && outputDimensions}
        <figure class="t27-result-card">
          <figcaption>{t('result')}</figcaption>
          <img data-testid="t27-output" src={outputUrl} alt={t('result')} />
          <p data-testid="t27-output-dimensions">
            {t('dimensions')}: {outputDimensions.width} × {outputDimensions.height}
          </p>
          <p>{t('done')}</p>
          <a
            class="button primary"
            data-testid="t27-download"
            href={outputUrl}
            download={downloadName(sourceFile)}>{t('download')}</a
          >
        </figure>
      {/if}
    </section>
  {/if}

  <section class="tool-completion t27-faq" aria-labelledby="t27-faq-heading">
    <h2 id="t27-faq-heading">{t('helpTitle')}</h2>
    <p>{t('helpSaliency')}</p>
    <nav aria-label={t('related')}>
      <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('convert')}</a>
    </nav>
  </section>
</main>

<style>
  .t27-controls,
  .t27-previews,
  .t27-faq {
    width: min(1080px, calc(100% - 32px));
    margin: 0 auto 40px;
  }
  .t27-controls {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: white;
  }
  .t27-controls h2 {
    margin-block-start: 0;
  }
  .t27-upload {
    display: grid;
    gap: 10px;
    padding: 16px;
    border: 1px solid #1c1a1720;
    border-radius: 8px;
    font-weight: 600;
  }
  .t27-upload input {
    max-width: 100%;
    font-weight: 400;
  }
  .t27-upload small,
  .t27-help {
    color: #5c5a56;
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .t27-controls :global(.generated-control) {
    margin-block: 12px;
  }
  .t27-controls :global(.generated-control select) {
    min-height: 42px;
  }
  .t27-previews {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .t27-previews figure {
    min-width: 0;
    margin: 0;
    padding: 16px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: #fff;
  }
  .t27-previews figcaption {
    margin-block-end: 12px;
    font-weight: 600;
  }
  .t27-source-frame {
    position: relative;
    width: 100%;
    max-height: 500px;
    overflow: hidden;
    background: #eee;
  }
  .t27-source-frame img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .t27-crop-box {
    position: absolute;
    border: 2px solid #ffe05b;
    box-shadow: 0 0 0 9999px #0007;
    pointer-events: none;
  }
  .t27-result-card > img {
    display: block;
    width: 100%;
    max-height: 500px;
    object-fit: contain;
    background: #eee;
  }
  .t27-result-card .button {
    display: inline-block;
  }
  @media (max-width: 700px) {
    .t27-previews {
      grid-template-columns: 1fr;
    }
    .t27-controls {
      padding: 16px;
    }
  }
</style>
