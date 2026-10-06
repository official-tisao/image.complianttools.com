<script lang="ts">
  /**
   * T21 Compress to Target Size — README §4.2, §19.2, PLAN.md P6-01.
   *
   * The search itself is the engine's existing `searchTargetSize`: a bounded binary search on
   * quality, optionally followed by up to two scale passes, which is the "and optionally
   * dimensions" the catalog promises.
   *
   * The one thing this component is careful about is honesty. An encoder cannot always reach an
   * exact byte count — a 4 KB budget for a detailed photo has no JPEG that hits it — so the tool
   * reports the bytes it actually produced, says whether the target was met, and never presents
   * an approximation as an exact hit.
   */
  import { onDestroy } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import {
    T21CompressToSizeOptionsSchema,
    t21CompressToSizeOptionDescriptions,
    type T21CompressToSizeOptions,
  } from '@complianttools/image-engine/schemas/p6-01-options';
  import {
    createRaster,
    engineErrorMessage,
    isEngineError,
    resizeRaster,
    ResizeOptionsSchema,
    searchTargetSize,
    type RasterImage,
  } from '@complianttools/image-engine';
  import GeneratedControls from './GeneratedControls.svelte';
  import ResultTransfer from './ResultTransfer.svelte';
  import { pasteImage } from './transfer/paste-action';
  import { publishResult, type PublishedResult } from './transfer/result-file';
  import { localizeOptions, type Locale } from './i18n';

  type ErrorKind =
    | 'unsupported-file'
    | 'decode-failed'
    | 'canvas-unavailable'
    | 'image-too-large'
    | 'target-unreachable'
    | 'encode-failed'
    | 'cancelled';

  const MAX_FILE_BYTES = 64 * 1024 * 1024;
  const MAX_PIXELS = 40_000_000;
  const ORIGIN = 'https://image.complianttools.com';

  const enText = {
    title: 'Compress to Target Size',
    eyebrow: 'Local optimize',
    description:
      'Search for the closest achievable file size to a byte budget. The encoder tries a series of quality levels, and with the dimension search on it also scales the image down when quality alone cannot reach the budget. The result always reports the bytes it actually produced.',
    metaDescription:
      'Compress a local image toward an exact KB or MB target, optionally searching dimensions too. Reports the bytes actually achieved.',
    privacy: 'Your image stays in this browser. Encoding runs locally and nothing is uploaded.',
    inputHeading: 'Choose an image and a budget',
    inputLabel: 'Image to compress',
    chooseImage: 'Choose an image to compress',
    inputHelp:
      'PNG, JPEG, or WebP, up to 64 MiB. JPEG and WebP are both searched; transparency is flattened onto the chosen background because neither search target keeps an alpha channel.',
    run: 'Search for the target size',
    cancel: 'Cancel search',
    busy: 'Searching locally…',
    ready: 'Choose an image and set a target to begin.',
    resultHeading: 'Result',
    beforeAlt: 'The original image',
    afterAlt: 'The compressed result',
    download: 'Download result',
    dimensions: 'Dimensions',
    size: 'Size',
    target: 'Target',
    quality: 'Quality',
    attempts: 'Attempts',
    metTarget: 'The target was met: {actual} bytes against a {target} byte budget.',
    missedTarget:
      'The closest result is {actual} bytes against a {target} byte budget, {delta} bytes {direction} the target ({percent}% off). This encoder cannot reach that exact size for this image.',
    directionOver: 'over',
    directionUnder: 'under',
    fidelity: 'The preview and the download are the same encoded bytes.',
    honestyNote:
      'An exact byte count is not always reachable: a budget far below what the image content needs has no valid encoding, so the closest result is reported instead of pretending the target was hit.',
    faqHeading: 'Questions about target size compression',
    faqExact: 'Will it always hit my exact target?',
    faqExactAnswer:
      'No. JPEG and WebP encode to discrete sizes; very small budgets for a detailed image have no valid encoding. The tool reports the closest size it reached and whether the target was met.',
    faqDimensions: 'When does it change the dimensions?',
    faqDimensionsAnswer:
      'With the dimension search on, if no quality setting reaches the budget the image is scaled down and the search runs again, up to twice.',
    faqPrivacy: 'Is the image uploaded?',
    faqPrivacyAnswer:
      'No. Decoding, the quality search, and encoding all run locally in this browser.',
    related: 'Related tools',
    compressor: 'Image compressor',
    errors: {
      'unsupported-file': 'Choose a valid PNG, JPEG, or WebP image.',
      'decode-failed': 'The browser could not decode this image.',
      'canvas-unavailable': 'The browser could not create a local image canvas.',
      'image-too-large': 'The image exceeds the 40 megapixel limit for this search.',
      'target-unreachable':
        'No encoding of this image fits the target, even at the smallest size the search allows.',
      'encode-failed': 'The encoder could not produce a result for this image.',
      cancelled: 'The target-size search was cancelled.',
    },
    remedies: {
      'unsupported-file': 'Export the image as PNG, JPEG, or WebP and choose it again.',
      'decode-failed': 'Export a valid, non-animated image and try again.',
      'canvas-unavailable': 'Try a browser with local 2D canvas support.',
      'image-too-large': 'Choose an image with fewer than 40 megapixels, or resize it first.',
      'target-unreachable':
        'Raise the target, simplify the image, or change the output format — a tiny budget for a busy image has no valid encoding.',
      'encode-failed': 'Choose a smaller image or a different format and try again.',
      cancelled: 'Choose the image and start the search again when ready.',
    },
  } as const;

  type TextKey = Exclude<keyof typeof enText, 'errors' | 'remedies'>;
  type LocalizedCopy = Record<TextKey, string> & {
    errors: Record<ErrorKind, string>;
    remedies: Record<ErrorKind, string>;
  };

  const arText: LocalizedCopy = {
    title: 'الضغط إلى حجم مستهدف',
    eyebrow: 'تحسين محلي',
    description:
      'ابحث عن أقرب حجم ملف قابل للتحقيق لميزانية بايتات. يجرّب المرمز سلسلة من مستويات الجودة، ومع تفعيل بحث الأبعاد تُصغَّر الصورة أيضًا حين لا تكفي الجودة وحدها. تعرض النتيجة دائمًا عدد البايتات الذي أنتجته فعليًا.',
    metaDescription:
      'اضغط صورة محلية نحو حجم مستهدف بالكيلوبايت أوالميغابايت، مع بحث اختياري في الأبعاد. يعرض البايتات المتحققة فعليًا.',
    privacy: 'تبقى صورتك في هذا المتصفح. يجري الترميز محليًا ولا يُرفع شيء.',
    inputHeading: 'اختر صورة وميزانية',
    inputLabel: 'الصورة المراد ضغطها',
    chooseImage: 'اختر صورة لضغطها',
    inputHelp:
      'PNG أو JPEG أو WebP، حتى 64 ميبيبايت. يُبحث في JPEG وWebP معًا؛ وتُسطَّح الشفافية على الخلفية المختارة لأن الهدفين لا يحتفظان بقناة ألفا.',
    run: 'ابحث عن الحجم المستهدف',
    cancel: 'ألغِ البحث',
    busy: 'جارٍ البحث محليًا…',
    ready: 'اختر صورة وحدّد هدفًا للبدء.',
    resultHeading: 'النتيجة',
    beforeAlt: 'الصورة الأصلية',
    afterAlt: 'النتيجة المضغوطة',
    download: 'تنزيل النتيجة',
    dimensions: 'الأبعاد',
    size: 'الحجم',
    target: 'الهدف',
    quality: 'الجودة',
    attempts: 'المحاولات',
    metTarget: 'تحقق الهدف: {actual} بايت مقابل ميزانية {target} بايت.',
    missedTarget:
      'أقرب نتيجة هي {actual} بايت مقابل ميزانية {target} بايت، أي {delta} بايت {direction} الهدف ({percent}% عن الهدف). لا يستطيع هذا المرمز الوصول إلى هذا الحجم الدقيق لهذه الصورة.',
    directionOver: 'فوق',
    directionUnder: 'تحت',
    fidelity: 'المعاينة والتنزيل هما البايتات المرمّزة نفسها.',
    honestyNote:
      'لا يمكن دائمًا الوصول إلى عدد بايتات محدد: ميزانية أصغر بكثير مما يحتاجه محتوى الصورة لا يوجد لها ترميز صالح، لذا تُعرض أقرب نتيجة بدلًا من الادعاء بتحقيق الهدف.',
    faqHeading: 'أسئلة حول الضغط إلى حجم مستهدف',
    faqExact: 'هل سيحقق حجمي المستهدف دائمًا؟',
    faqExactAnswer:
      'لا. ترمّز JPEG وWebP إلى أحجام متدرجة؛ الميزانيات الصغيرة جدًا لصورة تفصيلية لا يوجد لها ترميز صالح. تعرض الأداة أقرب حجم تحقق وتوضّح ما إذا كان الهدف قد تحقّق.',
    faqDimensions: 'متى يغيّر الأبعاد؟',
    faqDimensionsAnswer:
      'مع تفعيل بحث الأبعاد، إذا لم يبلغ أي إعداد جودة للميزانية تُصغَّر الصورة ويُعاد البحث، مرتين كحد أقصى.',
    faqPrivacy: 'هل تُرفع الصورة؟',
    faqPrivacyAnswer: 'لا. يجري فك الترميز وبحث الجودة والترميز محليًا في هذا المتصفح.',
    related: 'أدوات ذات صلة',
    compressor: 'ضاغط الصور',
    errors: {
      'unsupported-file': 'اختر صورة PNG أو JPEG أو WebP صالحة.',
      'decode-failed': 'تعذر على المتصفح فك ترميز هذه الصورة.',
      'canvas-unavailable': 'تعذر على المتصفح إنشاء لوحة صور محلية.',
      'image-too-large': 'تتجاوز الصورة حد 40 megapixel الخاص بهذا البحث.',
      'target-unreachable': 'لا يوجد ترميز لهذه الصورة يناسب الهدف حتى بأصغر حجم يسمح به البحث.',
      'encode-failed': 'تعذر على المرمز إنتاج نتيجة لهذه الصورة.',
      cancelled: 'تم إلغاء البحث عن الحجم المستهدف.',
    },
    remedies: {
      'unsupported-file': 'صدّر الصورة بصيغة PNG أو JPEG أو WebP ثم اخترها مجددًا.',
      'decode-failed': 'صدّر صورة صالحة غير متحركة ثم أعد المحاولة.',
      'canvas-unavailable': 'جرّب متصفحًا يدعم لوحة 2D محلية.',
      'image-too-large': 'اختر صورة تقل عن 40 megapixel، أو غيّر حجمها أولًا.',
      'target-unreachable':
        'ارفع الهدف، أو بسّط الصورة، أو غيّر صيغة الإخراج — فميزانية صغيرة لصورة مزدحمة لا يوجد لها ترميز صالح.',
      'encode-failed': 'اختر صورة أصغر أو صيغة مختلفة ثم أعد المحاولة.',
      cancelled: 'اختر الصورة وابدأ البحث مجددًا عند الاستعداد.',
    },
  };

  let { locale = 'en' }: { locale?: Locale } = $props();

  let selected = $state<File>();
  let sourceUrl = $state('');
  let sourceDimensions = $state({ width: 0, height: 0 });
  let options = $state<T21CompressToSizeOptions>(T21CompressToSizeOptionsSchema.parse({}));
  let outputUrl = $state('');
  let outputBytes = $state(0);
  let outputDimensions = $state({ width: 0, height: 0 });
  let outputQuality = $state(0);
  let attemptCount = $state(0);
  let targetBytes = $state(0);
  let metTarget = $state(false);
  let busy = $state(false);
  let status = $state('');
  let error = $state<ErrorKind>();
  let abort = $state<AbortController>();
  /** P6-03: the bytes behind `outputUrl`, kept for the clipboard write and the drag-out. */
  let published = $state<PublishedResult | null>(null);

  const pseudo = (value: string) =>
    `［${value.replace(/[aeiou]/giu, (vowel) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[vowel.toLowerCase()] ?? vowel)}］`;
  const tr = (key: TextKey) => {
    const value = locale === 'ar' ? arText[key] : enText[key];
    return locale === 'en-XA' ? pseudo(value) : value;
  };
  const localized = (value: string): string => (locale === 'en-XA' ? pseudo(value) : value);
  const path = $derived(locale === 'en' ? '/compress-to-size' : `/${locale}/compress-to-size`);
  const canonical = $derived(`${ORIGIN}${path}`);
  const faq = $derived([
    { question: tr('faqExact'), answer: tr('faqExactAnswer') },
    { question: tr('faqDimensions'), answer: tr('faqDimensionsAnswer') },
    { question: tr('faqPrivacy'), answer: tr('faqPrivacyAnswer') },
  ]);
  const localizedOptionDescriptions = $derived(
    localizeOptions(locale, t21CompressToSizeOptionDescriptions),
  );
  const optionValues = $derived({
    't21.targetValue': options.targetValue,
    't21.targetUnit': options.targetUnit,
    't21.format': options.format,
    't21.strategy': options.strategy,
    't21.tolerancePercent': options.tolerancePercent,
    't21.background': options.background,
  } as const);
  const schema = $derived({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: tr('title'),
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
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: tr('related'), item: `${ORIGIN}/compress` },
          { '@type': 'ListItem', position: 2, name: tr('title'), item: canonical },
        ],
      },
    ],
  });

  function errorText(kind: ErrorKind): string {
    const dictionary = locale === 'ar' ? arText : enText;
    return `${localized(dictionary.errors[kind])} ${localized(
      locale === 'ar' ? 'جرّب هذا' : 'Try this',
    )}: ${localized(dictionary.remedies[kind])}`;
  }

  function clearOutput() {
    paintedByScale.clear();
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = '';
    outputBytes = 0;
    outputDimensions = { width: 0, height: 0 };
    outputQuality = 0;
    attemptCount = 0;
    metTarget = false;
    // A cleared output is also a withdrawn result: the clipboard and drag-out must not keep
    // offering bytes for a preview that is no longer on screen.
    published = null;
  }

  function updateOption(path: string, value: unknown) {
    const key = path.startsWith('t21.') ? path.slice(4) : path;
    const parsed = T21CompressToSizeOptionsSchema.safeParse({ ...options, [key]: value });
    if (parsed.success) {
      options = parsed.data;
      clearOutput();
      status = '';
      error = undefined;
    }
  }

  /**
   * Adopts an image as the new source, shared by the file input and the paste listener. `undefined`
   * is the input's "no file" case, which clears the source; a paste always supplies a file and so
   * goes through exactly the same clearing and state reset a chosen image does.
   */
  function adopt(file: File | undefined) {
    clearOutput();
    status = '';
    error = undefined;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = '';
    sourceDimensions = { width: 0, height: 0 };
    selected = undefined;
    if (file) {
      selected = file;
      sourceUrl = URL.createObjectURL(file);
    }
  }

  function chooseImage(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    adopt(file);
  }

  async function decodeSource(
    file: File,
  ): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
    if (file.size > MAX_FILE_BYTES) throw 'unsupported-file' satisfies ErrorKind;
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw 'decode-failed' satisfies ErrorKind;
    }
    try {
      if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > MAX_PIXELS)
        throw 'image-too-large' satisfies ErrorKind;
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw 'canvas-unavailable' satisfies ErrorKind;
      context.clearRect(0, 0, bitmap.width, bitmap.height);
      context.drawImage(bitmap, 0, 0);
      return {
        width: bitmap.width,
        height: bitmap.height,
        data: new Uint8ClampedArray(context.getImageData(0, 0, bitmap.width, bitmap.height).data),
      };
    } finally {
      bitmap.close();
    }
  }

  /** Encodes one candidate at a quality and scale, returning the encoded bytes. */
  /**
   * A canvas painted once per *scale*, reused across every quality the search tries at it.
   *
   * The search runs up to 24 encodes. Copying 12 MP of RGBA and resampling from the full raster on
   * each one dominated the runtime — measured at 43 s against §19.2's 4 s budget — even though a
   * single encode is only ~200 ms. The pixels at a given scale never change, only the quality
   * does, so painting once per scale and re-encoding it is the same result for a fraction of the
   * work.
   */
  const paintedByScale = new SvelteMap<number, HTMLCanvasElement>();

  function paintedCanvas(image: RasterImage, width: number, height: number, scale: number) {
    const key = Math.round(scale * 10_000);
    const cached = paintedByScale.get(key);
    if (cached) return cached;

    let working = image;
    if (scale < 1) {
      // Parsed rather than hand-built so the schema's own defaults (fit mode, roundTo,
      // maxPixels, resampling algorithm) apply exactly as they do everywhere else in the app.
      working = resizeRaster(
        image,
        ResizeOptionsSchema.parse({
          mode: 'pixels',
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          fitMode: 'fill',
          lockAspect: false,
          allowUpscale: false,
          roundTo: 1,
          maxPixels: MAX_PIXELS,
        }),
      );
    }
    const canvas = document.createElement('canvas');
    canvas.width = working.width;
    canvas.height = working.height;
    const context = canvas.getContext('2d');
    if (!context) throw 'canvas-unavailable' satisfies ErrorKind;
    // JPEG and WebP here have no alpha channel, so transparency is composited rather than left
    // to produce a black or transparent result the user did not ask for.
    context.fillStyle = options.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const imageData = context.createImageData(working.width, working.height);
    imageData.data.set(working.frames[0]!.data);
    context.putImageData(imageData, 0, 0);
    paintedByScale.set(key, canvas);
    return canvas;
  }

  async function encodeAt(
    image: RasterImage,
    width: number,
    height: number,
    quality: number,
    scale: number,
  ): Promise<ArrayBuffer> {
    const canvas = paintedCanvas(image, width, height, scale);

    const mime = options.format === 'webp' ? 'image/webp' : 'image/jpeg';
    return new Promise<ArrayBuffer>((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value
            ? value.arrayBuffer().then(resolve, () => reject('encode-failed' satisfies ErrorKind))
            : reject('encode-failed' satisfies ErrorKind),
        mime,
        Math.min(1, Math.max(0.01, quality / 100)),
      );
    });
  }

  async function runSearch() {
    const file = selected;
    if (!file) {
      error = 'unsupported-file';
      return;
    }

    clearOutput();
    error = undefined;
    status = '';
    busy = true;
    const controller = new AbortController();
    abort = controller;
    try {
      const decoded = await decodeSource(file);
      const base = createRaster(decoded.width, decoded.height, decoded.data);
      const image: RasterImage = {
        ...base,
        frames: [{ data: decoded.data, durationMs: 0 }],
      };
      sourceDimensions = { width: decoded.width, height: decoded.height };

      const goal = Math.max(
        1,
        Math.round(options.targetValue * (options.targetUnit === 'MB' ? 1_000_000 : 1_000)),
      );
      targetBytes = goal;

      paintedByScale.clear();
      const result = await searchTargetSize(
        goal,
        (quality, scale) => encodeAt(image, decoded.width, decoded.height, quality, scale),
        {
          tolerance: options.tolerancePercent / 100,
          strategy: options.strategy,
          signal: controller.signal,
        },
      );

      const blob = new Blob([result.data], {
        type: options.format === 'webp' ? 'image/webp' : 'image/jpeg',
      });
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const bitmapUrl = URL.createObjectURL(blob);
        createImageBitmap(new Blob([result.data]))
          .then((bitmap) => {
            const size = { width: bitmap.width, height: bitmap.height };
            bitmap.close();
            URL.revokeObjectURL(bitmapUrl);
            resolve(size);
          })
          .catch(() => {
            URL.revokeObjectURL(bitmapUrl);
            reject('encode-failed' satisfies ErrorKind);
          });
      });

      outputUrl = URL.createObjectURL(blob);
      outputBytes = blob.size;
      outputDimensions = dimensions;
      outputQuality = result.quality;
      attemptCount = result.attempts.length;
      // The engine's own tolerance test decides whether the target was met, so the status line
      // cannot claim a hit the search itself did not consider a hit.
      metTarget = Math.abs(blob.size - goal) / goal <= options.tolerancePercent / 100;
      // The search encodes JPEG or WebP and never PNG, so the published extension names the format
      // the bytes are actually in rather than the PNG the source may have been.
      published = publishResult(blob, {
        sourceName: file.name.replace(/\.[^.]+$/u, ''),
        extension: options.format === 'webp' ? 'webp' : 'jpg',
      });

      const summary = metTarget
        ? localized(tr('metTarget'))
            .replace('{actual}', String(blob.size))
            .replace('{target}', String(goal))
        : localized(tr('missedTarget'))
            .replace('{actual}', String(blob.size))
            .replace('{target}', String(goal))
            .replace('{delta}', String(Math.abs(blob.size - goal)))
            .replace(
              '{direction}',
              localized(blob.size > goal ? tr('directionOver') : tr('directionUnder')),
            )
            .replace('{percent}', ((Math.abs(blob.size - goal) / goal) * 100).toFixed(1));
      status = `${summary} ${localized(tr('honestyNote'))} ${localized(tr('fidelity'))}`;
    } catch (cause) {
      if (controller.signal.aborted) error = 'cancelled';
      else if (typeof cause === 'string' && cause in enText.errors) error = cause as ErrorKind;
      else if (isEngineError(cause)) {
        error = cause.kind === 'decode-failed' ? 'decode-failed' : 'encode-failed';
        status = engineErrorMessage(cause);
      } else error = 'encode-failed';
      // A failed or cancelled run never produced bytes, so any earlier result is withdrawn.
      published = null;
    } finally {
      if (abort === controller) abort = undefined;
      busy = false;
    }
  }

  function cancelSearch() {
    abort?.abort();
  }

  function downloadName(): string {
    const stem =
      selected?.name
        .replace(/\.[^.]+$/u, '')
        .replace(/[\\/:*?"<>| -]/gu, '_')
        .slice(0, 80) || 'image';
    const extension = options.format === 'webp' ? 'webp' : 'jpg';
    return `${stem}-${outputBytes}b.${extension}`;
  }

  onDestroy(() => {
    abort?.abort();
    clearOutput();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  });
</script>

<svelte:head>
  <title>{tr('title')} — Image Compliant Tools</title>
  <meta name="description" content={tr('metaDescription')} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${ORIGIN}/compress-to-size`} />
  <link rel="alternate" hreflang="en-XA" href={`${ORIGIN}/en-XA/compress-to-size`} />
  <link rel="alternate" hreflang="ar" href={`${ORIGIN}/ar/compress-to-size`} />
  <link rel="alternate" hreflang="x-default" href={`${ORIGIN}/compress-to-size`} />
  <meta property="og:title" content={tr('title')} />
  <meta property="og:description" content={tr('metaDescription')} />
  <meta property="og:image" content={`${ORIGIN}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={`${ORIGIN}/og/tools.svg`} />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(schema)}</svelte:element
  >
</svelte:head>

<main
  class="tool-page t21-page"
  lang={locale}
  dir={locale === 'ar' ? 'rtl' : 'ltr'}
  use:pasteImage={(files) => adopt(files[0])}
>
  <header class="tool-intro">
    <p class="eyebrow">{tr('eyebrow')}</p>
    <h1>{tr('title')}</h1>
    <p>{tr('description')}</p>
    <p class="privacy-copy">{tr('privacy')}</p>
  </header>

  <section class="t21-controls" aria-labelledby="t21-input-heading">
    <h2 id="t21-input-heading">{tr('inputHeading')}</h2>
    <label class="t21-file-card">
      <span>{tr('inputLabel')}</span>
      <input
        data-testid="t21-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        aria-label={tr('chooseImage')}
        onchange={chooseImage}
      />
      {#if selected}
        <span class="t21-selected"
          >{selected.name} · {sourceDimensions.width} × {sourceDimensions.height}</span
        >
      {/if}
    </label>
    <p class="t21-help">{tr('inputHelp')}</p>

    <GeneratedControls
      descriptions={localizedOptionDescriptions}
      values={{ ...optionValues }}
      onChange={updateOption}
      {locale}
    />

    <div class="t21-actions">
      <button
        class="button primary"
        data-testid="t21-run"
        type="button"
        disabled={busy || !selected}
        onclick={() => void runSearch()}>{tr('run')}</button
      >
      {#if busy}
        <button class="button" data-testid="t21-cancel" type="button" onclick={cancelSearch}
          >{tr('cancel')}</button
        >
      {/if}
    </div>
    {#if busy}<p role="status" aria-live="polite">{tr('busy')}</p>
    {:else if status}<p role="status" aria-live="polite" data-testid="t21-status">{status}</p>
    {:else}<p role="status" aria-live="polite">{tr('ready')}</p>{/if}
    {#if error}
      <p class="t21-error" role="alert" data-error-kind={error} data-testid="t21-error">
        {errorText(error)}
      </p>
    {/if}
  </section>

  {#if outputUrl}
    <section class="t21-result" aria-labelledby="t21-result-heading">
      <h2 id="t21-result-heading">{tr('resultHeading')}</h2>
      <div class="t21-preview-grid">
        <figure>
          <figcaption>{tr('size')}</figcaption>
          <img data-testid="t21-before" src={sourceUrl} alt={tr('beforeAlt')} />
        </figure>
        <figure>
          <figcaption>{tr('afterAlt')}</figcaption>
          <img data-testid="t21-after" src={outputUrl} alt={tr('afterAlt')} />
        </figure>
      </div>
      <dl class="t21-metrics" data-testid="t21-metrics">
        <div>
          <dt>{tr('size')}</dt>
          <dd data-testid="t21-bytes">{outputBytes}</dd>
        </div>
        <div>
          <dt>{tr('target')}</dt>
          <dd data-testid="t21-target">{targetBytes}</dd>
        </div>
        <div>
          <dt>{tr('quality')}</dt>
          <dd data-testid="t21-quality">{outputQuality}</dd>
        </div>
        <div>
          <dt>{tr('dimensions')}</dt>
          <dd data-testid="t21-dimensions">{outputDimensions.width} × {outputDimensions.height}</dd>
        </div>
        <div>
          <dt>{tr('attempts')}</dt>
          <dd data-testid="t21-attempts">{attemptCount}</dd>
        </div>
      </dl>
      <p class="t21-fidelity" data-met-target={metTarget}>{tr('fidelity')}</p>
      <a
        class="button primary t21-download"
        data-testid="t21-download"
        href={outputUrl}
        download={downloadName()}>{tr('download')}</a
      >
      <ResultTransfer result={published} {busy} {locale} testIdPrefix="t21-transfer" />
    </section>
  {/if}

  <section class="tool-completion t21-faq" aria-labelledby="t21-faq-heading">
    <h2 id="t21-faq-heading">{tr('faqHeading')}</h2>
    {#each faq as item (item.question)}<details>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>{/each}
    <nav aria-label={tr('related')}>
      <a href={locale === 'en' ? '/compress' : `/${locale}/compress`}>{tr('compressor')}</a>
    </nav>
  </section>
</main>

<style>
  .t21-controls,
  .t21-result,
  .t21-faq {
    width: min(1080px, calc(100% - 32px));
    margin: 0 auto 40px;
  }
  .t21-controls {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: white;
  }
  .t21-controls h2,
  .t21-result h2 {
    margin-block-start: 0;
  }
  .t21-file-card {
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    border: 1px solid #1c1a1720;
    border-radius: 8px;
  }
  .t21-file-card > span:first-child {
    font-weight: 600;
  }
  .t21-file-card input {
    max-width: 100%;
  }
  .t21-selected,
  .t21-help,
  .t21-fidelity {
    color: #5c5a56;
    font-size: 13px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
  .t21-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .t21-result {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: #fff;
  }
  .t21-preview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .t21-preview-grid figure {
    min-width: 0;
    margin: 0;
    padding: 12px;
    border: 1px solid #1c1a171a;
    border-radius: 8px;
    background: #f5f3f0;
  }
  .t21-preview-grid figcaption {
    margin-block-end: 8px;
    font-weight: 600;
  }
  .t21-preview-grid img {
    display: block;
    width: 100%;
    height: min(320px, 45vw);
    object-fit: contain;
    background: #eee;
  }
  .t21-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    margin-block: 16px;
    font-variant-numeric: tabular-nums;
  }
  .t21-metrics div {
    min-width: 0;
  }
  .t21-metrics dt {
    color: #5c5a56;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .t21-metrics dd {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .t21-download {
    display: inline-block;
  }
  .t21-error {
    padding: 12px;
    border-inline-start: 4px solid #a21f17;
    color: #7c1711;
    background: #fff1ef;
  }
  @media (max-width: 700px) {
    .t21-preview-grid {
      grid-template-columns: 1fr;
    }
    .t21-controls,
    .t21-result {
      padding: 16px;
    }
  }
</style>
