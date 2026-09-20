<script lang="ts">
  import { onDestroy } from 'svelte';

  type Locale = 'en' | 'en-XA' | 'ar';
  type Region = { x: number; y: number; width: number; height: number };
  type Dimensions = { width: number; height: number };
  type ErrorKind = 'unsupported' | 'too-large' | 'too-many-pixels' | 'animated' | 'decode' | 'canvas';

  const ORIGIN = 'https://image.complianttools.com';
  const MAX_FILE_BYTES = 16 * 1024 * 1024;
  const MAX_PIXELS = 6_000_000;
  const MAX_REGIONS = 12;
  const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

  const en = {
    title: 'Blur Faces in an Image',
    description: 'Blur selected face regions in a still PNG directly in your browser. You mark the regions yourself; no face detector or upload is used.',
    eyebrow: 'Local image privacy tool',
    heading: 'Blur Faces in an Image',
    intro: 'Mark each face with a rectangle, inspect the blurred preview, then download a PNG copy.',
    privacy: 'Your image stays in this browser. Processing is local; nothing is uploaded.',
    manual: 'This tool does not detect faces automatically. You must mark every face you want blurred and check the full image before downloading.',
    choose: 'Choose a still PNG',
    inputLabel: 'Choose a still PNG image to blur selected face regions',
    limits: 'Still PNG only; up to 16 MiB and 6 megapixels. Animated PNG is not supported.',
    ready: 'Choose a PNG, then drag over a face to mark the area to blur.',
    loaded: (name: string, width: number, height: number) => `${name} · ${width} × ${height} pixels`,
    drawHelp: 'Drag over each face. Areas are rectangular and may include nearby image content; review every marked area.',
    coordinates: 'Or enter an area by its PNG pixel coordinates',
    x: 'Left position (x)',
    y: 'Top position (y)',
    width: 'Width',
    height: 'Height',
    addCoordinates: 'Add area from coordinates',
    regions: 'Marked areas',
    noRegions: 'No areas marked yet.',
    region: (number: number, x: number, y: number, width: number, height: number) => `Area ${number}: ${x}, ${y}, ${width} × ${height}`,
    remove: 'Remove area',
    blurStrength: 'Blur strength',
    blurValue: (value: number) => `${value} pixels`,
    clearAreas: 'Clear all areas',
    clearImage: 'Remove image',
    download: 'Download blurred PNG',
    status: (count: number) => `${count} ${count === 1 ? 'area' : 'areas'} will be blurred in the downloaded image.`,
    needRegion: 'Mark at least one face area before downloading.',
    tooManyRegions: 'You can mark up to 12 areas.',
    smallRegion: 'Drag a larger area. Each marked area must be at least 8 × 8 pixels.',
    errorPrefix: 'Try this',
    errors: {
      unsupported: 'Choose a valid PNG image.',
      'too-large': 'The PNG exceeds the 16 MiB file limit.',
      'too-many-pixels': 'The image exceeds the 6 megapixel limit.',
      animated: 'Animated PNG is not supported.',
      decode: 'The browser could not decode this PNG.',
      canvas: 'This browser could not process the image locally.',
    } satisfies Record<ErrorKind, string>,
    remedies: {
      unsupported: 'Export a still PNG image and choose it again.',
      'too-large': 'Choose a PNG smaller than 16 MiB.',
      'too-many-pixels': 'Resize the image to 6 megapixels or fewer, then try again.',
      animated: 'Export one still frame as a regular PNG.',
      decode: 'Export a valid, non-animated PNG and try again.',
      canvas: 'Try a current browser with 2D canvas support.',
    } satisfies Record<ErrorKind, string>,
    faqHeading: 'About this tool',
    faqDetection: 'Does it find faces for me?',
    faqDetectionAnswer: 'No. There is no automatic face detection. Mark each face yourself and review the whole image because unmarked faces remain visible.',
    faqPrivacy: 'Are my images uploaded?',
    faqPrivacyAnswer: 'No. The image is decoded, previewed, blurred, and exported locally in your browser.',
    faqInput: 'Which images can I use?',
    faqInputAnswer: 'Use a still PNG up to 16 MiB and 6 megapixels. The download is a PNG copy; the original file is unchanged.',
  } as const;

  const ar = {
    title: 'تمويه الوجوه في صورة',
    description: 'موّه مناطق الوجوه التي تحددها يدويًا في صورة PNG ثابتة داخل المتصفح. لا يتم رفع الصورة ولا يُستخدم كاشف وجوه.',
    eyebrow: 'أداة خصوصية محلية للصور',
    heading: 'تمويه الوجوه في صورة',
    intro: 'حدّد كل وجه بمستطيل، وافحص المعاينة المموهة، ثم نزّل نسخة PNG.',
    privacy: 'تبقى الصورة في هذا المتصفح. تتم المعالجة محليًا ولا يتم رفعها.',
    manual: 'لا تكتشف هذه الأداة الوجوه تلقائيًا. يجب تحديد كل وجه تريد تمويهه وفحص الصورة كاملة قبل التنزيل.',
    choose: 'اختر صورة PNG ثابتة',
    inputLabel: 'اختر صورة PNG ثابتة لتمويه مناطق الوجوه المحددة',
    limits: 'تدعم PNG الثابتة فقط؛ حتى 16 ميبيبايت و6 ميغابكسل. لا تدعم PNG المتحركة.',
    ready: 'اختر صورة PNG، ثم اسحب فوق الوجه لتحديد المنطقة المراد تمويهها.',
    loaded: (name: string, width: number, height: number) => `${name} · ${width} × ${height} بكسل`,
    drawHelp: 'اسحب فوق كل وجه. المناطق مستطيلة وقد تشمل أجزاء قريبة من الصورة؛ راجع كل منطقة محددة.',
    coordinates: 'أو أدخل المنطقة بإحداثيات بكسل PNG',
    x: 'الموضع الأيسر (x)',
    y: 'الموضع العلوي (y)',
    width: 'العرض',
    height: 'الارتفاع',
    addCoordinates: 'إضافة منطقة بالإحداثيات',
    regions: 'المناطق المحددة',
    noRegions: 'لم يتم تحديد مناطق بعد.',
    region: (number: number, x: number, y: number, width: number, height: number) => `المنطقة ${number}: ${x}، ${y}، ${width} × ${height}`,
    remove: 'إزالة المنطقة',
    blurStrength: 'قوة التمويه',
    blurValue: (value: number) => `${value} بكسل`,
    clearAreas: 'مسح كل المناطق',
    clearImage: 'إزالة الصورة',
    download: 'تنزيل PNG مموهة',
    status: (count: number) => `سيتم تمويه ${count} منطقة في الصورة التي سيتم تنزيلها.`,
    needRegion: 'حدّد منطقة وجه واحدة على الأقل قبل التنزيل.',
    tooManyRegions: 'يمكنك تحديد 12 منطقة كحد أقصى.',
    smallRegion: 'اسحب لتحديد مساحة أكبر. يجب ألا تقل أبعاد المنطقة عن 8 × 8 بكسل.',
    errorPrefix: 'جرّب هذا',
    errors: {
      unsupported: 'اختر صورة PNG صالحة.',
      'too-large': 'يتجاوز ملف PNG حد الحجم البالغ 16 ميبيبايت.',
      'too-many-pixels': 'تتجاوز الصورة حد 6 ميغابكسل.',
      animated: 'لا تدعم الأداة PNG المتحركة.',
      decode: 'تعذر على المتصفح فك ترميز صورة PNG.',
      canvas: 'تعذرت معالجة الصورة محليًا في هذا المتصفح.',
    } satisfies Record<ErrorKind, string>,
    remedies: {
      unsupported: 'صدّر صورة PNG ثابتة ثم اخترها مجددًا.',
      'too-large': 'اختر صورة PNG أصغر من 16 ميبيبايت.',
      'too-many-pixels': 'غيّر حجم الصورة إلى 6 ميغابكسل أو أقل ثم أعد المحاولة.',
      animated: 'صدّر إطارًا ثابتًا واحدًا بصيغة PNG عادية.',
      decode: 'صدّر صورة PNG صالحة وغير متحركة ثم أعد المحاولة.',
      canvas: 'جرّب متصفحًا حديثًا يدعم لوحة 2D.',
    } satisfies Record<ErrorKind, string>,
    faqHeading: 'حول هذه الأداة',
    faqDetection: 'هل تعثر الأداة على الوجوه تلقائيًا؟',
    faqDetectionAnswer: 'لا. لا يوجد اكتشاف تلقائي للوجوه. حدّد كل وجه بنفسك وراجع الصورة كاملة لأن الوجوه غير المحددة ستظل ظاهرة.',
    faqPrivacy: 'هل يتم رفع صوري؟',
    faqPrivacyAnswer: 'لا. يجري فك ترميز الصورة ومعاينتها وتمويهها وتصديرها محليًا في المتصفح.',
    faqInput: 'ما الصور التي يمكنني استخدامها؟',
    faqInputAnswer: 'استخدم صورة PNG ثابتة حتى 16 ميبيبايت و6 ميغابكسل. التنزيل نسخة PNG ولا يتغير الملف الأصلي.',
  } as const;

  let { locale = 'en' }: { locale?: Locale } = $props();
  let input = $state<HTMLInputElement>();
  let canvas = $state<HTMLCanvasElement>();
  let bitmap: ImageBitmap | undefined;
  let sourceName = $state('');
  let dimensions = $state<Dimensions>();
  let regions = $state<Region[]>([]);
  let regionX = $state(0);
  let regionY = $state(0);
  let regionWidth = $state(128);
  let regionHeight = $state(128);
  let blurRadius = $state(14);
  let drag = $state<{ startX: number; startY: number; x: number; y: number }>();
  let message = $state('');
  let error = $state<ErrorKind>();
  let notice = $state('');
  let selectionTask = 0;
  const copy = $derived(locale === 'ar' ? ar : en);
  const localizedPath = $derived(locale === 'en' ? '/blur-face' : `/${locale}/blur-face`);
  const canonical = $derived(`${ORIGIN}${localizedPath}`);
  const schema = $derived({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: copy.title,
    description: copy.description,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any',
    inLanguage: locale,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [copy.faqDetectionAnswer, copy.faqPrivacyAnswer, copy.faqInputAnswer],
  });
  const regionLabel = (index: number, region: Region) =>
    copy.region(index + 1, region.x, region.y, region.width, region.height);
  const selectionStyle = $derived.by(() => {
    if (!drag || !dimensions) return '';
    const left = Math.min(drag.startX, drag.x);
    const top = Math.min(drag.startY, drag.y);
    const width = Math.abs(drag.x - drag.startX);
    const height = Math.abs(drag.y - drag.startY);
    return `left:${(left / dimensions.width) * 100}%;top:${(top / dimensions.height) * 100}%;width:${(width / dimensions.width) * 100}%;height:${(height / dimensions.height) * 100}%;`;
  });

  function clearBitmap() {
    bitmap?.close();
    bitmap = undefined;
    dimensions = undefined;
    regions = [];
    sourceName = '';
    drag = undefined;
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  async function inspectPng(file: File): Promise<Dimensions> {
    if (file.size > MAX_FILE_BYTES) throw new Error('too-large');
    const header = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (
      header.length < 24 ||
      !PNG_SIGNATURE.every((byte, index) => header[index] === byte) ||
      String.fromCharCode(...header.slice(12, 16)) !== 'IHDR'
    ) throw new Error('unsupported');

    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (!width || !height || width * height > MAX_PIXELS) throw new Error('too-many-pixels');

    let offset = 8;
    let foundImageData = false;
    for (let count = 0; count < 128 && offset + 8 <= file.size; count += 1) {
      const chunk = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      if (chunk.length !== 8) break;
      const length = new DataView(chunk.buffer, chunk.byteOffset, 4).getUint32(0);
      const type = String.fromCharCode(...chunk.slice(4, 8));
      if (type === 'acTL') throw new Error('animated');
      if (type === 'IDAT') {
        foundImageData = true;
        break;
      }
      if (type === 'IEND' || offset + length + 12 > file.size) break;
      offset += length + 12;
    }
    if (!foundImageData) throw new Error('unsupported');
    return { width, height };
  }

  function redraw() {
    if (!canvas || !bitmap || !dimensions) return;
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context || !('filter' in context)) {
      error = 'canvas';
      return;
    }
    context.drawImage(bitmap, 0, 0);

    const radius = Math.max(2, blurRadius);
    for (const region of regions) {
      const padding = radius * 2;
      const left = Math.max(0, region.x - padding);
      const top = Math.max(0, region.y - padding);
      const right = Math.min(dimensions.width, region.x + region.width + padding);
      const bottom = Math.min(dimensions.height, region.y + region.height + padding);
      const patch = document.createElement('canvas');
      patch.width = right - left;
      patch.height = bottom - top;
      const patchContext = patch.getContext('2d');
      if (!patchContext) {
        error = 'canvas';
        patch.width = 0;
        patch.height = 0;
        return;
      }
      patchContext.filter = `blur(${radius}px)`;
      patchContext.drawImage(bitmap, left, top, patch.width, patch.height, 0, 0, patch.width, patch.height);
      context.save();
      context.beginPath();
      context.rect(region.x, region.y, region.width, region.height);
      context.clip();
      context.drawImage(patch, left, top);
      context.restore();
      patch.width = 0;
      patch.height = 0;
    }
    message = regions.length ? copy.status(regions.length) : '';
  }

  async function chooseFile(event: Event) {
    const picker = event.currentTarget as HTMLInputElement;
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;

    const task = ++selectionTask;
    clearBitmap();
    error = undefined;
    message = '';
    notice = '';
    try {
      const inspected = await inspectPng(file);
      if (task !== selectionTask) return;
      const decoded = await createImageBitmap(file);
      if (task !== selectionTask) {
        decoded.close();
        return;
      }
      if (decoded.width !== inspected.width || decoded.height !== inspected.height) {
        decoded.close();
        throw new Error('decode');
      }
      bitmap = decoded;
      dimensions = inspected;
      sourceName = file.name;
      regionX = 0;
      regionY = 0;
      regionWidth = Math.min(128, inspected.width);
      regionHeight = Math.min(128, inspected.height);
      redraw();
      if (!error) message = copy.loaded(file.name, inspected.width, inspected.height);
    } catch (cause) {
      if (task !== selectionTask) return;
      const kind = cause instanceof Error && cause.message in copy.errors
        ? cause.message as ErrorKind
        : 'decode';
      error = kind;
    }
  }

  function point(event: PointerEvent) {
    if (!canvas || !dimensions) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(dimensions.width, Math.round((event.clientX - bounds.left) * dimensions.width / bounds.width))),
      y: Math.max(0, Math.min(dimensions.height, Math.round((event.clientY - bounds.top) * dimensions.height / bounds.height))),
    };
  }

  function startMark(event: PointerEvent) {
    if (!bitmap || !canvas || event.button !== 0) return;
    const position = point(event);
    canvas.setPointerCapture(event.pointerId);
    drag = { startX: position.x, startY: position.y, x: position.x, y: position.y };
    error = undefined;
    notice = '';
  }

  function moveMark(event: PointerEvent) {
    if (!drag) return;
    const position = point(event);
    drag = { ...drag, ...position };
  }

  function finishMark(event: PointerEvent) {
    if (!drag) return;
    const position = point(event);
    const rectangle = {
      x: Math.min(drag.startX, position.x),
      y: Math.min(drag.startY, position.y),
      width: Math.abs(position.x - drag.startX),
      height: Math.abs(position.y - drag.startY),
    };
    drag = undefined;
    addRegion(rectangle);
  }

  function addRegion(rectangle: Region) {
    if (rectangle.width < 8 || rectangle.height < 8) {
      notice = copy.smallRegion;
      return;
    }
    if (regions.length >= MAX_REGIONS) {
      notice = copy.tooManyRegions;
      return;
    }
    regions = [...regions, rectangle];
    error = undefined;
    redraw();
  }

  function addCoordinateRegion() {
    if (!dimensions) return;
    const x = Math.max(0, Math.min(dimensions.width, Math.round(regionX)));
    const y = Math.max(0, Math.min(dimensions.height, Math.round(regionY)));
    const width = Math.max(0, Math.min(dimensions.width - x, Math.round(regionWidth)));
    const height = Math.max(0, Math.min(dimensions.height - y, Math.round(regionHeight)));
    addRegion({ x, y, width, height });
  }

  function removeRegion(index: number) {
    regions = regions.filter((_, regionIndex) => regionIndex !== index);
    redraw();
  }

  function clearRegions() {
    regions = [];
    notice = '';
    redraw();
  }

  function clearImage() {
    selectionTask += 1;
    clearBitmap();
    error = undefined;
    message = '';
    notice = '';
  }

  async function download() {
    if (!canvas || !regions.length) {
      error = undefined;
      notice = copy.needRegion;
      return;
    }
    notice = '';
    error = undefined;
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas!.toBlob((result) => result ? resolve(result) : reject(new Error('canvas')), 'image/png');
      });
      if (blob.size > MAX_OUTPUT_BYTES) {
        notice = copy.remedies['too-large'];
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const baseName = sourceName.replace(/\.png$/iu, '') || 'image';
      link.href = url;
      link.download = `${baseName}-blurred.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      error = 'canvas';
    }
  }

  onDestroy(() => {
    selectionTask += 1;
    bitmap?.close();
  });
</script>

<svelte:head>
  <title>{copy.title} — ctimg</title>
  <meta name="description" content={copy.description} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${ORIGIN}/blur-face`} />
  <link rel="alternate" hreflang="en-XA" href={`${ORIGIN}/en-XA/blur-face`} />
  <link rel="alternate" hreflang="ar" href={`${ORIGIN}/ar/blur-face`} />
  <link rel="alternate" hreflang="x-default" href={`${ORIGIN}/blur-face`} />
  <svelte:element this={'script'} type="application/ld+json">{JSON.stringify(schema)}</svelte:element>
</svelte:head>

<main class="tool-page t57-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <section class="tool-completion t57-intro" aria-labelledby="t57-heading">
    <p class="eyebrow">{copy.eyebrow}</p>
    <h1 id="t57-heading">{copy.heading}</h1>
    <p>{copy.intro}</p>
    <p class="privacy">{copy.privacy}</p>
    <p class="manual" data-testid="t57-manual-warning">{copy.manual}</p>
  </section>

  <section class="t57-editor" aria-label={copy.heading}>
    <label for="t57-input" class="button choose">{copy.choose}</label>
    <input
      bind:this={input}
      id="t57-input"
      data-testid="t57-input"
      type="file"
      accept="image/png,.png"
      aria-label={copy.inputLabel}
      onchange={chooseFile}
    />
    <p class="limits">{copy.limits}</p>

    {#if dimensions}
      <p class="filename" data-testid="t57-file-info">{copy.loaded(sourceName, dimensions.width, dimensions.height)}</p>
      <p class="draw-help">{copy.drawHelp}</p>
      <div class="t57-canvas-wrap">
        <canvas
          bind:this={canvas}
          data-testid="t57-preview"
          aria-label={copy.heading}
          onpointerdown={startMark}
          onpointermove={moveMark}
          onpointerup={finishMark}
          onpointercancel={() => (drag = undefined)}
        ></canvas>
        {#if drag && selectionStyle}
          <div class="selection" style={selectionStyle} aria-hidden="true"></div>
        {/if}
      </div>
      <label class="blur-control" for="t57-blur">
        <span>{copy.blurStrength}</span>
        <output for="t57-blur">{copy.blurValue(blurRadius)}</output>
      </label>
      <input
        id="t57-blur"
        data-testid="t57-blur-strength"
        type="range"
        min="4"
        max="32"
        step="2"
        value={blurRadius}
        oninput={(event) => {
          blurRadius = Number((event.currentTarget as HTMLInputElement).value);
          redraw();
        }}
      />
      <div class="t57-actions">
        <button type="button" class="button" onclick={clearRegions}>{copy.clearAreas}</button>
        <button type="button" class="button" onclick={clearImage}>{copy.clearImage}</button>
        <button type="button" class="button primary" data-testid="t57-download" onclick={download}>{copy.download}</button>
      </div>
      <section class="region-list" aria-labelledby="t57-regions-heading">
        <h2 id="t57-regions-heading">{copy.regions}</h2>
        {#if regions.length}
          <ol>
            {#each regions as region, index (index)}
              <li>
                <span>{regionLabel(index, region)}</span>
                <button type="button" class="remove-region" aria-label={`${copy.remove}: ${regionLabel(index, region)}`} onclick={() => removeRegion(index)}>{copy.remove}</button>
              </li>
            {/each}
          </ol>
        {:else}
          <p>{copy.noRegions}</p>
        {/if}
      </section>
    {:else}
      <p class="ready" data-testid="t57-ready">{copy.ready}</p>
    {/if}

    <p class="status" role="status" aria-live="polite" data-testid="t57-status">{message}</p>
    {#if notice}<p class="notice" role="status" data-testid="t57-notice">{notice}</p>{/if}
    {#if error}
      <p class="error" role="alert" data-testid="t57-error">{copy.errorPrefix}: {copy.errors[error]} {copy.errorPrefix}: {copy.remedies[error]}</p>
    {/if}
  </section>

  <section class="tool-completion t57-faq" aria-labelledby="t57-faq-heading">
    <h2 id="t57-faq-heading">{copy.faqHeading}</h2>
    <details><summary>{copy.faqDetection}</summary><p>{copy.faqDetectionAnswer}</p></details>
    <details><summary>{copy.faqPrivacy}</summary><p>{copy.faqPrivacyAnswer}</p></details>
    <details><summary>{copy.faqInput}</summary><p>{copy.faqInputAnswer}</p></details>
  </section>
</main>

<style>
  .t57-intro, .t57-editor, .t57-faq { width: min(1080px, calc(100% - 32px)); margin: 0 auto 32px; }
  .eyebrow { font-size: .85rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .privacy { font-weight: 700; }
  .manual { border-inline-start: 4px solid #bd7c16; background: #fff7e6; color: #533500; padding: 12px 16px; border-radius: 6px; }
  .t57-editor { padding: 20px; border: 1px solid #d6dbe3; border-radius: 12px; background: #fff; }
  .button { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 8px 14px; border: 1px solid #46536a; border-radius: 7px; background: #fff; color: #17243a; font: inherit; font-weight: 650; text-decoration: none; cursor: pointer; }
  .button:hover { background: #f1f4f8; }
  .button:focus-visible, input:focus-visible, button:focus-visible, summary:focus-visible { outline: 3px solid #2463eb; outline-offset: 3px; }
  .button.primary { color: #fff; background: #174ea6; border-color: #174ea6; }
  .button.primary:hover { background: #103d86; }
  input[type="file"] { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .limits, .draw-help, .ready, .filename { color: #475467; }
  .filename { font-weight: 650; }
  .t57-canvas-wrap { position: relative; width: min(100%, 760px); margin: 18px auto; overflow: hidden; border: 1px solid #9ba6b7; border-radius: 6px; background: repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 50% / 20px 20px; line-height: 0; touch-action: none; }
  canvas { display: block; width: 100%; height: auto; max-height: 70vh; object-fit: contain; touch-action: none; cursor: crosshair; }
  .selection { position: absolute; border: 2px solid #facc15; background: rgb(250 204 21 / 22%); pointer-events: none; }
  .blur-control { display: flex; justify-content: space-between; max-width: 480px; font-weight: 650; }
  input[type="range"] { display: block; width: min(100%, 480px); margin: 8px 0 18px; accent-color: #174ea6; }
  .t57-actions { display: flex; gap: 10px; flex-wrap: wrap; }
  .region-list { margin-top: 22px; }
  .region-list h2 { font-size: 1.15rem; }
  .region-list ol { padding-inline-start: 24px; }
  .region-list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid #e5e8ed; }
  .remove-region { border: 0; border-radius: 6px; background: transparent; color: #174ea6; text-decoration: underline; cursor: pointer; font: inherit; padding: 7px; }
  .status { min-height: 1.5em; }
  .notice, .error { padding: 10px 12px; border-radius: 6px; }
  .notice { background: #fef6e7; color: #613b00; }
  .error { background: #fff0f0; color: #8c1d18; }
  .t57-faq details { margin: 10px 0; padding: 12px; border: 1px solid #d6dbe3; border-radius: 8px; }
  .t57-faq summary { cursor: pointer; font-weight: 650; }
</style>
