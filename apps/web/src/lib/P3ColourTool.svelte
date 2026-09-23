<script lang="ts">
  import {
    applyBlur,
    applySharpen,
    applyThreshold,
    createRaster,
    duotone,
    T41ThresholdOptionsSchema,
    T43SharpenBlurOptionsSchema,
    T47DuotoneOptionsSchema,
    t41ThresholdOptionDescriptions,
    t43SharpenBlurOptionDescriptions,
    t47DuotoneOptionDescriptions,
    type T41ThresholdOptions,
    type T43SharpenBlurOptions,
    type T47DuotoneOptions,
  } from '@complianttools/image-engine';
  import GeneratedControls from './GeneratedControls.svelte';
  import { localizeOptions, type Locale } from './i18n';

  type Kind = 'threshold' | 'sharpen' | 'duotone';
  type Options = T41ThresholdOptions | T43SharpenBlurOptions | T47DuotoneOptions;
  type Selected = { file: File; url: string; width: number; height: number };

  const COPY = {
    en: {
      threshold: {
        title: 'Threshold',
        description: 'Convert a still image to transparent-preserving black and white locally.',
        meta: 'Apply fixed, Otsu, or adaptive thresholding to a still image in your browser.',
        choose: 'Choose a raster image',
        chooseHelp: 'PNG, JPEG, or WebP up to 16 MiB and 6 megapixels.',
        apply: 'Apply threshold',
        processing: 'Applying threshold locally…',
        ready: 'Choose an image to begin.',
        download: 'Download PNG',
        preview: 'Thresholded image preview',
        privacy: 'The image stays in your browser. No upload or network service is used.',
        faq1: 'Which threshold methods are available?',
        faq1Answer: 'Fixed, Otsu global, and Sauvola adaptive thresholding are available.',
        faq2: 'Does thresholding preserve transparency?',
        faq2Answer: 'Yes. RGB becomes black or white while the input alpha channel is preserved.',
        faq3: 'Are my images uploaded?',
        faq3Answer: 'No. Decoding, processing, preview, and PNG export run locally.',
      },
      sharpen: {
        title: 'Sharpen and Blur',
        description: 'Apply bounded local sharpening or Gaussian blur to a still image.',
        meta: 'Sharpen or blur a still image locally with bounded radius and amount controls.',
        choose: 'Choose a raster image',
        chooseHelp: 'PNG, JPEG, or WebP up to 16 MiB and 6 megapixels.',
        apply: 'Apply effect',
        processing: 'Applying effect locally…',
        ready: 'Choose an image to begin.',
        download: 'Download PNG',
        preview: 'Processed image preview',
        privacy: 'The image stays in your browser. No upload or network service is used.',
        faq1: 'Which effects are available?',
        faq1Answer:
          'This bounded route provides an unsharp mask and a three-pass Gaussian approximation.',
        faq2: 'Can sharpening invent detail?',
        faq2Answer: 'Sharpening changes local contrast; it cannot recover missing source detail.',
        faq3: 'Are my images uploaded?',
        faq3Answer: 'No. Decoding, processing, preview, and PNG export run locally.',
      },
      duotone: {
        title: 'Duotone',
        description: 'Map image luminance between two selected colours locally.',
        meta: 'Apply a two-colour luminance gradient map to a still image in your browser.',
        choose: 'Choose a raster image',
        chooseHelp: 'PNG, JPEG, or WebP up to 16 MiB and 6 megapixels.',
        apply: 'Apply duotone',
        processing: 'Applying duotone locally…',
        ready: 'Choose an image to begin.',
        download: 'Download PNG',
        preview: 'Duotone image preview',
        privacy: 'The image stays in your browser. No upload or network service is used.',
        faq1: 'What does duotone change?',
        faq1Answer: 'It maps dark-to-light luminance to the selected shadow and highlight colours.',
        faq2: 'Is the alpha channel retained?',
        faq2Answer: 'Yes. The operation changes RGB values and preserves each input alpha value.',
        faq3: 'Are my images uploaded?',
        faq3Answer: 'No. Decoding, processing, preview, and PNG export run locally.',
      },
    },
    ar: {
      threshold: {
        title: 'العتبة',
        description: 'حوّل صورة ثابتة إلى أبيض وأسود مع الحفاظ على الشفافية محليًا.',
        meta: 'طبّق العتبة الثابتة أو أوتسو أو العتبة التكيفية محليًا في متصفحك.',
        choose: 'اختر صورة نقطية',
        chooseHelp: 'PNG أو JPEG أو WebP حتى 16 ميبيبايت و6 ميغابكسل.',
        apply: 'تطبيق العتبة',
        processing: 'جارٍ تطبيق العتبة محليًا…',
        ready: 'اختر صورة للبدء.',
        download: 'تنزيل PNG',
        preview: 'معاينة الصورة بعد العتبة',
        privacy: 'تبقى الصورة في متصفحك. لا يُستخدم رفع أو اتصال شبكي.',
        faq1: 'ما طرق العتبة المتاحة؟',
        faq1Answer: 'تتوفر العتبة الثابتة وأوتسو العالمية وساڤولا التكيفية.',
        faq2: 'هل تحافظ العتبة على الشفافية؟',
        faq2Answer: 'نعم. تتحول RGB إلى أسود أو أبيض مع الحفاظ على قناة ألفا.',
        faq3: 'هل يتم رفع صوري؟',
        faq3Answer: 'لا. فك الترميز والمعالجة والمعاينة وتصدير PNG محليًا.',
      },
      sharpen: {
        title: 'الحدة والضبابية',
        description: 'طبّق زيادة حدة محلية أو ضبابية غاوسية محدودة على صورة ثابتة.',
        meta: 'زد حدة صورة ثابتة أو طبّق ضبابية محلية بنصف قطر محدود.',
        choose: 'اختر صورة نقطية',
        chooseHelp: 'PNG أو JPEG أو WebP حتى 16 ميبيبايت و6 ميغابكسل.',
        apply: 'تطبيق التأثير',
        processing: 'جارٍ تطبيق التأثير محليًا…',
        ready: 'اختر صورة للبدء.',
        download: 'تنزيل PNG',
        preview: 'معاينة الصورة المعالجة',
        privacy: 'تبقى الصورة في متصفحك. لا يُستخدم رفع أو اتصال شبكي.',
        faq1: 'ما التأثيرات المتاحة؟',
        faq1Answer: 'يوفر المسار قناع حدة وضبابية غاوسية محدودة.',
        faq2: 'هل تستعيد الحدة التفاصيل المفقودة؟',
        faq2Answer: 'تغيّر الحدة التباين المحلي ولا تستعيد التفاصيل المفقودة.',
        faq3: 'هل يتم رفع صوري؟',
        faq3Answer: 'لا. فك الترميز والمعالجة والمعاينة وتصدير PNG محليًا.',
      },
      duotone: {
        title: 'ثنائي اللون',
        description: 'اربط إضاءة الصورة بين لونين تختارهما محليًا.',
        meta: 'طبّق خريطة تدرج لونيين على صورة ثابتة في متصفحك.',
        choose: 'اختر صورة نقطية',
        chooseHelp: 'PNG أو JPEG أو WebP حتى 16 ميبيبايت و6 ميغابكسل.',
        apply: 'تطبيق ثنائي اللون',
        processing: 'جارٍ تطبيق ثنائي اللون محليًا…',
        ready: 'اختر صورة للبدء.',
        download: 'تنزيل PNG',
        preview: 'معاينة الصورة ثنائية اللون',
        privacy: 'تبقى الصورة في متصفحك. لا يُستخدم رفع أو اتصال شبكي.',
        faq1: 'ماذا يغيّر ثنائي اللون؟',
        faq1Answer: 'يربط الإضاءة من الداكن إلى الفاتح بلوني الظلال والإضاءة المختارين.',
        faq2: 'هل تُحفظ قناة ألفا؟',
        faq2Answer: 'نعم. تتغير قيم RGB وتبقى كل قيمة ألفا كما هي.',
        faq3: 'هل يتم رفع صوري؟',
        faq3Answer: 'لا. فك الترميز والمعالجة والمعاينة وتصدير PNG محليًا.',
      },
    },
  } as const;

  let { kind, locale = 'en' }: { kind: Kind; locale?: Locale } = $props();
  const copy = $derived((locale === 'ar' ? COPY.ar : COPY.en)[kind]);
  const pseudo = (value: string) =>
    `⟦${value.replace(/[aeiou]/giu, (letter) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[letter.toLowerCase()] ?? letter)}⟧`;
  const t = (value: string) => (locale === 'en-XA' ? pseudo(value) : value);
  const path = $derived(locale === 'en' ? `/${kind}` : `/${locale}/${kind}`);
  const canonical = $derived(`https://image.complianttools.com${path}`);
  const descriptions = $derived(
    localizeOptions(
      locale,
      kind === 'threshold'
        ? t41ThresholdOptionDescriptions
        : kind === 'sharpen'
          ? t43SharpenBlurOptionDescriptions
          : t47DuotoneOptionDescriptions,
    ),
  );
  let selected = $state<Selected>();
  let options = $state<Options>(
    kind === 'threshold'
      ? T41ThresholdOptionsSchema.parse({})
      : kind === 'sharpen'
        ? T43SharpenBlurOptionsSchema.parse({})
        : T47DuotoneOptionsSchema.parse({}),
  );
  let outputUrl = $state('');
  let outputBytes = $state<Uint8Array>();
  let status = $state('');
  let busy = $state(false);
  let error = $state('');

  const updateOption = (path: string, value: unknown) => {
    if (kind === 'threshold') {
      const current = options as T41ThresholdOptions;
      options = T41ThresholdOptionsSchema.parse({
        ...current,
        [path.split('.').at(-1)!]: value,
      });
    } else if (kind === 'sharpen') {
      const current = options as T43SharpenBlurOptions;
      options = T43SharpenBlurOptionsSchema.parse({
        ...current,
        [path.split('.').at(-1)!]: value,
      });
    } else {
      const current = options as T47DuotoneOptions;
      options = T47DuotoneOptionsSchema.parse({
        ...current,
        [path.split('.').at(-1)!]: value,
      });
    }
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = '';
    outputBytes = undefined;
  };

  async function inspect(file: File): Promise<Selected> {
    if (!file.type.startsWith('image/') || file.size > 16 * 1024 * 1024)
      throw new Error('Choose an image smaller than 16 MiB.');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('The browser could not decode this image.'));
      });
      if (image.naturalWidth * image.naturalHeight > 6_000_000)
        throw new Error('Choose an image no larger than 6 megapixels.');
      return { file, url, width: image.naturalWidth, height: image.naturalHeight };
    } catch (cause) {
      URL.revokeObjectURL(url);
      throw cause;
    }
  }

  async function choose(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    error = '';
    try {
      const next = await inspect(file);
      if (selected) URL.revokeObjectURL(selected.url);
      selected = next;
      status = `${next.width} × ${next.height}`;
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = '';
      outputBytes = undefined;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'The image could not be opened.';
    }
  }

  async function run() {
    if (!selected || busy) return;
    busy = true;
    error = '';
    status = t(copy.processing);
    try {
      const imageElement = new Image();
      imageElement.src = selected.url;
      await new Promise<void>((resolve, reject) => {
        imageElement.onload = () => resolve();
        imageElement.onerror = () => reject(new Error('The browser could not decode this image.'));
      });
      const canvas = document.createElement('canvas');
      canvas.width = selected.width;
      canvas.height = selected.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('The browser could not create a local image canvas.');
      context.drawImage(imageElement, 0, 0);
      const source = context.getImageData(0, 0, selected.width, selected.height);
      const raster = createRaster(selected.width, selected.height, source.data);
      let processed = raster;
      if (kind === 'threshold') {
        const value = options as T41ThresholdOptions;
        processed = applyThreshold(raster, value.mode === 'fixed' ? value.value : value.mode);
      } else if (kind === 'sharpen') {
        const value = options as T43SharpenBlurOptions;
        processed =
          value.operation === 'gaussian'
            ? applyBlur(raster, 'gaussian', value.radius)
            : applySharpen(raster, value.amount, value.radius);
      } else {
        processed = duotone(raster, options as T47DuotoneOptions);
      }
      const output = new ImageData(processed.frames[0]!.data, processed.width, processed.height);
      context.putImageData(output, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The browser could not encode the PNG.');
      outputBytes = new Uint8Array(await blob.arrayBuffer());
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = URL.createObjectURL(blob);
      status = `${selected.width} × ${selected.height}`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'The local operation could not finish.';
      status = '';
    } finally {
      busy = false;
    }
  }

  function download() {
    if (!outputBytes) return;
    const blob = new Blob([outputBytes], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${kind}-result.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

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
        name: t(copy.title),
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
          { '@type': 'ListItem', position: 1, name: t(copy.title), item: canonical },
        ],
      },
    ],
  });
  void graph;

  $effect(() => () => {
    if (selected) URL.revokeObjectURL(selected.url);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
  });
</script>

<svelte:head>
  <title>{t(copy.title)} — Compliant Tools</title>
  <meta name="description" content={t(copy.meta)} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`https://image.complianttools.com/${kind}`} />
  <link rel="alternate" hreflang="en-XA" href={`https://image.complianttools.com/en-XA/${kind}`} />
  <link rel="alternate" hreflang="ar" href={`https://image.complianttools.com/ar/${kind}`} />
  <link rel="alternate" hreflang="x-default" href={`https://image.complianttools.com/${kind}`} />
  <!-- prettier-ignore -->
  <script type="application/ld+json">
{JSON.stringify(graph)}
  </script>
</svelte:head>

<main lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} class="p3-colour-tool">
  <p class="eyebrow">{t('Local image tool')}</p>
  <h1>{t(copy.title)}</h1>
  <p class="lede">{t(copy.description)}</p>
  <p class="privacy">{t(copy.privacy)}</p>
  <label for="p3-input">{t(copy.choose)}</label>
  <input id="p3-input" type="file" accept="image/png,image/jpeg,image/webp" onchange={choose} />
  <p class="help">{t(copy.chooseHelp)}</p>
  {#if selected}<p data-testid="p3-selection">{status}</p>{/if}
  <section aria-label={t('Options')}>
    <GeneratedControls
      {descriptions}
      values={kind === 'threshold'
        ? {
            't41.mode': (options as T41ThresholdOptions).mode,
            't41.value': (options as T41ThresholdOptions).value,
          }
        : kind === 'sharpen'
          ? {
              't43.operation': (options as T43SharpenBlurOptions).operation,
              't43.amount': (options as T43SharpenBlurOptions).amount,
              't43.radius': (options as T43SharpenBlurOptions).radius,
            }
          : {
              't47.shadowColor': (options as T47DuotoneOptions).shadowColor,
              't47.highlightColor': (options as T47DuotoneOptions).highlightColor,
              't47.midpoint': (options as T47DuotoneOptions).midpoint,
            }}
      onChange={updateOption}
      {locale}
    />
  </section>
  <button type="button" data-testid="p3-run" disabled={!selected || busy} onclick={run}
    >{busy ? t(copy.processing) : t(copy.apply)}</button
  >
  {#if error}<p role="alert" data-testid="p3-error">{t(error)}</p>{/if}
  {#if status && !busy}<p aria-live="polite" data-testid="p3-status">{status}</p>{/if}
  {#if outputUrl}
    <figure>
      <img data-testid="p3-preview" src={outputUrl} alt={t(copy.preview)} />
      <figcaption>{t(copy.preview)}</figcaption>
    </figure>
    <button type="button" data-testid="p3-download" onclick={download}>{t(copy.download)}</button>
  {/if}
  <section class="tool-completion">
    <h2>{t('Questions about this tool')}</h2>
    {#each faq as item (item.question)}<details>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>{/each}
  </section>
</main>
