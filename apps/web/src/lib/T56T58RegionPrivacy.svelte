<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { OptionDescription } from '@complianttools/image-engine/schemas/options';
  import {
    applyPrivacyRegions,
    createRaster,
    T56RegionPrivacyOptionsSchema,
    t56RegionPrivacyOptionDescriptions,
    T58RedactOptionsSchema,
    t58RedactOptionDescriptions,
    type T56RegionPrivacyOptions,
    type T58RedactOptions,
  } from '@complianttools/image-engine';
  import GeneratedControls from './GeneratedControls.svelte';

  type Locale = 'en' | 'en-XA' | 'ar';
  type ToolMode = 'blur' | 'redact';
  type Region = { x: number; y: number; width: number; height: number };
  type Dimensions = { width: number; height: number };
  type ErrorKind = 'unsupported' | 'too-large' | 'too-many-pixels' | 'decode' | 'canvas';

  const ORIGIN = 'https://image.complianttools.com';
  const MAX_FILE_BYTES = 16 * 1024 * 1024;
  const MAX_PIXELS = 6_000_000;
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

  // Translators: preserve PNG, MiB, MP, x/y, and numeric placeholders.
  const EN = {
    blur: {
      title: 'Blur or Pixelate a Region',
      description: 'Blur or pixelate a marked rectangle in a still PNG locally.',
      eyebrow: 'Local privacy tool',
      intro: 'Mark a rectangular region, choose an effect, inspect the result, and download a PNG.',
      privacy: 'Your image stays in this browser. No upload or network service is used.',
      choose: 'Choose a still PNG',
      inputLabel: 'Choose a still PNG image',
      limits: 'Still PNG only; up to 16 MiB and 6 megapixels.',
      ready: 'Choose a PNG, then enter a rectangle to protect.',
      effect: 'Privacy effect',
      x: 'Left position (x)',
      y: 'Top position (y)',
      width: 'Width',
      height: 'Height',
      add: 'Add rectangle',
      regions: 'Marked regions',
      none: 'No regions marked yet.',
      remove: 'Remove',
      clear: 'Clear regions',
      download: 'Download protected PNG',
      status: (count: number) =>
        `${count} ${count === 1 ? 'region' : 'regions'} will be protected.`,
      needRegion: 'Mark at least one region before downloading.',
      warning: 'Review every marked region before downloading; effects can hide nearby content.',
      faq: 'About this tool',
      faqAnswer: 'The operation runs locally and changes only the marked rectangular regions.',
      related: 'Related tools',
      errors: {
        unsupported: 'Choose a valid PNG image.',
        'too-large': 'The PNG exceeds the 16 MiB file limit.',
        'too-many-pixels': 'The image exceeds the 6 megapixel limit.',
        decode: 'The browser could not decode this PNG.',
        canvas: 'This browser could not process the image locally.',
      },
      remedies: {
        unsupported: 'Export a still PNG image and choose it again.',
        'too-large': 'Choose a PNG smaller than 16 MiB.',
        'too-many-pixels': 'Resize the image to 6 megapixels or fewer, then try again.',
        decode: 'Export a valid PNG and try again.',
        canvas: 'Try a current browser with 2D canvas support.',
      },
    },
    redact: {
      title: 'Redact Image Regions',
      description: 'Irreversibly replace marked regions in a still PNG locally.',
      eyebrow: 'Local privacy tool',
      intro:
        'Mark a rectangle, confirm destructive redaction, inspect the result, and download a PNG.',
      privacy: 'Your image stays in this browser. No upload or network service is used.',
      choose: 'Choose a still PNG',
      inputLabel: 'Choose a still PNG image to redact',
      limits: 'Still PNG only; up to 16 MiB and 6 megapixels.',
      ready: 'Choose a PNG, then enter a rectangle to redact.',
      effect: 'Redaction fill',
      x: 'Left position (x)',
      y: 'Top position (y)',
      width: 'Width',
      height: 'Height',
      add: 'Add rectangle',
      regions: 'Redacted regions',
      none: 'No regions marked yet.',
      remove: 'Remove',
      clear: 'Clear regions',
      download: 'Download redacted PNG',
      status: (count: number) => `${count} ${count === 1 ? 'region' : 'regions'} will be replaced.`,
      needRegion: 'Mark at least one region before downloading.',
      warning: 'Redaction replaces pixels irreversibly. Verify the rectangles before downloading.',
      confirm: 'I understand that redaction replaces the selected pixels.',
      faq: 'About this tool',
      faqAnswer: 'Redaction writes opaque replacement pixels into each marked rectangle.',
      related: 'Related tools',
      errors: {
        unsupported: 'Choose a valid PNG image.',
        'too-large': 'The PNG exceeds the 16 MiB file limit.',
        'too-many-pixels': 'The image exceeds the 6 megapixel limit.',
        decode: 'The browser could not decode this PNG.',
        canvas: 'This browser could not process the image locally.',
      },
      remedies: {
        unsupported: 'Export a still PNG image and choose it again.',
        'too-large': 'Choose a PNG smaller than 16 MiB.',
        'too-many-pixels': 'Resize the image to 6 megapixels or fewer, then try again.',
        decode: 'Export a valid PNG and try again.',
        canvas: 'Try a current browser with 2D canvas support.',
      },
    },
  } as const;

  type Copy = {
    title: string;
    description: string;
    eyebrow: string;
    intro: string;
    privacy: string;
    choose: string;
    inputLabel: string;
    limits: string;
    ready: string;
    effect: string;
    x: string;
    y: string;
    width: string;
    height: string;
    add: string;
    regions: string;
    none: string;
    remove: string;
    clear: string;
    download: string;
    status: (count: number) => string;
    needRegion: string;
    warning: string;
    confirm?: string;
    faq: string;
    faqAnswer: string;
    related: string;
    errors: Record<ErrorKind, string>;
    remedies: Record<ErrorKind, string>;
  };
  let { locale = 'en', mode = 'blur' }: { locale?: Locale; mode?: ToolMode } = $props();
  let input = $state<HTMLInputElement>();
  let canvas = $state<HTMLCanvasElement>();
  let bitmap = $state<ImageBitmap>();
  let sourcePixels = $state<Uint8ClampedArray>();
  let sourceName = $state('');
  let dimensions = $state<Dimensions>();
  let regions = $state<Region[]>([]);
  let regionX = $state(0);
  let regionY = $state(0);
  let regionWidth = $state(64);
  let regionHeight = $state(64);
  let confirmation = $state(false);
  let status = $state('');
  let notice = $state('');
  let error = $state<ErrorKind>();
  let options = $state<T56RegionPrivacyOptions | T58RedactOptions>(
    T56RegionPrivacyOptionsSchema.parse({}),
  );
  $effect.pre(() => {
    if (mode === 'redact' && !('style' in options)) options = T58RedactOptionsSchema.parse({});
    if (mode === 'blur' && !('effect' in options))
      options = T56RegionPrivacyOptionsSchema.parse({});
  });

  const pseudo = (value: string) =>
    `⟦${value.replace(/[aeiou]/giu, (vowel) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[vowel.toLowerCase()] ?? vowel)}⟧`;
  const AR: Record<ToolMode, Copy> = {
    blur: {
      ...EN.blur,
      title: 'تمويه أو تبكسل منطقة',
      description: 'موّه أو بكسل مستطيلاً محدداً في صورة PNG ثابتة محلياً.',
      eyebrow: 'أداة خصوصية محلية',
      intro: 'حدد منطقة مستطيلة، واختر تأثيراً، وافحص النتيجة ثم نزّل PNG.',
      privacy: 'تبقى الصورة في هذا المتصفح. لا يتم الرفع أو الاتصال بخدمة شبكة.',
      choose: 'اختر PNG ثابتة',
      inputLabel: 'اختر صورة PNG ثابتة',
      limits: 'PNG ثابتة فقط؛ حتى 16 ميبيبايت و6 ميغابكسل.',
      ready: 'اختر PNG ثم أدخل مستطيلاً لحمايته.',
      effect: 'تأثير الخصوصية',
      x: 'الموضع الأيسر (x)',
      y: 'الموضع العلوي (y)',
      width: 'العرض',
      height: 'الارتفاع',
      add: 'إضافة مستطيل',
      regions: 'المناطق المحددة',
      none: 'لم يتم تحديد مناطق بعد.',
      remove: 'إزالة',
      clear: 'مسح المناطق',
      download: 'تنزيل PNG المحمية',
      needRegion: 'حدد منطقة واحدة على الأقل قبل التنزيل.',
      warning: 'راجع كل منطقة قبل التنزيل؛ قد تخفي التأثيرات محتوى قريباً.',
      faq: 'حول هذه الأداة',
      faqAnswer: 'تعمل العملية محلياً ولا تغير إلا المناطق المستطيلة المحددة.',
      related: 'أدوات ذات صلة',
      status: (count) => `ستتم حماية ${count} منطقة.`,
      errors: {
        unsupported: 'اختر صورة PNG صالحة.',
        'too-large': 'يتجاوز PNG حد 16 ميبيبايت.',
        'too-many-pixels': 'تتجاوز الصورة حد 6 ميغابكسل.',
        decode: 'تعذر فك ترميز PNG.',
        canvas: 'تعذرت معالجة الصورة محلياً.',
      },
      remedies: {
        unsupported: 'صدّر PNG ثابتة ثم اخترها مجدداً.',
        'too-large': 'اختر PNG أصغر من 16 ميبيبايت.',
        'too-many-pixels': 'غيّر حجم الصورة إلى 6 ميغابكسل أو أقل.',
        decode: 'صدّر PNG صالحة ثم حاول مجدداً.',
        canvas: 'جرّب متصفحاً يدعم Canvas 2D.',
      },
    },
    redact: {
      ...EN.redact,
      title: 'حجب مناطق الصورة',
      description: 'استبدل المناطق المحددة نهائياً في صورة PNG ثابتة محلياً.',
      eyebrow: 'أداة خصوصية محلية',
      intro: 'حدد مستطيلاً، وأكد الحجب التدميري، وافحص النتيجة ثم نزّل PNG.',
      privacy: 'تبقى الصورة في هذا المتصفح. لا يتم الرفع أو الاتصال بخدمة شبكة.',
      choose: 'اختر PNG ثابتة',
      inputLabel: 'اختر صورة PNG ثابتة لحجبها',
      limits: 'PNG ثابتة فقط؛ حتى 16 ميبيبايت و6 ميغابكسل.',
      ready: 'اختر PNG ثم أدخل مستطيلاً لحجبه.',
      effect: 'تعبئة الحجب',
      x: 'الموضع الأيسر (x)',
      y: 'الموضع العلوي (y)',
      width: 'العرض',
      height: 'الارتفاع',
      add: 'إضافة مستطيل',
      regions: 'المناطق المحجوبة',
      none: 'لم يتم تحديد مناطق بعد.',
      remove: 'إزالة',
      clear: 'مسح المناطق',
      download: 'تنزيل PNG المحجوبة',
      needRegion: 'حدد منطقة واحدة على الأقل قبل التنزيل.',
      warning: 'الحجب يستبدل البكسلات نهائياً. تحقق من المستطيلات قبل التنزيل.',
      confirm: 'أفهم أن الحجب يستبدل البكسلات المحددة.',
      faq: 'حول هذه الأداة',
      faqAnswer: 'تكتب الأداة بكسلات بديلة معتمة داخل كل مستطيل محدد.',
      related: 'أدوات ذات صلة',
      status: (count) => `سيتم استبدال ${count} منطقة.`,
      errors: {
        unsupported: 'اختر صورة PNG صالحة.',
        'too-large': 'يتجاوز PNG حد 16 ميبيبايت.',
        'too-many-pixels': 'تتجاوز الصورة حد 6 ميغابكسل.',
        decode: 'تعذر فك ترميز PNG.',
        canvas: 'تعذرت معالجة الصورة محلياً.',
      },
      remedies: {
        unsupported: 'صدّر PNG ثابتة ثم اخترها مجدداً.',
        'too-large': 'اختر PNG أصغر من 16 ميبيبايت.',
        'too-many-pixels': 'غيّر حجم الصورة إلى 6 ميغابكسل أو أقل.',
        decode: 'صدّر PNG صالحة ثم حاول مجدداً.',
        canvas: 'جرّب متصفحاً يدعم Canvas 2D.',
      },
    },
  };

  const copy = $derived((locale === 'ar' ? AR : EN)[mode] as Copy);
  const localized = (value: string) => (locale === 'en-XA' ? pseudo(value) : value);
  const title = $derived(localized(copy.title));
  const description = $derived(localized(copy.description));
  const localizedPath = $derived(
    locale === 'en'
      ? mode === 'blur'
        ? '/blur-image'
        : '/redact'
      : `/${locale}/${mode === 'blur' ? 'blur-image' : 'redact'}`,
  );
  const canonical = $derived(`${ORIGIN}${localizedPath}`);
  const optionDescriptions = $derived(
    (mode === 'blur'
      ? t56RegionPrivacyOptionDescriptions
      : t58RedactOptionDescriptions) as Readonly<Record<string, OptionDescription>>,
  );
  const optionValues = $derived(
    mode === 'blur'
      ? {
          't56.effect': (options as T56RegionPrivacyOptions).effect,
          't56.intensity': (options as T56RegionPrivacyOptions).intensity,
        }
      : {
          't58.style': (options as T58RedactOptions).style,
        },
  );

  function updateOption(path: string, value: unknown) {
    const schema = mode === 'blur' ? T56RegionPrivacyOptionsSchema : T58RedactOptionsSchema;
    const parsed = schema.safeParse({ ...options, [path.split('.').at(-1)!]: value });
    if (parsed.success) {
      options = parsed.data;
      redraw();
    }
  }

  function privacyEffect(): Parameters<typeof applyPrivacyRegions>[2] {
    if (mode === 'redact') {
      return (options as T58RedactOptions).style === 'noise'
        ? { kind: 'noise', amount: 255, seed: 58 }
        : { kind: 'solid', colour: [0, 0, 0] };
    }
    const selected = options as T56RegionPrivacyOptions;
    if (selected.effect === 'pixelate') return { kind: 'pixelate', blockSize: selected.intensity };
    if (selected.effect === 'solid') return { kind: 'solid', colour: [0, 0, 0] };
    if (selected.effect === 'noise') return { kind: 'noise', amount: selected.intensity, seed: 56 };
    return { kind: 'blur', radius: selected.intensity };
  }

  function clearBitmap() {
    bitmap?.close();
    bitmap = undefined;
    sourcePixels = undefined;
    dimensions = undefined;
    regions = [];
    sourceName = '';
    status = '';
    if (canvas) canvas.width = 0;
  }

  async function inspect(file: File): Promise<Dimensions> {
    if (file.size > MAX_FILE_BYTES) throw new Error('too-large');
    const header = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (header.length < 24 || !PNG_SIGNATURE.every((value, index) => header[index] === value))
      throw new Error('unsupported');
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (!width || !height || width * height > MAX_PIXELS) throw new Error('too-many-pixels');
    return { width, height };
  }

  async function choose(event: Event) {
    const picker = event.currentTarget as HTMLInputElement;
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    clearBitmap();
    error = undefined;
    notice = '';
    confirmation = false;
    try {
      const size = await inspect(file);
      const decoded = await createImageBitmap(file);
      if (decoded.width !== size.width || decoded.height !== size.height) throw new Error('decode');
      bitmap = decoded;
      dimensions = size;
      sourceName = file.name;
      regionWidth = Math.min(64, size.width);
      regionHeight = Math.min(64, size.height);
      await tick();
      redraw();
      if (!error) status = `${file.name} · ${size.width} × ${size.height}`;
    } catch (cause) {
      bitmap?.close();
      bitmap = undefined;
      error =
        cause instanceof Error && cause.message in copy.errors
          ? (cause.message as ErrorKind)
          : 'decode';
    }
  }

  function redraw() {
    if (!canvas || !bitmap || !dimensions) return;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      error = 'canvas';
      return;
    }
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    if (!sourcePixels) {
      context.drawImage(bitmap, 0, 0);
      sourcePixels = new Uint8ClampedArray(
        context.getImageData(0, 0, dimensions.width, dimensions.height).data,
      );
    }
    const image = createRaster(dimensions.width, dimensions.height, sourcePixels.slice());
    const result = applyPrivacyRegions(image, regions, privacyEffect());
    context.putImageData(
      new ImageData(result.frames[0]!.data, dimensions.width, dimensions.height),
      0,
      0,
    );
    status = regions.length ? copy.status(regions.length) : '';
  }

  function addRegion() {
    if (!dimensions) return;
    const x = Math.max(0, Math.min(dimensions.width, Math.round(regionX)));
    const y = Math.max(0, Math.min(dimensions.height, Math.round(regionY)));
    const width = Math.max(0, Math.min(dimensions.width - x, Math.round(regionWidth)));
    const height = Math.max(0, Math.min(dimensions.height - y, Math.round(regionHeight)));
    if (width < 4 || height < 4) {
      notice =
        locale === 'ar'
          ? 'أدخل مستطيلاً أكبر من 4 × 4 بكسل.'
          : 'Enter a rectangle at least 4 × 4 pixels.';
      return;
    }
    regions = [...regions, { x, y, width, height }];
    notice = '';
    redraw();
  }

  function removeRegion(index: number) {
    regions = regions.filter((_, candidate) => candidate !== index);
    redraw();
  }

  function download() {
    if (!canvas || !regions.length) {
      notice = copy.needRegion;
      return;
    }
    if (mode === 'redact' && !confirmation) {
      notice =
        locale === 'ar'
          ? 'أكد فهمك للحجب التدميري قبل التنزيل.'
          : 'Confirm destructive redaction before downloading.';
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        error = 'canvas';
        return;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${sourceName.replace(/\.png$/iu, '') || 'image'}-${mode === 'blur' ? 'protected' : 'redacted'}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, 'image/png');
  }

  const schema = $derived({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: title,
    description,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    inLanguage: locale,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  });

  onDestroy(() => bitmap?.close());
</script>

<svelte:head>
  <title>{title} — ctimg</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <link
    rel="alternate"
    hreflang="en"
    href={`${ORIGIN}${mode === 'blur' ? '/blur-image' : '/redact'}`}
  />
  <link
    rel="alternate"
    hreflang="en-XA"
    href={`${ORIGIN}/en-XA${mode === 'blur' ? '/blur-image' : '/redact'}`}
  />
  <link
    rel="alternate"
    hreflang="ar"
    href={`${ORIGIN}/ar${mode === 'blur' ? '/blur-image' : '/redact'}`}
  />
  <link
    rel="alternate"
    hreflang="x-default"
    href={`${ORIGIN}${mode === 'blur' ? '/blur-image' : '/redact'}`}
  />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(schema)}</svelte:element
  >
</svelte:head>

<main class="privacy-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <section class="intro" aria-labelledby="privacy-heading">
    <p class="eyebrow">{localized(copy.eyebrow)}</p>
    <h1 id="privacy-heading">{title}</h1>
    <p>{description}</p>
    <p class="privacy-copy">{localized(copy.privacy)}</p>
    <p class="warning" data-testid={`${mode === 'blur' ? 't56' : 't58'}-warning`}>
      {localized(copy.warning)}
    </p>
  </section>
  <section class="workspace" aria-label={localized('Image editing workspace')}>
    <label class="button choose"
      >{localized(copy.choose)}<input
        bind:this={input}
        data-testid={`${mode === 'blur' ? 't56' : 't58'}-input`}
        type="file"
        accept="image/png,.png"
        aria-label={localized(copy.inputLabel)}
        onchange={choose}
      /></label
    >
    <p class="limits">{localized(copy.limits)}</p>
    {#if dimensions}
      <p data-testid={`${mode === 'blur' ? 't56' : 't58'}-file-info`}>
        {sourceName} · {dimensions.width} × {dimensions.height}
      </p>
      <canvas
        bind:this={canvas}
        data-testid={`${mode === 'blur' ? 't56' : 't58'}-canvas`}
        tabindex="0"
        aria-label={localized('Image preview')}
      ></canvas>
      <div class="controls">
        <GeneratedControls
          descriptions={optionDescriptions}
          values={optionValues}
          onChange={updateOption}
          {locale}
        />
      </div>
      <fieldset class="coordinates">
        <legend>{localized('Rectangle coordinates')}</legend>
        <label for="region-x">{localized(copy.x)}</label><input
          id="region-x"
          data-testid={`${mode === 'blur' ? 't56' : 't58'}-x`}
          type="number"
          min="0"
          value={regionX}
          oninput={(event) => (regionX = Number(event.currentTarget.value))}
        />
        <label for="region-y">{localized(copy.y)}</label><input
          id="region-y"
          data-testid={`${mode === 'blur' ? 't56' : 't58'}-y`}
          type="number"
          min="0"
          value={regionY}
          oninput={(event) => (regionY = Number(event.currentTarget.value))}
        />
        <label for="region-width">{localized(copy.width)}</label><input
          id="region-width"
          data-testid={`${mode === 'blur' ? 't56' : 't58'}-width`}
          type="number"
          min="4"
          value={regionWidth}
          oninput={(event) => (regionWidth = Number(event.currentTarget.value))}
        />
        <label for="region-height">{localized(copy.height)}</label><input
          id="region-height"
          data-testid={`${mode === 'blur' ? 't56' : 't58'}-height`}
          type="number"
          min="4"
          value={regionHeight}
          oninput={(event) => (regionHeight = Number(event.currentTarget.value))}
        />
        <button
          type="button"
          class="button"
          data-testid={`${mode === 'blur' ? 't56' : 't58'}-add`}
          onclick={addRegion}>{localized(copy.add)}</button
        >
      </fieldset>
      <section aria-labelledby="regions-heading">
        <h2 id="regions-heading">{localized(copy.regions)}</h2>
        {#if regions.length}<ol>
            {#each regions as region, index (index)}<li>
                <span>{index + 1}: {region.x}, {region.y}, {region.width} × {region.height}</span
                ><button type="button" onclick={() => removeRegion(index)}
                  >{localized(copy.remove)}</button
                >
              </li>{/each}
          </ol>{:else}<p>{localized(copy.none)}</p>{/if}
      </section>
      <div class="actions">
        <button
          type="button"
          class="button"
          onclick={() => {
            regions = [];
            redraw();
          }}>{localized(copy.clear)}</button
        ><button
          type="button"
          class="button primary"
          data-testid={`${mode === 'blur' ? 't56' : 't58'}-download`}
          onclick={download}>{localized(copy.download)}</button
        >
      </div>
      {#if mode === 'redact'}<label class="confirm"
          ><input data-testid="t58-confirm" type="checkbox" bind:checked={confirmation} />
          {localized(copy.confirm ?? '')}</label
        >{/if}
    {:else}<p data-testid={`${mode === 'blur' ? 't56' : 't58'}-ready`}>
        {localized(copy.ready)}
      </p>{/if}
    {#if status}<p
        class="status"
        role="status"
        data-testid={`${mode === 'blur' ? 't56' : 't58'}-status`}
      >
        {localized(status)}
      </p>{/if}
    {#if notice}<p
        class="notice"
        role="status"
        data-testid={`${mode === 'blur' ? 't56' : 't58'}-notice`}
      >
        {localized(notice)}
      </p>{/if}
    {#if error}<p class="error" role="alert" data-error-kind={error}>
        {localized(copy.errors[error])}
        {localized(copy.remedies[error])}
      </p>{/if}
  </section>
  <section class="faq" aria-labelledby="faq-heading">
    <h2 id="faq-heading">{localized(copy.faq)}</h2>
    <details>
      <summary>{localized(copy.faq)}</summary>
      <p>{localized(copy.faqAnswer)}</p>
    </details>
  </section>
</main>

<style>
  .privacy-page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 24px 16px 64px;
    color: #17243a;
  }
  .intro,
  .workspace,
  .faq {
    margin-block-end: 28px;
  }
  .workspace {
    padding: 20px;
    border: 1px solid #d6dbe3;
    border-radius: 12px;
    background: #fff;
  }
  .eyebrow {
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .privacy-copy,
  .warning,
  .notice,
  .error {
    padding: 10px 12px;
    border-radius: 6px;
  }
  .privacy-copy {
    font-weight: 650;
  }
  .warning,
  .notice {
    background: #fff7e6;
    color: #613b00;
  }
  .error {
    background: #fff0f0;
    color: #8c1d18;
  }
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 8px 14px;
    border: 1px solid #46536a;
    border-radius: 7px;
    background: #fff;
    color: #17243a;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }
  .button.primary {
    background: #174ea6;
    color: #fff;
    border-color: #174ea6;
  }
  .choose input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  canvas {
    display: block;
    width: min(100%, 760px);
    height: auto;
    margin: 18px auto;
    border: 1px solid #9ba6b7;
    background: #eee;
    image-rendering: auto;
  }
  .coordinates {
    display: grid;
    grid-template-columns: repeat(4, minmax(100px, 1fr));
    gap: 8px 12px;
    margin: 18px 0;
    padding: 14px;
    border: 1px solid #d6dbe3;
    border-radius: 8px;
  }
  .coordinates input {
    width: 100%;
    min-height: 40px;
    padding: 6px 8px;
    font: inherit;
  }
  .coordinates button {
    grid-column: 1 / -1;
    justify-self: start;
  }
  .controls {
    margin: 18px 0;
  }
  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-block: 18px;
  }
  .confirm {
    display: block;
    margin-block: 16px;
    font-weight: 650;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
  }
  details {
    padding: 12px;
    border: 1px solid #d6dbe3;
    border-radius: 8px;
  }
  summary {
    cursor: pointer;
    font-weight: 650;
  }
  @media (max-width: 640px) {
    .coordinates {
      grid-template-columns: repeat(2, minmax(100px, 1fr));
    }
  }
</style>
