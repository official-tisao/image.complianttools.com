<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    applyDenoise,
    compositeLayers,
    createRaster,
    removeObject,
    type RasterImage,
  } from '@complianttools/image-engine';

  type Locale = 'en' | 'en-XA' | 'ar';
  type Kind = 'denoise' | 'editor' | 'remove-object';
  type DenoiseMethod = 'median' | 'bilateral';
  type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'difference';

  const TITLES: Record<Kind, { readonly en: string; readonly ar: string }> = {
    denoise: { en: 'Denoise', ar: 'إزالة الضوضاء' },
    editor: { en: 'Layered Editor', ar: 'محرر الطبقات' },
    'remove-object': { en: 'Remove Object', ar: 'إزالة كائن' },
  };
  const EN = {
    description: 'Process image pixels locally with a deterministic, reviewable workflow.',
    meta: 'Denoise an image, edit two local layers, or remove a marked object without an upload.',
    choose: 'Choose a source image',
    layer: 'Choose a layer image',
    help: 'PNG, JPEG, or WebP up to 16 MiB and 6 megapixels.',
    method: 'Denoise method',
    median: 'Median · salt-and-pepper noise',
    bilateral: 'Bilateral · edge-preserving smoothing',
    strength: 'Strength',
    blend: 'Blend mode',
    opacity: 'Layer opacity',
    draw: 'Paint the mask on the source preview. Marked pixels are shown in red.',
    clear: 'Clear mask',
    run: 'Process locally',
    processing: 'Processing locally…',
    ready: 'Choose an image to begin.',
    download: 'Download PNG',
    preview: 'Processed image preview',
    privacy: 'Images stay in this browser. No upload, model, or network service is used.',
    faq1: 'What does this route support?',
    faq1Answer:
      'Denoise uses median or bilateral filtering, the editor composites two local layers, and Remove Object inpaints a manually marked mask.',
    faq2: 'Does Remove Object use an AI model?',
    faq2Answer:
      'No. It uses the selected local inpainting method. Automatic object detection remains outside this route.',
    faq3: 'Can I inspect before downloading?',
    faq3Answer:
      'Yes. Every operation produces a local PNG preview and leaves the selected source files unchanged.',
  } as const;
  const AR = {
    ...EN,
    description: 'عالج بكسلات الصورة محليًا بطريقة حتمية قابلة للمراجعة.',
    meta: 'أزل الضوضاء أو حرر طبقتين محليًا أو أزل كائنًا محددًا دون رفع الصورة.',
    choose: 'اختر صورة المصدر',
    layer: 'اختر صورة طبقة',
    help: 'PNG أو JPEG أو WebP حتى 16 ميبيبايت و6 ميغابكسلات.',
    method: 'طريقة إزالة الضوضاء',
    median: 'الوسيط · ضوضاء الملح والفلفل',
    bilateral: 'ثنائي الجانب · تنعيم يحافظ على الحواف',
    strength: 'القوة',
    blend: 'وضع المزج',
    opacity: 'شفافية الطبقة',
    draw: 'ارسم القناع على معاينة المصدر. تظهر البكسلات المحددة باللون الأحمر.',
    clear: 'مسح القناع',
    run: 'معالجة محلية',
    processing: 'جارٍ التنفيذ محليًا…',
    ready: 'اختر صورة للبدء.',
    download: 'تنزيل PNG',
    preview: 'معاينة الصورة المعالجة',
    privacy: 'تبقى الصور في هذا المتصفح. لا يتم رفعها ولا تُستخدم نماذج أو خدمات شبكة.',
    faq1: 'ماذا يدعم هذا المسار؟',
    faq1Answer:
      'تستخدم إزالة الضوضاء مرشح الوسيط أو ثنائي الجانب، ويجمع المحرر طبقتين محليتين، وتملأ إزالة الكائن قناعًا محددًا يدويًا.',
    faq2: 'هل تستخدم إزالة الكائن نموذج ذكاء اصطناعي؟',
    faq2Answer:
      'لا. تستخدم طريقة الملء المحلية المحددة. يظل اكتشاف الكائن تلقائيًا خارج هذا المسار.',
    faq3: 'هل يمكنني الفحص قبل التنزيل؟',
    faq3Answer: 'نعم. تنتج كل عملية معاينة PNG محلية ولا تغير ملفات المصدر المختارة.',
  } as const;

  const pseudo = (value: string) =>
    `⟦${value.replace(/[aeiou]/giu, (vowel) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[vowel.toLowerCase()] ?? vowel)}⟧`;

  let { kind, locale = 'en' }: { kind: Kind; locale?: Locale } = $props();
  let sourceFile = $state<File>();
  let layerFile = $state<File>();
  let sourceUrl = $state('');
  let outputUrl = $state('');
  let status = $state('');
  let error = $state('');
  let busy = $state(false);
  let method = $state<DenoiseMethod>('median');
  let strength = $state(50);
  let blendMode = $state<BlendMode>('normal');
  let opacity = $state(1);
  let previewCanvas = $state<HTMLCanvasElement>();
  let sourceWidth = $state(0);
  let sourceHeight = $state(0);
  let sourcePixels = $state<Uint8ClampedArray>();
  let mask = $state<Uint8ClampedArray>();
  let drawing = $state(false);
  let brushSize = $state(24);

  const title = $derived(locale === 'ar' ? TITLES[kind].ar : TITLES[kind].en);
  const localized = (value: string) => (locale === 'en-XA' ? pseudo(value) : value);
  const copy = $derived(locale === 'ar' ? AR : EN);
  const path = $derived(`/${kind}`);
  const canonical = $derived(
    `https://image.complianttools.com${locale === 'en' ? path : `/${locale}${path}`}`,
  );
  const faq = $derived([
    { question: localized(copy.faq1), answer: localized(copy.faq1Answer) },
    { question: localized(copy.faq2), answer: localized(copy.faq2Answer) },
    { question: localized(copy.faq3), answer: localized(copy.faq3Answer) },
  ]);

  function clearOutput() {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = '';
  }

  function selectFile(event: Event, target: 'source' | 'layer') {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      error = 'Choose an image file.';
      return;
    }
    if (target === 'source') {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      sourceFile = file;
      sourceUrl = URL.createObjectURL(file);
    } else layerFile = file;
    clearOutput();
    error = '';
    status = file.name;
    if (target === 'source') void prepareSource(file);
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

  async function prepareSource(file: File) {
    try {
      const image = await decode(file);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas is unavailable');
      context.drawImage(image, 0, 0);
      sourceWidth = canvas.width;
      sourceHeight = canvas.height;
      sourcePixels = new Uint8ClampedArray(
        context.getImageData(0, 0, canvas.width, canvas.height).data,
      );
      mask = new Uint8ClampedArray(canvas.width * canvas.height);
      redrawSource();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not decode the image.';
    }
  }

  function redrawSource() {
    if (!previewCanvas || !sourcePixels || !sourceWidth || !sourceHeight) return;
    previewCanvas.width = sourceWidth;
    previewCanvas.height = sourceHeight;
    const context = previewCanvas.getContext('2d');
    if (!context) return;
    context.putImageData(
      new ImageData(new Uint8ClampedArray(sourcePixels), sourceWidth, sourceHeight),
      0,
      0,
    );
    if (!mask) return;
    const overlay = context.getImageData(0, 0, sourceWidth, sourceHeight);
    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index]) continue;
      const offset = index * 4;
      overlay.data[offset] = Math.min(255, overlay.data[offset]! + 120);
      overlay.data[offset + 1] = Math.round(overlay.data[offset + 1]! * 0.45);
      overlay.data[offset + 2] = Math.round(overlay.data[offset + 2]! * 0.45);
    }
    context.putImageData(overlay, 0, 0);
  }

  $effect(() => {
    if (previewCanvas && sourcePixels) redrawSource();
  });

  function paint(event: PointerEvent) {
    if (kind !== 'remove-object' || !previewCanvas || !mask) return;
    const bounds = previewCanvas.getBoundingClientRect();
    const x = Math.round(((event.clientX - bounds.left) / bounds.width) * sourceWidth);
    const y = Math.round(((event.clientY - bounds.top) / bounds.height) * sourceHeight);
    const radius = Math.max(1, Math.round((brushSize / bounds.width) * sourceWidth));
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && py >= 0 && px < sourceWidth && py < sourceHeight)
          mask[py * sourceWidth + px] = 255;
      }
    }
    redrawSource();
  }

  function startPaint(event: PointerEvent) {
    drawing = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    paint(event);
  }

  function movePaint(event: PointerEvent) {
    if (drawing) paint(event);
  }

  function stopPaint() {
    drawing = false;
  }

  function clearMask() {
    if (!mask) return;
    mask.fill(0);
    redrawSource();
  }

  function toRaster(canvas: HTMLCanvasElement): RasterImage {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas is unavailable');
    return createRaster(
      canvas.width,
      canvas.height,
      new Uint8ClampedArray(context.getImageData(0, 0, canvas.width, canvas.height).data),
    );
  }

  async function process() {
    if (!sourceFile || busy) return;
    busy = true;
    error = '';
    clearOutput();
    try {
      if (!sourcePixels || !sourceWidth || !sourceHeight) await prepareSource(sourceFile);
      if (!sourcePixels || !sourceWidth || !sourceHeight) throw new Error('Canvas is unavailable');
      let raster = createRaster(sourceWidth, sourceHeight, new Uint8ClampedArray(sourcePixels));
      if (kind === 'denoise') {
        raster = applyDenoise(raster, method, strength);
      } else if (kind === 'remove-object') {
        if (!mask?.some((value) => value > 0)) throw new Error('Paint an object mask first.');
        raster = removeObject(raster, { mask, algorithm: 'telea' });
      } else if (layerFile) {
        const layer = await decode(layerFile);
        const layerCanvas = document.createElement('canvas');
        layerCanvas.width = raster.width;
        layerCanvas.height = raster.height;
        layerCanvas.getContext('2d')!.drawImage(layer, 0, 0, raster.width, raster.height);
        raster = compositeLayers(raster, [{ image: toRaster(layerCanvas), blendMode, opacity }]);
      }
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = raster.width;
      outputCanvas.height = raster.height;
      outputCanvas
        .getContext('2d')!
        .putImageData(
          new ImageData(new Uint8ClampedArray(raster.frames[0]!.data), raster.width, raster.height),
          0,
          0,
        );
      const blob = await new Promise<Blob>((resolve, reject) =>
        outputCanvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('PNG export failed'))),
          'image/png',
        ),
      );
      outputUrl = URL.createObjectURL(blob);
      status = localized(copy.download);
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
  <title>{localized(title)} — Image Compliant Tools</title>
  <meta name="description" content={localized(copy.meta)} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`https://image.complianttools.com${path}`} />
  <link rel="alternate" hreflang="en-XA" href={`https://image.complianttools.com/en-XA${path}`} />
  <link rel="alternate" hreflang="ar" href={`https://image.complianttools.com/ar${path}`} />
  <link rel="alternate" hreflang="x-default" href={`https://image.complianttools.com${path}`} />
</svelte:head>

<main class="local-intel" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <header class="tool-intro">
    <p class="eyebrow">{localized('Local image tool')}</p>
    <h1>{localized(title)}</h1>
    <p>{localized(copy.description)}</p>
    <p class="privacy">{localized(copy.privacy)}</p>
  </header>
  <section class="controls" aria-label={localized('Image controls')}>
    <label
      ><span>{localized(copy.choose)}</span><input
        data-testid="p44-source"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onchange={(event) => selectFile(event, 'source')}
      /></label
    >
    <p class="help">{localized(copy.help)}</p>
    {#if kind === 'denoise'}
      <label
        ><span>{localized(copy.method)}</span><select data-testid="p44-method" bind:value={method}
          ><option value="median">{localized(copy.median)}</option><option value="bilateral"
            >{localized(copy.bilateral)}</option
          ></select
        ></label
      >
      <label
        ><span>{localized(copy.strength)}: {strength}</span><input
          data-testid="p44-strength"
          type="range"
          min="1"
          max="100"
          bind:value={strength}
        /></label
      >
    {:else if kind === 'editor'}
      <label
        ><span>{localized(copy.layer)}</span><input
          data-testid="p48-layer"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onchange={(event) => selectFile(event, 'layer')}
        /></label
      >
      <label
        ><span>{localized(copy.blend)}</span><select data-testid="p48-blend" bind:value={blendMode}
          ><option value="normal">normal</option><option value="multiply">multiply</option><option
            value="screen">screen</option
          ><option value="overlay">overlay</option><option value="soft-light">soft-light</option
          ><option value="difference">difference</option></select
        ></label
      >
      <label
        ><span>{localized(copy.opacity)}: {Math.round(opacity * 100)}%</span><input
          data-testid="p48-opacity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          bind:value={opacity}
        /></label
      >
    {:else}
      <p class="help">{localized(copy.draw)}</p>
      <label
        ><span>{localized(copy.strength)}: {brushSize}</span><input
          data-testid="p66-brush"
          type="range"
          min="4"
          max="96"
          bind:value={brushSize}
        /></label
      ><button class="button" data-testid="p66-clear" type="button" onclick={clearMask}
        >{localized(copy.clear)}</button
      >
    {/if}
    <button
      data-testid="local-tool-run"
      class="button primary"
      type="button"
      disabled={busy || !sourceFile}
      onclick={process}>{busy ? localized(copy.processing) : localized(copy.run)}</button
    >
    {#if status}<p data-testid="local-tool-status" role="status">{status}</p>{:else}<p
        data-testid="local-tool-status"
        role="status"
      >
        {localized(copy.ready)}
      </p>{/if}
    {#if error}<p data-testid="local-tool-error" class="error" role="alert">
        {localized(error)}
      </p>{/if}
  </section>
  {#if sourcePixels && sourceWidth && sourceHeight}
    <section class="canvas-panel">
      <canvas
        bind:this={previewCanvas}
        data-testid="local-source-canvas"
        class:paintable={kind === 'remove-object'}
        onpointerdown={startPaint}
        onpointermove={movePaint}
        onpointerup={stopPaint}
        onpointercancel={stopPaint}
        aria-label={localized('Source preview')}
      ></canvas>
    </section>
  {/if}
  {#if outputUrl}<section class="result">
      <img data-testid="local-tool-preview" src={outputUrl} alt={localized(copy.preview)} /><a
        data-testid="local-tool-download"
        class="button primary"
        href={outputUrl}
        download={`${kind}.png`}>{localized(copy.download)}</a
      >
    </section>{/if}
  <section class="faq tool-completion">
    <h2>{localized('Questions about this tool')}</h2>
    {#each faq as item (item.question)}<details>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>{/each}
  </section>
</main>

<style>
  .local-intel {
    max-width: 1120px;
    margin: 0 auto;
    padding: 0 16px 48px;
  }
  .controls,
  .result,
  .canvas-panel,
  .faq {
    display: grid;
    gap: 14px;
    margin: 24px auto;
    padding: 20px;
    border: 1px solid #1c1a1720;
    border-radius: 12px;
    background: #fff;
  }
  label {
    display: grid;
    gap: 8px;
    font-weight: 600;
  }
  input[type='range'] {
    accent-color: #165dff;
  }
  select {
    min-height: 38px;
    max-width: 340px;
  }
  .help,
  .privacy,
  .privacy {
    color: #5c5a56;
    line-height: 1.5;
  }
  .canvas-panel canvas,
  .result img {
    display: block;
    max-width: 100%;
    max-height: 560px;
    margin: 0 auto;
    object-fit: contain;
    background: #f2f2f2;
  }
  .canvas-panel canvas.paintable {
    cursor: crosshair;
    touch-action: none;
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
