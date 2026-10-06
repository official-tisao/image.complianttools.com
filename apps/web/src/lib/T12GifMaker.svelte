<script lang="ts">
  /**
   * T12 GIF Maker — README §4.1, §6.10, PLAN.md P6-01.
   *
   * The encoder is the engine's own `encodeGif`; nothing here is uploaded and nothing is
   * fetched. What this component adds over the previous shell is a live preview that is provably
   * the same bytes the download offers, a per-frame duration control the old shell lacked
   * (every frame previously shared one delay), and a typed error kind on every alert so a test
   * can assert which remedy the user was shown.
   */
  import { onDestroy } from 'svelte';
  import {
    GifMakerToolOptionsSchema,
    gifMakerToolOptionDescriptions,
    type GifMakerToolOptions,
  } from '@complianttools/image-engine/schemas/options';
  import {
    createRaster,
    encodeGif,
    engineErrorMessage,
    generateGifFrames,
    isEngineError,
  } from '@complianttools/image-engine';
  import GeneratedControls from './GeneratedControls.svelte';
  import { localizeOptions, type Locale } from './i18n';

  type ErrorKind =
    | 'unsupported-file'
    | 'decode-failed'
    | 'canvas-unavailable'
    | 'mismatched-sizes'
    | 'too-many-frames'
    | 'output-too-large'
    | 'encode-failed'
    | 'no-files';

  const MAX_FILE_BYTES = 24 * 1024 * 1024;
  const MAX_FRAMES = 500;
  const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
  const MAX_PIXELS = 20_000_000;
  const ORIGIN = 'https://image.complianttools.com';

  const enText = {
    title: 'GIF Maker',
    eyebrow: 'Local convert and export',
    description:
      'Turn a sequence of local images into an animated GIF. Set a delay per frame or for all frames at once, choose a loop count, and control quantization, dithering, palette mode, transparency, disposal, interlacing, and frame generation. Nothing is uploaded.',
    metaDescription:
      'Create an animated GIF locally from several images, with per-frame delays, loop count, palette, dithering, and optimization controls.',
    privacy: 'Your images stay in this browser. No upload, no network request, no bundled codec.',
    inputHeading: 'Choose the frames',
    inputLabel: 'Animation frames',
    chooseImages: 'Choose the animation frames',
    inputHelp:
      'PNG, JPEG, or WebP images, up to 24 MiB each. Frames are played in the order selected; every frame must share one size.',
    frameDelay: 'Delay for every frame (ms)',
    frameDelayHelp:
      'Sets the same delay on each frame. Adjust a single frame below to override it.',
    frameHeading: 'Per-frame delays',
    frameDelayLabel: 'Delay for frame {value} (ms)',
    applyAll: 'Apply this delay to every frame',
    create: 'Create GIF',
    busy: 'Encoding locally…',
    ready: 'Choose at least one image to begin.',
    previewHeading: 'Animated preview',
    previewAlt: 'The created animation, playing at the same speed as the download',
    download: 'Download GIF',
    frames: 'Frames',
    dimensions: 'Dimensions',
    size: 'Size',
    loop: 'Loop count',
    created:
      'Created a {width}×{height} GIF with {frames} frame(s) locally ({bytes} bytes; loop {loop}, {generator}, {quantizer}, {paletteMode} palette up to {size} entries, transparency index {transparency}, {dither} dithering at {ditherAmount}%, {disposal} disposal, {interlace}, optimization {opt}, palette reduction {lossy}).',
    fidelity: 'The preview and the download are the same encoded GIF bytes.',
    faqHeading: 'Questions about the GIF maker',
    faqPreview: 'Does the preview match the download?',
    faqPreviewAnswer:
      'Yes. The preview is the encoded GIF itself, played back in an image element, so the two cannot disagree.',
    faqOptions: 'Can I set a different delay for each frame?',
    faqOptionsAnswer:
      'Yes. Set one delay for the whole animation here, then override individual frames above.',
    faqPrivacy: 'Is anything uploaded?',
    faqPrivacyAnswer:
      'No. Decoding, quantization, dithering, and GIF encoding all run locally in this browser.',
    related: 'Related tools',
    splitter: 'GIF splitter and converter',
    errors: {
      'unsupported-file': 'Choose a valid PNG, JPEG, or WebP image.',
      'decode-failed': 'The browser could not decode one of the selected images.',
      'canvas-unavailable': 'The browser could not create a local image canvas.',
      'mismatched-sizes':
        'Every frame must have the same width and height. Animated GIF stores one canvas size for the whole file.',
      'too-many-frames': `An animated GIF is limited to ${MAX_FRAMES} frames in this tool.`,
      'output-too-large': 'The encoded GIF exceeds the 32 MiB export limit.',
      'encode-failed': 'The GIF encoder could not produce a valid file from these frames.',
      'no-files': 'Choose at least one image first.',
    },
    remedies: {
      'unsupported-file': 'Export the image as PNG, JPEG, or WebP and choose it again.',
      'decode-failed': 'Export a valid, non-animated image and try again.',
      'canvas-unavailable': 'Try a browser with local 2D canvas support.',
      'mismatched-sizes':
        'Resize every frame to one size first, or choose images that already share a size.',
      'too-many-frames': 'Choose fewer frames, or combine frames into fewer, larger images.',
      'output-too-large':
        'Use fewer frames, smaller images, a lower palette size, or turn dithering off.',
      'encode-failed':
        'Reduce the frame count or dimensions and try again. Your images are unchanged.',
      'no-files': 'Use the file picker above to select the frames for the animation.',
    },
  } as const;

  type TextKey = Exclude<keyof typeof enText, 'errors' | 'remedies'>;
  type LocalizedCopy = Record<TextKey, string> & {
    errors: Record<ErrorKind, string>;
    remedies: Record<ErrorKind, string>;
  };

  const arText: LocalizedCopy = {
    title: 'منشئ GIF',
    eyebrow: 'تحويل وتصدير محلي',
    description:
      'حوّل سلسلة من الصور المحلية إلى GIF متحرك. اضبط مدة التأخير لكل إطار أو لكل الإطارات معًا، واختر عدد التكرارات، وتحكم في التكميم والتظليل ووضع لوحة الألوان والشفافية والتخلص والتشابك وتوليد الإطارات. لا يُرفع شيء.',
    metaDescription:
      'أنشئ GIF متحركًا محليًا من عدة صور، مع تحكم في مدة كل إطار وعدد التكرارات واللوحة والتظليل.',
    privacy: 'تبقى صورك في هذا المتصفح. لا رفع ولا طلب شبكة ولا مرمز مضمّن.',
    inputHeading: 'اختر الإطارات',
    inputLabel: 'إطارات الحركة',
    chooseImages: 'اختر إطارات الحركة',
    inputHelp:
      'صور PNG أو JPEG أو WebP، حتى 24 ميبيبايت لكل ملف. تُعرض الإطارات بالترتيب المختار؛ يجب أن تشترك جميعها في الحجم نفسه.',
    frameDelay: 'تأخير كل الإطارات (مللي ثانية)',
    frameDelayHelp: 'يضبط التأخير نفسه على كل إطار. عدّل إطارًا واحدًا أدناه لتجاوزه.',
    frameHeading: 'تأخير كل إطار',
    frameDelayLabel: 'تأخير الإطار {value} (مللي ثانية)',
    applyAll: 'طبّق هذا التأخير على كل الإطارات',
    create: 'أنشئ GIF',
    busy: 'جارٍ الترميز محليًا…',
    ready: 'اختر صورة واحدة على الأقل للبدء.',
    previewHeading: 'معاينة متحركة',
    previewAlt: 'الحركة المُنشأة، تعمل بنفس سرعة التنزيل',
    download: 'تنزيل GIF',
    frames: 'الإطارات',
    dimensions: 'الأبعاد',
    size: 'الحجم',
    loop: 'عدد التكرارات',
    created:
      'أنشأ GIF بمقاس {width}×{height} مع {frames} إطار محليًا ({bytes} بايت؛ تكرار {loop}، {generator}، {quantizer}، لوحة {paletteMode} حتى {size} مدخلًا، فهرس الشفافية {transparency}، تظليل {dither} بنسبة {ditherAmount}%، التخلص {disposal}، {interlace}، تحسين {opt}، تقليل اللوحة {lossy}).',
    fidelity: 'المعاينة والتنزيل هما بايتات GIF المرمّزة نفسها.',
    faqHeading: 'أسئلة حول منشئ GIF',
    faqPreview: 'هل تطابق المعاينة التنزيل؟',
    faqPreviewAnswer:
      'نعم. المعاينة هي ملف GIF المرمّز نفسه، يُعرض في عنصر صورة، فلا يمكن أن يتعارضا.',
    faqOptions: 'هل يمكنني ضبط تأخير مختلف لكل إطار؟',
    faqOptionsAnswer: 'نعم. اضبط تأخيرًا واحدًا للحركة كاملة هنا، ثم تجاوز الإطارات الفردية أعلاه.',
    faqPrivacy: 'هل يُرفع شيء؟',
    faqPrivacyAnswer: 'لا. يجري فك الترميز والتكميم والتظليل وترميز GIF محليًا في هذا المتصفح.',
    related: 'أدوات ذات صلة',
    splitter: 'مقسّم ومحوّل GIF',
    errors: {
      'unsupported-file': 'اختر صورة PNG أو JPEG أو WebP صالحة.',
      'decode-failed': 'تعذر على المتصفح فك ترميز إحدى الصور المختارة.',
      'canvas-unavailable': 'تعذر على المتصفح إنشاء لوحة صور محلية.',
      'mismatched-sizes':
        'يجب أن يكون لكل إطار العرض والارتفاع نفسه. يخزن GIF المتحرك مقاسًا واحدًا للملف كله.',
      'too-many-frames': `يقتصر هذا الأداة على ${MAX_FRAMES} إطار كحد أقصى.`,
      'output-too-large': 'يتجاوز ملف GIF المرمّز حد التصدير البالغ 32 ميبيبايت.',
      'encode-failed': 'تعذر على مرمز GIF إنتاج ملف صالح من هذه الإطارات.',
      'no-files': 'اختر صورة واحدة على الأقل أولًا.',
    },
    remedies: {
      'unsupported-file': 'صدّر الصورة بصيغة PNG أو JPEG أو WebP ثم اخترها مجددًا.',
      'decode-failed': 'صدّر صورة صالحة غير متحركة ثم أعد المحاولة.',
      'canvas-unavailable': 'جرّب متصفحًا يدعم لوحة 2D محلية.',
      'mismatched-sizes':
        'غيّر حجم كل الإطارات إلى حجم واحد أولًا، أو اختر صورًا تتشارك الحجم أصلًا.',
      'too-many-frames': 'اختر إطارات أقل، أو ادمج الإطارات في صور أقل وأكبر.',
      'output-too-large': 'استخدم إطارات أقل أو صور أصغر أو لوحة ألوان أصغر أو أوقف التظليل.',
      'encode-failed': 'قلّل عدد الإطارات أو الأبعاد ثم أعد المحاولة. صورك تبقى دون تغيير.',
      'no-files': 'استخدم منتقي الملفات أعلاه لاختيار إطارات الحركة.',
    },
  };

  let { locale = 'en' }: { locale?: Locale } = $props();

  let files = $state<readonly File[]>([]);
  let frameDelays = $state<number[]>([]);
  let options = $state<GifMakerToolOptions>(GifMakerToolOptionsSchema.parse({}));
  let previewUrl = $state('');
  let outputBytes = $state(0);
  let outputDimensions = $state({ width: 0, height: 0 });
  let busy = $state(false);
  let status = $state('');
  let error = $state<ErrorKind>();

  const pseudo = (value: string) =>
    `［${value.replace(/[aeiou]/giu, (vowel) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[vowel.toLowerCase()] ?? vowel)}］`;
  const tr = (key: TextKey) => {
    const value = locale === 'ar' ? arText[key] : enText[key];
    return locale === 'en-XA' ? pseudo(value) : value;
  };
  const localized = (value: string): string => (locale === 'en-XA' ? pseudo(value) : value);
  const path = $derived(locale === 'en' ? '/gif-maker' : `/${locale}/gif-maker`);
  const canonical = $derived(`${ORIGIN}${path}`);
  const faq = $derived([
    { question: tr('faqPreview'), answer: tr('faqPreviewAnswer') },
    { question: tr('faqOptions'), answer: tr('faqOptionsAnswer') },
    { question: tr('faqPrivacy'), answer: tr('faqPrivacyAnswer') },
  ]);
  const localizedOptionDescriptions = $derived(
    localizeOptions(locale, gifMakerToolOptionDescriptions),
  );
  const optionValues = $derived({
    'gifMaker.optimizeLevel': options.optimizeLevel,
    'gifMaker.lossy': options.lossy,
    'gifMaker.quantizer': options.quantizer,
    'gifMaker.paletteSize': options.paletteSize,
    'gifMaker.paletteMode': options.paletteMode,
    'gifMaker.transparencyIndex': options.transparencyIndex,
    'gifMaker.dither': options.dither,
    'gifMaker.ditherAmount': options.ditherAmount,
    'gifMaker.disposal': options.disposal,
    'gifMaker.interlace': options.interlace,
    'gifMaker.frameGenerator': options.frameGenerator,
    'gifMaker.crossfadeFrames': options.crossfadeFrames,
    'gifMaker.delayMs': options.delayMs,
    'gifMaker.loopCount': options.loopCount,
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
          {
            '@type': 'ListItem',
            position: 1,
            name: tr('related'),
            item: `${ORIGIN}/gif-converter`,
          },
          { '@type': 'ListItem', position: 2, name: tr('title'), item: canonical },
        ],
      },
    ],
  });

  /**
   * A thrown marker for an error branch.
   *
   * `satisfies ErrorKind` on an object literal widens `kind` to `string` and stops discriminating,
   * so the kind is pinned by the return type instead. The route catches the string and maps it
   * back to a kind in `enText.errors`.
   */
  function fail(kind: ErrorKind): ErrorKind {
    return kind;
  }

  function errorText(kind: ErrorKind): string {
    const dictionary = locale === 'ar' ? arText : enText;
    const main = dictionary.errors[kind];
    const remedy = dictionary.remedies[kind];
    return `${localized(main)} ${localized(locale === 'ar' ? 'جرّب هذا' : 'Try this')}: ${localized(remedy)}`;
  }

  function clearOutput() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    outputBytes = 0;
    outputDimensions = { width: 0, height: 0 };
  }

  function updateOption(path: string, value: unknown) {
    const key = path.startsWith('gifMaker.') ? path.slice('gifMaker.'.length) : path;
    const parsed = GifMakerToolOptionsSchema.safeParse({ ...options, [key]: value });
    if (parsed.success) {
      options = parsed.data;
      clearOutput();
      status = '';
      error = undefined;
    }
  }

  function selectFiles(event: Event) {
    const selected = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    files = selected;
    frameDelays = selected.map(() => options.delayMs);
    clearOutput();
    error = selected.length === 0 ? 'no-files' : undefined;
    status = '';
  }

  function setAllDelays(value: number) {
    options = GifMakerToolOptionsSchema.parse({ ...options, delayMs: value });
    frameDelays = files.map(() => value);
    clearOutput();
  }

  function setFrameDelay(index: number, value: number) {
    const next = frameDelays.slice();
    next[index] = Math.max(10, Math.min(60000, Math.round(value) || options.delayMs));
    frameDelays = next;
    clearOutput();
  }

  /** Decodes one selected file into a canvas-sized RGBA frame. */
  async function decodeFrame(
    file: File,
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
  ): Promise<void> {
    if (file.size > MAX_FILE_BYTES) throw fail('unsupported-file');
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw fail('decode-failed');
    }
    try {
      if (bitmap.width * bitmap.height > MAX_PIXELS) throw fail('unsupported-file');
      if (bitmap.width !== canvas.width || bitmap.height !== canvas.height)
        throw fail('mismatched-sizes');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0);
    } finally {
      bitmap.close();
    }
  }

  async function createGif() {
    if (files.length === 0) {
      error = 'no-files';
      return;
    }
    if (files.length > MAX_FRAMES) {
      error = 'too-many-frames';
      return;
    }

    clearOutput();
    error = undefined;
    status = '';
    busy = true;
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw fail('canvas-unavailable');

      // The first frame defines the canvas size. It goes through the same decode path as every
      // later frame, so a corrupt first file reports "decode failed" rather than escaping as a
      // generic encoder error the user cannot act on.
      let firstSize: { width: number; height: number };
      try {
        const first = await createImageBitmap(files[0]!);
        firstSize = { width: first.width, height: first.height };
        first.close();
      } catch {
        throw fail('decode-failed');
      }
      canvas.width = firstSize.width;
      canvas.height = firstSize.height;
      context.clearRect(0, 0, canvas.width, canvas.height);

      const frames: { data: Uint8ClampedArray; durationMs: number }[] = [];
      const durations = files.map((_file, index) => frameDelays[index] ?? options.delayMs);

      for (const [index, file] of files.entries()) {
        await decodeFrame(file, canvas, context);
        frames.push({
          data: new Uint8ClampedArray(context.getImageData(0, 0, canvas.width, canvas.height).data),
          durationMs: durations[index]!,
        });
      }

      const base = createRaster(canvas.width, canvas.height, frames[0]!.data);
      const withDelays = {
        ...base,
        frames: frames.map((frame) => ({
          data: frame.data,
          durationMs: frame.durationMs,
        })) as unknown as typeof base.frames,
      };
      const image = generateGifFrames(withDelays, options.frameGenerator, options.crossfadeFrames);

      const bytes = encodeGif(image, options.loopCount, {
        optimizeLevel: options.optimizeLevel,
        lossy: options.lossy,
        quantizer: options.quantizer,
        paletteSize: options.paletteSize,
        paletteMode: options.paletteMode,
        transparencyIndex: options.transparencyIndex,
        dither: options.dither,
        ditherAmount: options.ditherAmount,
        disposal: options.disposal,
        interlace: options.interlace,
      });

      if (bytes.byteLength > MAX_OUTPUT_BYTES) throw fail('output-too-large');

      // The preview is the encoded file itself, so the two cannot disagree.
      const blob = new Blob([bytes], { type: 'image/gif' });
      previewUrl = URL.createObjectURL(blob);
      outputBytes = bytes.byteLength;
      outputDimensions = { width: canvas.width, height: canvas.height };

      const summary = localized(tr('created'))
        .replace('{width}', String(canvas.width))
        .replace('{height}', String(canvas.height))
        .replace('{frames}', String(image.frames.length))
        .replace('{bytes}', String(bytes.byteLength))
        .replace('{loop}', String(options.loopCount))
        .replace('{generator}', localized(options.frameGenerator))
        .replace('{quantizer}', localized(options.quantizer))
        .replace('{paletteMode}', localized(options.paletteMode))
        .replace('{size}', String(options.paletteSize))
        .replace('{transparency}', String(options.transparencyIndex))
        .replace('{dither}', localized(options.dither))
        .replace('{ditherAmount}', String(options.ditherAmount))
        .replace('{disposal}', localized(options.disposal))
        .replace('{interlace}', localized(options.interlace ? 'interlaced' : 'sequential'))
        .replace('{opt}', String(options.optimizeLevel))
        .replace('{lossy}', String(options.lossy));
      status = `${summary} ${localized(tr('fidelity'))}`;
    } catch (cause) {
      if (typeof cause === 'string' && cause in enText.errors) error = cause as ErrorKind;
      else if (isEngineError(cause)) {
        error = 'encode-failed';
        status = engineErrorMessage(cause);
      } else error = 'encode-failed';
    } finally {
      busy = false;
    }
  }

  /* eslint-disable no-control-regex -- Reject ASCII control bytes in exported filenames. */
  function downloadName(): string {
    const stem =
      files[0]?.name
        .replace(/\.[^.]+$/u, '')
        .replace(/[\\/:*?"<>| -]/gu, '_')
        .slice(0, 100) || 'animation';
    return `${stem}.gif`;
  }

  onDestroy(clearOutput);
</script>

<svelte:head>
  <title>{tr('title')} — Image Compliant Tools</title>
  <meta name="description" content={tr('metaDescription')} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${ORIGIN}/gif-maker`} />
  <link rel="alternate" hreflang="en-XA" href={`${ORIGIN}/en-XA/gif-maker`} />
  <link rel="alternate" hreflang="ar" href={`${ORIGIN}/ar/gif-maker`} />
  <link rel="alternate" hreflang="x-default" href={`${ORIGIN}/gif-maker`} />
  <meta property="og:title" content={tr('title')} />
  <meta property="og:description" content={tr('metaDescription')} />
  <meta property="og:image" content={`${ORIGIN}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={`${ORIGIN}/og/tools.svg`} />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(schema)}</svelte:element
  >
</svelte:head>

<main class="tool-page t12-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <header class="tool-intro">
    <p class="eyebrow">{tr('eyebrow')}</p>
    <h1>{tr('title')}</h1>
    <p>{tr('description')}</p>
    <p class="privacy-copy">{tr('privacy')}</p>
  </header>

  <section class="t12-controls" aria-labelledby="t12-input-heading">
    <h2 id="t12-input-heading">{tr('inputHeading')}</h2>
    <label class="t12-file-card">
      <span>{tr('inputLabel')}</span>
      <input
        data-testid="t12-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        multiple
        aria-label={tr('chooseImages')}
        onchange={selectFiles}
      />
      {#if files.length > 0}
        <span class="t12-selected"
          >{files.length} · {files
            .map((file) => file.name)
            .slice(0, 4)
            .join(', ')}{files.length > 4 ? '…' : ''}</span
        >
      {/if}
    </label>
    <p class="t12-help">{tr('inputHelp')}</p>

    <GeneratedControls
      descriptions={localizedOptionDescriptions}
      values={{ ...optionValues }}
      onChange={updateOption}
      {locale}
    />

    {#if files.length > 0}
      <section class="t12-frames" aria-labelledby="t12-frames-heading">
        <h3 id="t12-frames-heading">{tr('frameHeading')}</h3>
        <label class="t12-all-delays">
          <span>{tr('frameDelay')}</span>
          <input
            data-testid="t12-delay-all"
            type="number"
            min="10"
            max="60000"
            value={options.delayMs}
            onchange={(event) =>
              setAllDelays(Number((event.currentTarget as HTMLInputElement).value))}
          />
          <span class="t12-help">{tr('frameDelayHelp')}</span>
        </label>
        <ol class="t12-frame-list">
          {#each files as file, index (index)}
            <li>
              <label>
                <span>{tr('frameDelayLabel').replace('{value}', String(index + 1))}</span>
                <input
                  data-testid={`t12-delay-${index}`}
                  type="number"
                  min="10"
                  max="60000"
                  value={frameDelays[index] ?? options.delayMs}
                  onchange={(event) =>
                    setFrameDelay(index, Number((event.currentTarget as HTMLInputElement).value))}
                />
                <span class="t12-frame-name">{file.name}</span>
              </label>
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    <div class="t12-actions">
      <button
        class="button primary"
        data-testid="t12-run"
        type="button"
        disabled={busy || files.length === 0}
        onclick={() => void createGif()}>{tr('create')}</button
      >
    </div>
    {#if busy}<p role="status" aria-live="polite">{tr('busy')}</p>
    {:else if status}<p role="status" aria-live="polite" data-testid="t12-status">{status}</p>
    {:else}<p role="status" aria-live="polite">{tr('ready')}</p>{/if}
    {#if error}
      <p class="t12-error" role="alert" data-error-kind={error} data-testid="t12-error">
        {errorText(error)}
      </p>
    {/if}
  </section>

  {#if previewUrl}
    <section class="t12-result" aria-labelledby="t12-preview-heading">
      <h2 id="t12-preview-heading">{tr('previewHeading')}</h2>
      <img data-testid="t12-preview" src={previewUrl} alt={tr('previewAlt')} />
      <p class="t12-metrics">
        {tr('dimensions')}: {outputDimensions.width} × {outputDimensions.height} · {tr('frames')}: {files.length}
        · {tr('size')}: {outputBytes} bytes · {tr('loop')}: {options.loopCount}
      </p>
      <p class="t12-fidelity">{tr('fidelity')}</p>
      <a
        class="button primary t12-download"
        data-testid="t12-download"
        href={previewUrl}
        download={downloadName()}>{tr('download')}</a
      >
    </section>
  {/if}

  <section class="tool-completion t12-faq" aria-labelledby="t12-faq-heading">
    <h2 id="t12-faq-heading">{tr('faqHeading')}</h2>
    {#each faq as item (item.question)}<details>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>{/each}
    <nav aria-label={tr('related')}>
      <a href={locale === 'en' ? '/gif-converter' : `/${locale}/gif-converter`}>{tr('splitter')}</a>
    </nav>
  </section>
</main>

<style>
  .t12-controls,
  .t12-result,
  .t12-faq {
    width: min(1080px, calc(100% - 32px));
    margin: 0 auto 40px;
  }
  .t12-controls {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: white;
  }
  .t12-controls h2,
  .t12-result h2 {
    margin-block-start: 0;
  }
  .t12-file-card {
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    border: 1px solid #1c1a1720;
    border-radius: 8px;
  }
  .t12-file-card > span:first-child {
    font-weight: 600;
  }
  .t12-file-card input {
    max-width: 100%;
  }
  .t12-selected,
  .t12-help,
  .t12-fidelity {
    color: #5c5a56;
    font-size: 13px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
  .t12-frames {
    margin: 24px 0;
    padding: 16px;
    border: 1px solid #1c1a1720;
    border-radius: 8px;
  }
  .t12-frames h3 {
    margin-block-start: 0;
  }
  .t12-all-delays {
    display: grid;
    gap: 4px;
    margin-block-end: 16px;
  }
  .t12-frame-list {
    max-height: 320px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  .t12-frame-list label {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding-block: 6px;
  }
  .t12-frame-name {
    color: #5c5a56;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .t12-result {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: #fff;
  }
  .t12-result img {
    display: block;
    width: 100%;
    max-width: 480px;
    height: auto;
    max-height: 420px;
    object-fit: contain;
    background: repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 16px 16px;
  }
  .t12-metrics {
    font-variant-numeric: tabular-nums;
  }
  .t12-download {
    display: inline-block;
    margin-block-start: 8px;
  }
  .t12-error {
    padding: 12px;
    border-inline-start: 4px solid #a21f17;
    color: #7c1711;
    background: #fff1ef;
  }
  @media (max-width: 700px) {
    .t12-frame-list label {
      grid-template-columns: minmax(0, 1fr) 96px;
    }
    .t12-frame-name {
      display: none;
    }
    .t12-controls,
    .t12-result {
      padding: 16px;
    }
  }
</style>
