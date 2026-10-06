<script lang="ts">
  /**
   * T15 Spritesheet Tools — README §4.1, PLAN.md P6-01.
   *
   * Both directions are wired to the engine: `packSpritesheet` places frames and describes them
   * as a JSON atlas, `sliceSpritesheet` reads a sheet back apart. Pixels are produced by the
   * engine and encoded here; no image is uploaded, and the JSON atlas is offered as a download
   * alongside the sheet so a consumer can rely on the two agreeing.
   */
  import { onDestroy } from 'svelte';
  import {
    T15SpritesheetOptionsSchema,
    t15SpritesheetOptionDescriptions,
    type T15SpritesheetOptions,
  } from '@complianttools/image-engine/schemas/p6-01-options';
  import {
    atlasFromJson,
    createRaster,
    engineErrorMessage,
    isEngineError,
    packSpritesheet,
    sliceSpritesheetByAtlas,
    type RasterImage,
    type SpritesheetAtlas,
  } from '@complianttools/image-engine';
  import GeneratedControls from './GeneratedControls.svelte';
  import { localizeOptions, type Locale } from './i18n';

  type ErrorKind =
    | 'unsupported-file'
    | 'decode-failed'
    | 'canvas-unavailable'
    | 'too-many-files'
    | 'empty-atlas'
    | 'atlas-invalid'
    | 'processing-failed';

  const MAX_FILE_BYTES = 24 * 1024 * 1024;
  const MAX_FILES = 4096;
  const MAX_PIXELS = 20_000_000;
  const ORIGIN = 'https://image.complianttools.com';

  const enText = {
    title: 'Spritesheet Tools',
    eyebrow: 'Local convert and export',
    description:
      'Pack local images into a PNG spritesheet with a JSON atlas that names every frame, or slice an existing sheet — and its atlas — back into individual frames. Packing uses uniform cells so a consumer can index the sheet with arithmetic. Nothing is uploaded.',
    metaDescription:
      'Pack images into a PNG spritesheet with a JSON atlas, or slice a sheet back into frames, entirely in your browser.',
    privacy: 'Your images stay in this browser. No upload and no network request.',
    inputHeading: 'Choose the images',
    inputLabel: 'Images to pack',
    chooseImages: 'Choose the images to pack into a sheet',
    sheetLabel: 'Spritesheet to slice',
    chooseSheet: 'Choose the spritesheet to slice',
    atlasLabel: 'Atlas JSON for the sheet (optional)',
    atlasHelp:
      'Supply the atlas this tool exported earlier and the slices use its exact coordinates. Leave it empty to slice on an even grid instead.',
    chooseAtlas: 'Choose the atlas JSON',
    inputHelp: `PNG, JPEG, or WebP images, up to ${MAX_FILES.toLocaleString('en-US')} files and 24 MiB each.`,
    run: 'Create spritesheet',
    slice: 'Slice spritesheet',
    busy: 'Working locally…',
    ready: 'Choose at least one image to begin.',
    previewHeading: 'Result',
    sheetAlt: 'The generated spritesheet',
    frameAlt: 'Frame {value} sliced from the sheet',
    downloadSheet: 'Download spritesheet PNG',
    downloadAtlas: 'Download atlas JSON',
    downloadFrames: 'Download all frames as PNG',
    frames: 'Frames',
    dimensions: 'Dimensions',
    sheetSize: 'Sheet size',
    packed:
      'Packed {frames} frame(s) into a {width}×{height} sheet on a {columns}×{rows} grid ({bytes} bytes). The JSON atlas describes every frame.',
    sliced: 'Sliced {frames} frame(s) from a {width}×{height} sheet using the supplied atlas.',
    slicedGrid: 'Sliced {frames} frame(s) from a {width}×{height} sheet on an even grid.',
    fidelity: 'The preview and the download are the same encoded PNG bytes.',
    framesHeading: 'Sliced frames',
    faqHeading: 'Questions about spritesheets',
    faqAtlas: 'What is the JSON atlas?',
    faqAtlasAnswer:
      'A plain JSON file listing each frame’s index, x/y offset, and size. A game reads it to find each sprite, so the offsets must match the exported sheet exactly — which is what the packer guarantees.',
    faqSlice: 'How do I slice an existing sheet?',
    faqSliceAnswer:
      'Choose the sheet and, if you have one, the atlas JSON that came with it. Slicing by atlas uses those coordinates exactly; slicing without one divides the sheet into an even grid.',
    faqPrivacy: 'Are images uploaded?',
    faqPrivacyAnswer: 'No. Packing, slicing, and PNG encoding all run locally in this browser.',
    related: 'Related tools',
    crop: 'Crop image',
    errors: {
      'unsupported-file': 'Choose a valid PNG, JPEG, or WebP image.',
      'decode-failed': 'The browser could not decode one of the selected images.',
      'canvas-unavailable': 'The browser could not create a local image canvas.',
      'too-many-files': `Choose at most ${MAX_FILES.toLocaleString('en-US')} images in one sheet.`,
      'empty-atlas': 'The atlas JSON contains no frames to slice.',
      'atlas-invalid': 'That file is not a spritesheet atlas this tool can read.',
      'processing-failed': 'The spritesheet could not be produced from these inputs.',
    },
    remedies: {
      'unsupported-file': 'Export the image as PNG, JPEG, or WebP and choose it again.',
      'decode-failed': 'Export a valid, non-animated image and try again.',
      'canvas-unavailable': 'Try a browser with local 2D canvas support.',
      'too-many-files': 'Pack the images in smaller groups, or raise the column count to fit them.',
      'empty-atlas': 'Export the atlas again from this tool, or slice without an atlas.',
      'atlas-invalid':
        'Choose the spritesheet.png.json file this tool exported alongside the sheet.',
      'processing-failed':
        'Reduce the frame count or image size and try again. Your original files are unchanged.',
    },
  } as const;

  type TextKey = Exclude<keyof typeof enText, 'errors' | 'remedies'>;
  type LocalizedCopy = Record<TextKey, string> & {
    errors: Record<ErrorKind, string>;
    remedies: Record<ErrorKind, string>;
  };

  const arText: LocalizedCopy = {
    title: 'أدوات لوحة الصور',
    eyebrow: 'تحويل وتصدير محلي',
    description:
      'جمّع صورًا محلية في لوحة صور بصيغة PNG مع فهرس JSON يسمّي كل إطار، أو قسّم لوحة موجودة — وفهرسها — إلى إطارات منفصلة. تستخدم الدمج خلايا متساوية الحجم يمكن للمستهلك فهرستها حسابيًا. لا يُرفع شيء.',
    metaDescription:
      'جمّع صورًا في لوحة صور PNG مع فهرس JSON، أو قسّم لوحة إلى إطارات، بالكامل في متصفحك.',
    privacy: 'تبقى صورك في هذا المتصفح. لا رفع ولا طلب شبكة.',
    inputHeading: 'اختر الصور',
    inputLabel: 'الصور المراد دمجها',
    chooseImages: 'اختر الصور المراد دمجها في لوحة',
    sheetLabel: 'لوحة الصور المراد تقسيمها',
    chooseSheet: 'اختر لوحة الصور المراد تقسيمها',
    atlasLabel: 'ملف فهرس JSON للوحة (اختياري)',
    atlasHelp:
      'قدّم الفهرس الذي صدّرته هذه الأداة سابقًا ليعتمد التقسيم على إحداثياته بدقة. اتركه فارغًا للقسمة على شبكة متساوية بدلًا من ذلك.',
    chooseAtlas: 'اختر ملف فهرس JSON',
    inputHelp: `صور PNG أو JPEG أو WebP، حتى ${MAX_FILES.toLocaleString('en-US')} ملف و24 ميبيبايت لكل ملف.`,
    run: 'أنشئ لوحة صور',
    slice: 'قسّم لوحة الصور',
    busy: 'جارٍ العمل محليًا…',
    ready: 'اختر صورة واحدة على الأقل للبدء.',
    previewHeading: 'النتيجة',
    sheetAlt: 'لوحة الصور المُنشأة',
    frameAlt: 'الإطار {value} المقسوم من اللوحة',
    downloadSheet: 'تنزيل لوحة الصور PNG',
    downloadAtlas: 'تنزيل فهرس JSON',
    downloadFrames: 'تنزيل كل الإطارات بصيغة PNG',
    frames: 'الإطارات',
    dimensions: 'الأبعاد',
    sheetSize: 'حجم اللوحة',
    packed:
      'جُمعت {frames} إطار في لوحة {width}×{height} على شبكة {columns}×{rows} ({bytes} بايت). يصف فهرس JSON كل إطار.',
    sliced: 'قُسمت {frames} إطار من لوحة {width}×{height} باستخدام الفهرس المقدَّم.',
    slicedGrid: 'قُسمت {frames} إطار من لوحة {width}×{height} على شبكة متساوية.',
    fidelity: 'المعاينة والتنزيل هما بايتات PNG المرمّزة نفسها.',
    framesHeading: 'الإطارات المقسومة',
    faqHeading: 'أسئلة حول لوحات الصور',
    faqAtlas: 'ما هو فهرس JSON؟',
    faqAtlasAnswer:
      'ملف JSON عادي يسرد رقم كل إطار وإحداثياته وحجمه. تقرأه اللعبة للعثور على كل صورة، لذا يجب أن تطابق الإحداثيات اللوحة المصدَّرة تمامًا، وهو ما يضمنه الدمج.',
    faqSlice: 'كيف أقسّم لوحة موجودة؟',
    faqSliceAnswer:
      'اختر اللوحة، وإن كان لديك فهرس JSON المصاحب فاختره أيضًا. التقسيم بالفهرس يستخدم تلك الإحداثيات بدقة، والتقسيم بدونه يقسم اللوحة إلى شبكة متساوية.',
    faqPrivacy: 'هل تُرفع الصور؟',
    faqPrivacyAnswer: 'لا. يجري الدمج والتقسيم وترميز PNG محليًا في هذا المتصفح.',
    related: 'أدوات ذات صلة',
    crop: 'اقتصاص صورة',
    errors: {
      'unsupported-file': 'اختر صورة PNG أو JPEG أو WebP صالحة.',
      'decode-failed': 'تعذر على المتصفح فك ترميز إحدى الصور المختارة.',
      'canvas-unavailable': 'تعذر على المتصفح إنشاء لوحة صور محلية.',
      'too-many-files': `اختر ${MAX_FILES.toLocaleString('en-US')} صورة كحد أقصى في اللوحة الواحدة.`,
      'empty-atlas': 'لا يحتوي ملف الفهرس على أي إطار لتقسيمه.',
      'atlas-invalid': 'هذا الملف ليس فهرس لوحة صور يمكن قراءته.',
      'processing-failed': 'تعذر إنتاج لوحة الصور من هذه المدخلات.',
    },
    remedies: {
      'unsupported-file': 'صدّر الصورة بصيغة PNG أو JPEG أو WebP ثم اخترها مجددًا.',
      'decode-failed': 'صدّر صورة صالحة غير متحركة ثم أعد المحاولة.',
      'canvas-unavailable': 'جرّب متصفحًا يدعم لوحة 2D محلية.',
      'too-many-files': 'قسم الصور إلى مجموعات أصغر، أو زد عدد الأعمدة لتستوعبها.',
      'empty-atlas': 'صدّر الفهرس مجددًا من هذه الأداة، أو التقسّم بدون فهرس.',
      'atlas-invalid': 'اختر ملف spritesheet.png.json الذي صدّرته هذه الأدوة مع اللوحة.',
      'processing-failed':
        'قلّل عدد الإطارات أو حجم الصور ثم أعد المحاولة. ملفاتك الأصلية تبقى دون تغيير.',
    },
  };

  let { locale = 'en' }: { locale?: Locale } = $props();

  let files = $state<readonly File[]>([]);
  let atlasFile = $state<File>();
  let options = $state<T15SpritesheetOptions>(T15SpritesheetOptionsSchema.parse({}));
  let sheetUrl = $state('');
  let sheetBytes = $state(0);
  let sheetDimensions = $state({ width: 0, height: 0 });
  let atlasJson = $state('');
  let frameUrls = $state<readonly { name: string; url: string }[]>([]);
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
  const path = $derived(locale === 'en' ? '/spritesheet' : `/${locale}/spritesheet`);
  const canonical = $derived(`${ORIGIN}${path}`);
  const faq = $derived([
    { question: tr('faqAtlas'), answer: tr('faqAtlasAnswer') },
    { question: tr('faqSlice'), answer: tr('faqSliceAnswer') },
    { question: tr('faqPrivacy'), answer: tr('faqPrivacyAnswer') },
  ]);
  const localizedOptionDescriptions = $derived(
    localizeOptions(locale, t15SpritesheetOptionDescriptions),
  );
  const optionValues = $derived({
    't15.mode': options.mode,
    't15.columns': options.columns,
    't15.rows': options.rows,
    't15.padding': options.padding,
    't15.trim': options.trim,
    't15.emitAtlas': options.emitAtlas,
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
          { '@type': 'ListItem', position: 1, name: tr('related'), item: `${ORIGIN}/crop` },
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

  function releaseUrls(urls: readonly { url: string }[]) {
    for (const entry of urls) URL.revokeObjectURL(entry.url);
  }

  function clearOutput() {
    if (sheetUrl) URL.revokeObjectURL(sheetUrl);
    releaseUrls(frameUrls);
    sheetUrl = '';
    sheetBytes = 0;
    sheetDimensions = { width: 0, height: 0 };
    atlasJson = '';
    frameUrls = [];
  }

  function updateOption(path: string, value: unknown) {
    const key = path.startsWith('t15.') ? path.slice(4) : path;
    const parsed = T15SpritesheetOptionsSchema.safeParse({ ...options, [key]: value });
    if (parsed.success) {
      options = parsed.data;
      clearOutput();
      status = '';
      error = undefined;
    }
  }

  function selectFiles(event: Event) {
    files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    clearOutput();
    status = '';
    error = undefined;
  }

  function selectAtlas(event: Event) {
    atlasFile = (event.currentTarget as HTMLInputElement).files?.[0];
    clearOutput();
    status = '';
    error = undefined;
  }

  /** Decodes a file into an RGBA raster through a canvas, the browser's only image decoder. */
  async function decode(file: File): Promise<{
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
  }> {
    if (file.size > MAX_FILE_BYTES) throw 'unsupported-file' satisfies ErrorKind;
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw 'decode-failed' satisfies ErrorKind;
    }
    try {
      if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > MAX_PIXELS)
        throw 'unsupported-file' satisfies ErrorKind;
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

  async function pngBlob(image: {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
  }): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw 'canvas-unavailable' satisfies ErrorKind;
    const imageData = context.createImageData(image.width, image.height);
    imageData.data.set(image.data);
    context.putImageData(imageData, 0, 0);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject('processing-failed' satisfies ErrorKind)),
        'image/png',
      );
    });
  }

  async function pack() {
    if (files.length === 0) {
      error = 'unsupported-file';
      return;
    }
    if (files.length > MAX_FILES) {
      error = 'too-many-files';
      return;
    }

    clearOutput();
    error = undefined;
    status = '';
    busy = true;
    try {
      const decoded = await Promise.all(files.map(decode));
      const rasters = decoded.map((image) => {
        const raster = createRaster(image.width, image.height, image.data);
        return { ...raster, frames: [{ data: image.data, durationMs: 0 }] as typeof raster.frames };
      });

      const { sheet, atlas } = packSpritesheet(rasters, {
        ...(options.columns > 0 ? { columns: options.columns } : {}),
        padding: options.padding,
        trim: options.trim,
      });
      const blob = await pngBlob({
        width: sheet.width,
        height: sheet.height,
        data: sheet.frames[0]!.data,
      });

      sheetUrl = URL.createObjectURL(blob);
      sheetBytes = blob.size;
      sheetDimensions = { width: sheet.width, height: sheet.height };
      if (options.emitAtlas) atlasJson = `${JSON.stringify(atlas, null, 2)}\n`;

      status = localized(tr('packed'))
        .replace('{frames}', String(atlas.frames.length))
        .replace('{width}', String(sheet.width))
        .replace('{height}', String(sheet.height))
        .replace('{columns}', String(atlas.columns))
        .replace('{rows}', String(atlas.rows))
        .replace('{bytes}', String(blob.size));
    } catch (cause) {
      error =
        typeof cause === 'string' && cause in enText.errors
          ? (cause as ErrorKind)
          : isEngineError(cause)
            ? (error = 'processing-failed')
            : 'processing-failed';
      if (isEngineError(cause)) status = engineErrorMessage(cause);
    } finally {
      busy = false;
    }
  }

  async function slice() {
    if (files.length !== 1) {
      error = 'unsupported-file';
      return;
    }

    clearOutput();
    error = undefined;
    status = '';
    busy = true;
    try {
      const source = await decode(files[0]!);
      const base = createRaster(source.width, source.height, source.data);
      const sheet = {
        ...base,
        frames: [{ data: source.data, durationMs: 0 }] as typeof base.frames,
      };

      let frames: readonly RasterImage[];
      let usedAtlas: boolean;
      if (atlasFile) {
        let parsed: SpritesheetAtlas;
        try {
          parsed = atlasFromJson(JSON.parse(await atlasFile.text()));
        } catch {
          throw 'atlas-invalid' satisfies ErrorKind;
        }
        if (parsed.frames.length === 0) throw 'empty-atlas' satisfies ErrorKind;
        frames = sliceSpritesheetByAtlas(sheet, parsed);
        usedAtlas = true;
      } else {
        // Without an atlas there is no grid to read, so divide the sheet evenly. A sheet that is
        // not a whole number of cells would slice a partial frame at the edge.
        const columns = options.columns > 0 ? options.columns : 1;
        const rows = options.rows > 0 ? options.rows : 1;
        if (sheet.width % columns !== 0 || sheet.height % rows !== 0)
          throw 'processing-failed' satisfies ErrorKind;
        frames = sliceSpritesheetByAtlas(sheet, {
          image: 'spritesheet.png',
          size: { w: sheet.width, h: sheet.height },
          frameWidth: sheet.width / columns,
          frameHeight: sheet.height / rows,
          columns,
          rows,
          padding: 0,
          frames: Array.from({ length: columns * rows }, (_unused, index) => ({
            index,
            x: (index % columns) * (sheet.width / columns),
            y: Math.floor(index / columns) * (sheet.height / rows),
            width: sheet.width / columns,
            height: sheet.height / rows,
            sourceWidth: sheet.width / columns,
            sourceHeight: sheet.height / rows,
            trimmed: false,
          })),
        });
        usedAtlas = false;
      }

      const urls: { name: string; url: string }[] = [];
      for (const [index, frame] of frames.entries()) {
        const blob = await pngBlob({
          width: frame.width,
          height: frame.height,
          data: frame.frames[0]!.data,
        });
        urls.push({ name: `frame-${index}.png`, url: URL.createObjectURL(blob) });
      }
      frameUrls = urls;

      const message = usedAtlas ? tr('sliced') : tr('slicedGrid');
      status = localized(message)
        .replace('{frames}', String(frames.length))
        .replace('{width}', String(sheet.width))
        .replace('{height}', String(sheet.height));
    } catch (cause) {
      if (typeof cause === 'string' && cause in enText.errors) error = cause as ErrorKind;
      else if (isEngineError(cause)) {
        error = 'processing-failed';
        status = engineErrorMessage(cause);
      } else error = 'processing-failed';
    } finally {
      busy = false;
    }
  }

  function run() {
    if (options.mode === 'pack') void pack();
    else void slice();
  }

  function sheetName(): string {
    const stem =
      files[0]?.name
        .replace(/\.[^.]+$/u, '')
        .replace(/[\\/:*?"<>| -]/gu, '_')
        .slice(0, 80) || 'spritesheet';
    return `${stem}-spritesheet.png`;
  }

  onDestroy(clearOutput);
</script>

<svelte:head>
  <title>{tr('title')} — Image Compliant Tools</title>
  <meta name="description" content={tr('metaDescription')} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${ORIGIN}/spritesheet`} />
  <link rel="alternate" hreflang="en-XA" href={`${ORIGIN}/en-XA/spritesheet`} />
  <link rel="alternate" hreflang="ar" href={`${ORIGIN}/ar/spritesheet`} />
  <link rel="alternate" hreflang="x-default" href={`${ORIGIN}/spritesheet`} />
  <meta property="og:title" content={tr('title')} />
  <meta property="og:description" content={tr('metaDescription')} />
  <meta property="og:image" content={`${ORIGIN}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={`${ORIGIN}/og/tools.svg`} />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(schema)}</svelte:element
  >
</svelte:head>

<main class="tool-page t15-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <header class="tool-intro">
    <p class="eyebrow">{tr('eyebrow')}</p>
    <h1>{tr('title')}</h1>
    <p>{tr('description')}</p>
    <p class="privacy-copy">{tr('privacy')}</p>
  </header>

  <section class="t15-controls" aria-labelledby="t15-input-heading">
    <h2 id="t15-input-heading">{tr('inputHeading')}</h2>

    <GeneratedControls
      descriptions={localizedOptionDescriptions}
      values={{ ...optionValues }}
      onChange={updateOption}
      {locale}
    />

    {#if options.mode === 'pack'}
      <label class="t15-file-card">
        <span>{tr('inputLabel')}</span>
        <input
          data-testid="t15-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          multiple
          aria-label={tr('chooseImages')}
          onchange={selectFiles}
        />
        {#if files.length > 0}<span class="t15-selected">{files.length}</span>{/if}
      </label>
    {:else}
      <label class="t15-file-card">
        <span>{tr('sheetLabel')}</span>
        <input
          data-testid="t15-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          aria-label={tr('chooseSheet')}
          onchange={selectFiles}
        />
      </label>
      <label class="t15-file-card">
        <span>{tr('atlasLabel')}</span>
        <input
          data-testid="t15-atlas"
          type="file"
          accept="application/json,.json"
          aria-label={tr('chooseAtlas')}
          onchange={selectAtlas}
        />
        <span class="t15-help">{tr('atlasHelp')}</span>
      </label>
    {/if}
    <p class="t15-help">{tr('inputHelp')}</p>

    <div class="t15-actions">
      <button
        class="button primary"
        data-testid="t15-run"
        type="button"
        disabled={busy || files.length === 0}
        onclick={run}>{options.mode === 'pack' ? tr('run') : tr('slice')}</button
      >
    </div>
    {#if busy}<p role="status" aria-live="polite">{tr('busy')}</p>
    {:else if status}<p role="status" aria-live="polite" data-testid="t15-status">{status}</p>
    {:else}<p role="status" aria-live="polite">{tr('ready')}</p>{/if}
    {#if error}
      <p class="t15-error" role="alert" data-error-kind={error} data-testid="t15-error">
        {errorText(error)}
      </p>
    {/if}
  </section>

  {#if sheetUrl || frameUrls.length > 0}
    <section class="t15-result" aria-labelledby="t15-result-heading">
      <h2 id="t15-result-heading">{tr('previewHeading')}</h2>
      {#if sheetUrl}
        <p class="t15-metrics">
          {tr('sheetSize')}: {sheetDimensions.width} × {sheetDimensions.height} · {sheetBytes} bytes
        </p>
        <img data-testid="t15-preview" src={sheetUrl} alt={tr('sheetAlt')} />
        <p class="t15-fidelity">{tr('fidelity')}</p>
        <p class="t15-downloads">
          <a
            class="button primary"
            data-testid="t15-download-sheet"
            href={sheetUrl}
            download={sheetName()}>{tr('downloadSheet')}</a
          >
          {#if atlasJson}
            <a
              class="button"
              data-testid="t15-download-atlas"
              href={`data:application/json;charset=utf-8,${encodeURIComponent(atlasJson)}`}
              download="spritesheet.json">{tr('downloadAtlas')}</a
            >
          {/if}
        </p>
        <details class="t15-atlas">
          <summary>spritesheet.json</summary>
          <pre data-testid="t15-atlas-json">{atlasJson}</pre>
        </details>
      {/if}
      {#if frameUrls.length > 0}
        <h3>{tr('framesHeading')}</h3>
        <ul class="t15-frame-grid" data-testid="t15-frames">
          {#each frameUrls as frame, index (frame.name)}
            <li>
              <img src={frame.url} alt={tr('frameAlt').replace('{value}', String(index + 1))} />
              <a href={frame.url} download={frame.name}>{frame.name}</a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  <section class="tool-completion t15-faq" aria-labelledby="t15-faq-heading">
    <h2 id="t15-faq-heading">{tr('faqHeading')}</h2>
    {#each faq as item (item.question)}<details>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>{/each}
    <nav aria-label={tr('related')}>
      <a href={locale === 'en' ? '/crop' : `/${locale}/crop`}>{tr('crop')}</a>
    </nav>
  </section>
</main>

<style>
  .t15-controls,
  .t15-result,
  .t15-faq {
    width: min(1080px, calc(100% - 32px));
    margin: 0 auto 40px;
  }
  .t15-controls {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: white;
  }
  .t15-controls h2,
  .t15-result h2 {
    margin-block-start: 0;
  }
  .t15-file-card {
    display: grid;
    gap: 12px;
    min-width: 0;
    margin-block: 16px;
    padding: 16px;
    border: 1px solid #1c1a1720;
    border-radius: 8px;
  }
  .t15-file-card > span:first-child {
    font-weight: 600;
  }
  .t15-file-card input {
    max-width: 100%;
  }
  .t15-selected,
  .t15-help,
  .t15-fidelity {
    color: #5c5a56;
    font-size: 13px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
  .t15-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .t15-result {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: #fff;
  }
  .t15-result img {
    display: block;
    width: 100%;
    max-width: 560px;
    height: auto;
    max-height: 460px;
    object-fit: contain;
    background: repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 16px 16px;
  }
  .t15-metrics {
    font-variant-numeric: tabular-nums;
  }
  .t15-downloads {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .t15-downloads .button {
    display: inline-block;
  }
  .t15-atlas pre {
    max-height: 320px;
    padding: 12px;
    overflow: auto;
    font-size: 12px;
    background: #f5f3f0;
  }
  .t15-frame-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .t15-frame-grid li {
    min-width: 0;
  }
  .t15-frame-grid img {
    background: repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 16px 16px;
  }
  .t15-frame-grid a {
    display: block;
    margin-block-start: 4px;
    font-size: 13px;
  }
  .t15-error {
    padding: 12px;
    border-inline-start: 4px solid #a21f17;
    color: #7c1711;
    background: #fff1ef;
  }
  @media (max-width: 700px) {
    .t15-controls,
    .t15-result {
      padding: 16px;
    }
  }
</style>
