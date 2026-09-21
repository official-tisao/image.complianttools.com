<script lang="ts">
  import { onDestroy } from 'svelte';

  type Locale = 'en' | 'en-XA' | 'ar';
  type Method = 'reinhard' | 'histogram';
  type Side = 'source' | 'reference';
  type Dimensions = { readonly width: number; readonly height: number };
  type SelectedImage = { readonly file: File; readonly url: string; readonly dimensions: Dimensions };
  type ErrorKind =
    | 'unsupported-file'
    | 'file-too-large'
    | 'image-too-large'
    | 'animated-image'
    | 'invalid-png'
    | 'decode-failed'
    | 'canvas-unavailable'
    | 'missing-image'
    | 'processing-failed'
    | 'cancelled';
  type WorkerResult =
    | { readonly type: 'result'; readonly width: number; readonly height: number; readonly data: ArrayBuffer }
    | { readonly type: 'error' };

  const MAX_FILE_BYTES = 16 * 1024 * 1024;
  const MAX_IMAGE_PIXELS = 6_000_000;
  const MAX_TOTAL_PIXELS = 8_000_000;
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
  const ORIGIN = 'https://image.complianttools.com';

  const en = {
    title: 'Colour Match',
    description: 'Adjust a still PNG’s global colour distribution to a reference using Reinhard transfer or per-channel histogram matching. Processing stays in your browser; no model or network service is used.',
    metaDescription: 'Match global colour distributions between still PNG images with local Reinhard or histogram methods. Compare the preview before downloading a PNG.',
    eyebrow: 'Local colour tool',
    privacy: 'Images stay in this browser. No model, upload, or network service is used.',
    source: 'Source image (still PNG)',
    reference: 'Reference image (still PNG)',
    chooseSource: 'Choose source PNG',
    chooseReference: 'Choose reference PNG',
    inputHelp: 'PNG only, up to 16 MiB and 6 megapixels per image. Animated PNG is not supported.',
    method: 'Colour transfer method',
    reinhard: 'Reinhard statistical transfer',
    reinhardHelp: 'Aligns approximate luminance and opponent-channel means and deviations.',
    histogram: 'Per-channel histogram matching',
    histogramHelp: 'Maps each source RGB channel to the reference channel distribution.',
    apply: 'Match colours',
    cancel: 'Cancel',
    busy: 'Matching colour distributions locally…',
    ready: 'Choose a source and a reference image to begin.',
    sourceSelected: 'Source selected',
    referenceSelected: 'Reference selected',
    before: 'Before',
    after: 'After',
    referencePreview: 'Reference preview',
    download: 'Download matched PNG',
    done: 'Preview ready. Inspect the result before downloading.',
    dimensions: 'Output dimensions',
    faqHeading: 'Questions about this tool',
    faqInput: 'Which images can I use?',
    faqInputAnswer: 'Choose two still PNG files, each smaller than 16 MiB and no larger than 6 megapixels. Animated PNG files are rejected.',
    faqMethod: 'What does matching change?',
    faqMethodAnswer: 'It changes RGB values to bring global colour statistics closer to the reference. It does not move pixels or establish that the result looks natural for every pair.',
    faqPrivacy: 'Are my images uploaded?',
    faqPrivacyAnswer: 'No. Decoding, colour processing, preview, and PNG export run locally in your browser. This tool does not load a model or call a network service.',
    related: 'Related tools',
    convert: 'Convert images',
    errorPrefix: 'Try this',
    errors: {
      'unsupported-file': 'Choose a valid PNG image.',
      'file-too-large': 'The PNG exceeds the 16 MiB file limit.',
      'image-too-large': 'The source and reference must each be at most 6 megapixels and 8 megapixels combined.',
      'animated-image': 'Animated PNG is not supported.',
      'invalid-png': 'The PNG structure is incomplete or invalid.',
      'decode-failed': 'The browser could not decode this PNG.',
      'canvas-unavailable': 'The browser could not create a local image canvas.',
      'missing-image': 'Choose both the source and reference images.',
      'processing-failed': 'Local colour matching could not finish this image pair.',
      cancelled: 'Colour matching was cancelled.',
    } satisfies Record<ErrorKind, string>,
    remedies: {
      'unsupported-file': 'Export the image as a still PNG and choose it again.',
      'file-too-large': 'Choose a PNG smaller than 16 MiB.',
      'image-too-large': 'Choose smaller images and keep the combined dimensions within the stated limit.',
      'animated-image': 'Export one still frame as a regular PNG.',
      'invalid-png': 'Export a valid PNG and choose it again.',
      'decode-failed': 'Export a valid, non-animated PNG and try again.',
      'canvas-unavailable': 'Try a browser with local 2D canvas support.',
      'missing-image': 'Choose one source PNG and one reference PNG.',
      'processing-failed': 'Try smaller images. Your original files are unchanged.',
      cancelled: 'Choose both images and start matching again when ready.',
    } satisfies Record<ErrorKind, string>,
  } as const;

  const ar = {
    title: 'مطابقة الألوان',
    description: 'اضبط التوزيع العام للألوان في صورة PNG ثابتة ليتقارب مع صورة مرجعية باستخدام طريقة رينهارد أو مطابقة المدرج التكراري لكل قناة. تتم المعالجة في المتصفح دون نموذج أو خدمة شبكة.',
    metaDescription: 'طابق التوزيعات العامة للألوان بين صور PNG ثابتة محليًا. افحص المعاينة قبل تنزيل صورة PNG.',
    eyebrow: 'أداة ألوان محلية',
    privacy: 'تبقى الصور في هذا المتصفح. لا يُستخدم نموذج أو رفع أو خدمة شبكة.',
    source: 'الصورة المصدر (PNG ثابتة)',
    reference: 'الصورة المرجعية (PNG ثابتة)',
    chooseSource: 'اختر صورة PNG مصدر',
    chooseReference: 'اختر صورة PNG مرجعية',
    inputHelp: 'PNG فقط، حتى 16 ميبيبايت و6 ميغابكسل لكل صورة. لا يدعم PNG المتحرك.',
    method: 'طريقة نقل الألوان',
    reinhard: 'نقل رينهارد الإحصائي',
    reinhardHelp: 'يوائم متوسطات وانحرافات تقريبية للإضاءة وقنوات الألوان المتقابلة.',
    histogram: 'مطابقة المدرج التكراري لكل قناة',
    histogramHelp: 'يوائم توزيع كل قناة RGB في المصدر مع القناة المقابلة في المرجع.',
    apply: 'طابق الألوان',
    cancel: 'إلغاء',
    busy: 'جارٍ مطابقة توزيعات الألوان محليًا…',
    ready: 'اختر صورة مصدر وصورة مرجعية للبدء.',
    sourceSelected: 'تم اختيار المصدر',
    referenceSelected: 'تم اختيار المرجع',
    before: 'قبل',
    after: 'بعد',
    referencePreview: 'معاينة الصورة المرجعية',
    download: 'تنزيل PNG المطابقة',
    done: 'المعاينة جاهزة. افحص النتيجة قبل التنزيل.',
    dimensions: 'أبعاد الإخراج',
    faqHeading: 'أسئلة حول هذه الأداة',
    faqInput: 'ما الصور التي يمكنني استخدامها؟',
    faqInputAnswer: 'اختر ملفي PNG ثابتين، حجم كل منهما أقل من 16 ميبيبايت ولا يتجاوز 6 ميغابكسل. تُرفض صور PNG المتحركة.',
    faqMethod: 'ما الذي تغيّره المطابقة؟',
    faqMethodAnswer: 'تغيّر قيم RGB لتقريب الإحصاءات العامة للألوان من الصورة المرجعية. لا تنقل وحدات البكسل ولا تثبت أن النتيجة تبدو طبيعية لكل زوج من الصور.',
    faqPrivacy: 'هل يتم رفع صوري؟',
    faqPrivacyAnswer: 'لا. يجري فك الترميز ومعالجة الألوان والمعاينة والتصدير محليًا في المتصفح. لا تحمّل الأداة نموذجًا ولا تتصل بخدمة شبكة.',
    related: 'أدوات ذات صلة',
    convert: 'تحويل الصور',
    errorPrefix: 'جرّب هذا',
    errors: {
      'unsupported-file': 'اختر صورة PNG صالحة.',
      'file-too-large': 'يتجاوز ملف PNG حد الحجم البالغ 16 ميبيبايت.',
      'image-too-large': 'يجب ألا تتجاوز كل صورة 6 ميغابكسل وألا يتجاوز المجموع 8 ميغابكسل.',
      'animated-image': 'لا يدعم PNG المتحرك.',
      'invalid-png': 'بنية PNG غير مكتملة أو غير صالحة.',
      'decode-failed': 'تعذر على المتصفح فك ترميز صورة PNG.',
      'canvas-unavailable': 'تعذر على المتصفح إنشاء لوحة صور محلية.',
      'missing-image': 'اختر صورة مصدر وصورة مرجعية.',
      'processing-failed': 'تعذرت مطابقة الألوان محليًا لهذا الزوج من الصور.',
      cancelled: 'تم إلغاء مطابقة الألوان.',
    } satisfies Record<ErrorKind, string>,
    remedies: {
      'unsupported-file': 'صدّر الصورة بصيغة PNG ثابتة ثم اخترها مجددًا.',
      'file-too-large': 'اختر صورة PNG أصغر من 16 ميبيبايت.',
      'image-too-large': 'اختر صورًا أصغر والتزم بحد الأبعاد الإجمالي المذكور.',
      'animated-image': 'صدّر إطارًا ثابتًا واحدًا بصيغة PNG عادية.',
      'invalid-png': 'صدّر صورة PNG صالحة ثم اخترها مجددًا.',
      'decode-failed': 'صدّر PNG صالحة غير متحركة ثم أعد المحاولة.',
      'canvas-unavailable': 'جرّب متصفحًا يدعم لوحة 2D محلية.',
      'missing-image': 'اختر صورة PNG مصدر وأخرى مرجعية.',
      'processing-failed': 'جرّب صورًا أصغر. تبقى الملفات الأصلية دون تغيير.',
      cancelled: 'اختر الصورتين وابدأ المطابقة مجددًا عند الاستعداد.',
    } satisfies Record<ErrorKind, string>,
  } as const;

  let { locale = 'en' }: { locale?: Locale } = $props();
  let source = $state<SelectedImage>();
  let reference = $state<SelectedImage>();
  let method = $state<Method>('reinhard');
  let outputUrl = $state('');
  let outputBytes = $state(0);
  let busy = $state(false);
  let status = $state('');
  let error = $state<ErrorKind>();
  let activeWorker: Worker | undefined;
  let rejectWorker: ((reason: ErrorKind) => void) | undefined;
  let runNumber = 0;
  const selectionNumber: Record<Side, number> = { source: 0, reference: 0 };

  const pseudo = (value: string) =>
    `⟦${value.replace(/[aeiou]/giu, (vowel) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[vowel.toLowerCase()] ?? vowel)}⟧`;
  const t = (key: keyof typeof en) => {
    const value = locale === 'ar' ? ar[key] : en[key];
    return typeof value === 'string' ? (locale === 'en-XA' ? pseudo(value) : value) : '';
  };
  const localizedPath = $derived(locale === 'en' ? '/color-match' : `/${locale}/color-match`);
  const title = $derived(t('title'));
  const description = $derived(t('metaDescription'));
  const faq = $derived([
    { question: t('faqInput'), answer: t('faqInputAnswer') },
    { question: t('faqMethod'), answer: t('faqMethodAnswer') },
    { question: t('faqPrivacy'), answer: t('faqPrivacyAnswer') },
  ]);

  function errorText(kind: ErrorKind): string {
    const selected = locale === 'ar' ? ar : en;
    const main = selected.errors[kind];
    const remedy = selected.remedies[kind];
    return `${locale === 'en-XA' ? pseudo(main) : main} ${t('errorPrefix')}: ${locale === 'en-XA' ? pseudo(remedy) : remedy}`;
  }

  function clearOutput() {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = '';
    outputBytes = 0;
  }

  function cancelWorker() {
    runNumber += 1;
    const reject = rejectWorker;
    const worker = activeWorker;
    activeWorker = undefined;
    rejectWorker = undefined;
    worker?.terminate();
    reject?.('cancelled');
    busy = false;
  }

  function clearSelection(side: Side) {
    const current = side === 'source' ? source : reference;
    if (current) URL.revokeObjectURL(current.url);
    if (side === 'source') source = undefined;
    else reference = undefined;
    clearOutput();
    status = '';
  }

  async function inspectPng(file: File): Promise<Dimensions> {
    if (file.size > MAX_FILE_BYTES) throw new Error('file-too-large');
    const header = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (
      header.length < 24 ||
      !PNG_SIGNATURE.every((byte, index) => header[index] === byte) ||
      String.fromCharCode(...header.slice(12, 16)) !== 'IHDR'
    ) throw new Error('unsupported-file');

    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (!width || !height || width * height > MAX_IMAGE_PIXELS) throw new Error('image-too-large');

    let offset = 8;
    let foundImageData = false;
    for (let count = 0; count < 128 && offset + 8 <= file.size; count += 1) {
      const chunk = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      if (chunk.length !== 8) break;
      const length = new DataView(chunk.buffer, chunk.byteOffset, 4).getUint32(0);
      const type = String.fromCharCode(...chunk.slice(4, 8));
      if (type === 'acTL') throw new Error('animated-image');
      if (type === 'IDAT') {
        foundImageData = true;
        break;
      }
      if (type === 'IEND' || offset + length + 12 > file.size) break;
      offset += length + 12;
    }
    if (!foundImageData) throw new Error('invalid-png');
    return { width, height };
  }

  function typedKind(cause: unknown): ErrorKind | undefined {
    if (cause instanceof Error && cause.message in en.errors) return cause.message as ErrorKind;
    return undefined;
  }

  async function choose(side: Side, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    cancelWorker();
    const task = ++selectionNumber[side];
    clearSelection(side);
    error = undefined;
    try {
      const dimensions = await inspectPng(file);
      if (task !== selectionNumber[side]) return;
      const selected = { file, dimensions, url: URL.createObjectURL(file) };
      if (side === 'source') source = selected;
      else reference = selected;
      status = t(side === 'source' ? 'sourceSelected' : 'referenceSelected');
    } catch (cause) {
      if (task !== selectionNumber[side]) return;
      error = typedKind(cause) ?? 'unsupported-file';
    }
  }

  async function decode(file: File): Promise<{ readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }> {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
        throw new Error('image-too-large');
      }
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('canvas-unavailable');
      context.drawImage(bitmap, 0, 0);
      return {
        width: bitmap.width,
        height: bitmap.height,
        data: new Uint8ClampedArray(context.getImageData(0, 0, bitmap.width, bitmap.height).data),
      };
    } catch (cause) {
      const known = typedKind(cause);
      if (known) throw cause;
      throw new Error('decode-failed');
    } finally {
      bitmap?.close();
    }
  }

  function runWorker(
    sourcePixels: Awaited<ReturnType<typeof decode>>,
    referencePixels: Awaited<ReturnType<typeof decode>>,
    selectedMethod: Method,
  ): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('../workers/t80-color-match-worker.ts', import.meta.url), { type: 'module' });
      } catch {
        reject('processing-failed' satisfies ErrorKind);
        return;
      }
      activeWorker = worker;
      const finish = () => {
        worker.terminate();
        if (activeWorker === worker) activeWorker = undefined;
        if (rejectWorker === cancel) rejectWorker = undefined;
      };
      const cancel = (reason: ErrorKind) => {
        finish();
        reject(reason);
      };
      rejectWorker = cancel;
      worker.onmessage = (event: MessageEvent<WorkerResult>) => {
        finish();
        if (event.data.type === 'result') resolve(event.data);
        else reject('processing-failed' satisfies ErrorKind);
      };
      worker.onerror = () => {
        finish();
        reject('processing-failed' satisfies ErrorKind);
      };
      try {
        const sourceBuffer = sourcePixels.data.buffer as ArrayBuffer;
        const referenceBuffer = referencePixels.data.buffer as ArrayBuffer;
        worker.postMessage(
          {
            method: selectedMethod,
            source: { width: sourcePixels.width, height: sourcePixels.height, data: sourceBuffer },
            reference: { width: referencePixels.width, height: referencePixels.height, data: referenceBuffer },
          },
          [sourceBuffer, referenceBuffer],
        );
      } catch {
        finish();
        reject('processing-failed' satisfies ErrorKind);
      }
    });
  }

  async function pngBlob(width: number, height: number, data: Uint8ClampedArray): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas-unavailable');
    const imageData = context.createImageData(width, height);
    imageData.data.set(data);
    context.putImageData(imageData, 0, 0);
    try {
      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('processing-failed')), 'image/png');
      });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  async function matchColours() {
    if (!source || !reference) {
      error = 'missing-image';
      return;
    }
    if (source.dimensions.width * source.dimensions.height + reference.dimensions.width * reference.dimensions.height > MAX_TOTAL_PIXELS) {
      error = 'image-too-large';
      return;
    }
    cancelWorker();
    const task = ++runNumber;
    const sourceFile = source.file;
    const referenceFile = reference.file;
    const selectedMethod = method;
    clearOutput();
    error = undefined;
    status = '';
    busy = true;
    try {
      const [sourcePixels, referencePixels] = await Promise.all([decode(sourceFile), decode(referenceFile)]);
      if (task !== runNumber) return;
      const result = await runWorker(sourcePixels, referencePixels, selectedMethod);
      if (task !== runNumber || result.type !== 'result') return;
      const blob = await pngBlob(result.width, result.height, new Uint8ClampedArray(result.data));
      if (task !== runNumber) return;
      outputUrl = URL.createObjectURL(blob);
      outputBytes = blob.size;
      status = t('done');
    } catch (cause) {
      if (task !== runNumber) return;
      error = typeof cause === 'string' && cause in en.errors ? cause as ErrorKind : typedKind(cause) ?? 'processing-failed';
    } finally {
      if (task === runNumber) busy = false;
    }
  }

  function cancelMatching() {
    cancelWorker();
    clearOutput();
    error = 'cancelled';
  }

  function setMethod(next: Method) {
    method = next;
    clearOutput();
    error = undefined;
    status = '';
  }

  /* eslint-disable no-control-regex -- Reject ASCII control bytes in exported filenames. */
  function downloadName(file: File): string {
    const stem = file.name.replace(/\.[^.]+$/u, '').replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '_').slice(0, 100) || 'image';
    return `${stem}-color-matched.png`;
  }

  const canonical = $derived(`${ORIGIN}${localizedPath}`);
  const schema = $derived({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'SoftwareApplication', name: title, applicationCategory: 'MultimediaApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' } },
      { '@type': 'FAQPage', mainEntity: faq.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: t('convert'), item: `${ORIGIN}/convert` }, { '@type': 'ListItem', position: 2, name: title, item: canonical }] },
    ],
  });

  onDestroy(() => {
    cancelWorker();
    if (source) URL.revokeObjectURL(source.url);
    if (reference) URL.revokeObjectURL(reference.url);
    clearOutput();
  });
</script>

<svelte:head>
  <title>{title} — Image Compliant Tools</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${ORIGIN}/color-match`} />
  <link rel="alternate" hreflang="en-XA" href={`${ORIGIN}/en-XA/color-match`} />
  <link rel="alternate" hreflang="ar" href={`${ORIGIN}/ar/color-match`} />
  <link rel="alternate" hreflang="x-default" href={`${ORIGIN}/color-match`} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={`${ORIGIN}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={`${ORIGIN}/og/tools.svg`} />
  <svelte:element this={'script'} type="application/ld+json">{JSON.stringify(schema)}</svelte:element>
</svelte:head>

<main class="tool-page t80-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <header class="tool-intro">
    <p class="eyebrow">{t('eyebrow')}</p>
    <h1>{title}</h1>
    <p>{t('description')}</p>
    <p class="privacy-copy">{t('privacy')}</p>
  </header>

  <section class="t80-controls" aria-labelledby="t80-input-heading">
    <h2 id="t80-input-heading">{locale === 'ar' ? 'اختر الصورتين' : locale === 'en-XA' ? pseudo('Choose both images') : 'Choose both images'}</h2>
    <div class="t80-file-grid">
      <label class="t80-file-card">
        <span>{t('source')}</span>
        <input data-testid="t80-source-input" type="file" accept="image/png,.png" aria-label={t('chooseSource')} onchange={(event) => choose('source', event)} />
        {#if source}
          <span class="t80-selected">{source.file.name} · {source.dimensions.width} × {source.dimensions.height}</span>
        {/if}
      </label>
      <label class="t80-file-card">
        <span>{t('reference')}</span>
        <input data-testid="t80-reference-input" type="file" accept="image/png,.png" aria-label={t('chooseReference')} onchange={(event) => choose('reference', event)} />
        {#if reference}
          <span class="t80-selected">{reference.file.name} · {reference.dimensions.width} × {reference.dimensions.height}</span>
          <img class="t80-reference-thumb" src={reference.url} alt={t('referencePreview')} />
        {/if}
      </label>
    </div>
    <p class="t80-help">{t('inputHelp')}</p>

    <fieldset class="t80-methods">
      <legend>{t('method')}</legend>
      <label>
        <input type="radio" name="t80-method" value="reinhard" checked={method === 'reinhard'} onchange={() => setMethod('reinhard')} />
        <span><strong>{t('reinhard')}</strong><small>{t('reinhardHelp')}</small></span>
      </label>
      <label>
        <input type="radio" name="t80-method" value="histogram" checked={method === 'histogram'} onchange={() => setMethod('histogram')} />
        <span><strong>{t('histogram')}</strong><small>{t('histogramHelp')}</small></span>
      </label>
    </fieldset>

    <div class="t80-actions">
      <button class="button primary" data-testid="t80-run" type="button" disabled={busy || !source || !reference} onclick={matchColours}>{t('apply')}</button>
      {#if busy}<button class="button" data-testid="t80-cancel" type="button" onclick={cancelMatching}>{t('cancel')}</button>{/if}
    </div>
    {#if busy}<p role="status" aria-live="polite">{t('busy')}</p>
    {:else if status}<p role="status" aria-live="polite">{status}</p>
    {:else}<p role="status" aria-live="polite">{t('ready')}</p>{/if}
    {#if error}<p class="error" role="alert" data-error-kind={error}>{errorText(error)}</p>{/if}
  </section>

  {#if source && outputUrl}
    <section class="t80-result" aria-labelledby="t80-result-heading">
      <h2 id="t80-result-heading">{t('done')}</h2>
      <div class="t80-preview-grid">
        <figure>
          <figcaption>{t('before')}</figcaption>
          <img data-testid="t80-before" src={source.url} alt={t('before')} />
        </figure>
        <figure>
          <figcaption>{t('after')}</figcaption>
          <img data-testid="t80-after" src={outputUrl} alt={t('after')} />
        </figure>
      </div>
      <p>{t('dimensions')}: {source.dimensions.width} × {source.dimensions.height} · {Math.ceil(outputBytes / 1024)} KiB PNG</p>
      <a class="button primary t80-download" data-testid="t80-download" href={outputUrl} download={downloadName(source.file)}>{t('download')}</a>
    </section>
  {/if}

  <section class="tool-completion t80-faq" aria-labelledby="t80-faq-heading">
    <h2 id="t80-faq-heading">{t('faqHeading')}</h2>
    {#each faq as item (item.question)}
      <details><summary>{item.question}</summary><p>{item.answer}</p></details>
    {/each}
    <nav aria-label={t('related')}><a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('convert')}</a></nav>
  </section>
</main>

<style>
  .t80-controls, .t80-result, .t80-faq { width: min(1080px, calc(100% - 32px)); margin: 0 auto 40px; }
  .t80-controls { padding: 24px; border: 1px solid #1c1a171a; border-radius: 12px; background: white; }
  .t80-controls h2, .t80-result h2 { margin-block-start: 0; }
  .t80-file-grid, .t80-preview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .t80-file-card { display: grid; gap: 12px; min-width: 0; padding: 16px; border: 1px solid #1c1a1720; border-radius: 8px; }
  .t80-file-card > span:first-child, .t80-methods legend { font-weight: 600; }
  .t80-file-card input { max-width: 100%; }
  .t80-selected, .t80-help, .t80-methods small { color: #5c5a56; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
  .t80-reference-thumb { max-width: 160px; max-height: 100px; object-fit: contain; justify-self: start; background: #eee; }
  .t80-methods { display: grid; gap: 12px; margin: 24px 0; padding: 16px; border: 1px solid #1c1a1720; border-radius: 8px; }
  .t80-methods label { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
  .t80-methods label span { display: grid; gap: 4px; }
  .t80-actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .t80-result { padding: 24px; border: 1px solid #1c1a171a; border-radius: 12px; background: #fff; }
  .t80-preview-grid figure { min-width: 0; margin: 0; padding: 12px; border: 1px solid #1c1a171a; border-radius: 8px; background: #f5f3f0; }
  .t80-preview-grid figcaption { margin-block-end: 8px; font-weight: 600; }
  .t80-preview-grid img { display: block; width: 100%; height: min(420px, 55vw); object-fit: contain; background-color: #eee; }
  .t80-download { display: inline-block; margin-block-start: 8px; }
  @media (max-width: 700px) { .t80-file-grid, .t80-preview-grid { grid-template-columns: 1fr; } .t80-controls, .t80-result { padding: 16px; } }
</style>
