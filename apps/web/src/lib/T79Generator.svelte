<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { OptionDescription } from '@complianttools/image-engine/schemas/options';
  import {
    isT79GeneratorErrorKind,
    T79GeneratorOptionsSchema,
    t79GeneratorOptionDescriptions,
    type T79GeneratorErrorKind,
    type T79GeneratorOptions,
  } from '@complianttools/image-engine/schemas/procedural-generator';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  type Locale = 'en' | 'en-XA' | 'ar';
  type Copy = {
    title: string;
    description: string;
    meta: string;
    settings: string;
    width: string;
    height: string;
    dimensionsHelp: string;
    seed: string;
    mode: string;
    fbm: string;
    valueNoise: string;
    radial: string;
    seedHelp: string;
    seedUnused: string;
    generate: string;
    generating: string;
    cancel: string;
    cancelled: string;
    download: string;
    preview: string;
    local: string;
    scope: string;
    invalid: string;
    errorPrefix: string;
    errors: Readonly<Record<T79GeneratorErrorKind, string>>;
    remedies: Readonly<Record<T79GeneratorErrorKind, string>>;
    done: (width: number, height: number) => string;
    faqHeading: string;
    faqDimensions: string;
    faqDimensionsAnswer: string;
    faqSeed: string;
    faqSeedAnswer: string;
    faqPrivacy: string;
    faqPrivacyAnswer: string;
    related: string;
    relatedResize: string;
    relatedConvert: string;
    back: string;
  };

  // Translators: keep PNG, pixel counts, seed values, and the 16–512 range unchanged.
  const en: Copy = {
    title: 'Procedural Generator',
    description:
      'Create a still grayscale noise texture or radial gradient in your browser. Choose a pattern and seed, set bounded dimensions, preview the PNG, and download it.',
    meta: 'Generate seeded grayscale noise or a radial gradient locally, preview it, and download a PNG.',
    settings: 'Pattern settings',
    width: 'Width in pixels',
    height: 'Height in pixels',
    dimensionsHelp: 'Choose whole-number dimensions from 16 to 512 pixels.',
    seed: 'Seed',
    mode: 'Pattern',
    fbm: 'Fractal noise (seeded)',
    valueNoise: 'Value noise (seeded)',
    radial: 'Radial gradient',
    seedHelp: 'The same pattern, dimensions, and seed produce the same pixels.',
    seedUnused: 'The radial gradient does not use the seed.',
    generate: 'Generate preview',
    generating: 'Generating locally…',
    cancel: 'Cancel generation',
    cancelled: 'Generation cancelled.',
    download: 'Download PNG',
    preview: 'Generated grayscale pattern preview',
    local: 'Generation runs in your browser. No image is uploaded.',
    scope: 'This version creates grayscale fractal noise, value noise, or a radial gradient.',
    invalid: 'The dimensions, seed, or pattern are outside the supported range.',
    errorPrefix: 'Try this',
    errors: {
      'invalid-options': 'The pattern settings are invalid.',
      'worker-unavailable': 'The browser could not start the local generator.',
      'worker-failed': 'The local generator stopped unexpectedly.',
      'canvas-unavailable': 'The browser could not create a local image canvas.',
      'png-encoding-failed': 'The browser could not encode the generated PNG.',
      'processing-failed': 'The pattern could not be generated.',
      cancelled: 'Generation was cancelled.',
    },
    remedies: {
      'invalid-options':
        'Use whole-number dimensions from 16 to 512 pixels and a signed 32-bit seed.',
      'worker-unavailable': 'Use a browser that supports module workers, then reload this page.',
      'worker-failed': 'Reload the page and try again in a browser that supports module workers.',
      'canvas-unavailable': 'Use a browser with local Canvas 2D support, then try again.',
      'png-encoding-failed': 'Try again with smaller dimensions so the browser can encode the PNG.',
      'processing-failed': 'Try a smaller pattern or another seed. No image data was uploaded.',
      cancelled: 'Choose Generate preview to start a new pattern.',
    },
    done: (width, height) => `Created a ${width} × ${height} pixel PNG locally.`,
    faqHeading: 'Questions about this tool',
    faqDimensions: 'What can I generate?',
    faqDimensionsAnswer:
      'Choose grayscale fractal noise, value noise, or a radial gradient. Output dimensions must be whole numbers from 16 to 512 pixels.',
    faqSeed: 'Does the seed make output repeatable?',
    faqSeedAnswer:
      'Yes. The same pattern, dimensions, and seed produce identical pixel values. A radial gradient does not use a seed.',
    faqPrivacy: 'Are my images uploaded?',
    faqPrivacyAnswer:
      'No. The generator runs in a local browser worker, and the preview and PNG download are created in your browser.',
    related: 'Related tools',
    relatedResize: 'Resize an image',
    relatedConvert: 'Convert an image',
    back: 'Back to tools',
  };

  const ar: Copy = {
    title: 'مولّد الصور الإجرائي',
    description:
      'أنشئ نسيج ضوضاء رماديًا ثابتًا أو تدرجًا شعاعيًا في متصفحك. اختر النمط والبذرة والأبعاد المحدودة، ثم عاين صورة PNG ونزّلها.',
    meta: 'أنشئ ضوضاء رمادية ببذرة ثابتة أو تدرجًا شعاعيًا محليًا، وعاين صورة PNG ونزّلها.',
    settings: 'إعدادات النمط',
    width: 'العرض بالبكسل',
    height: 'الارتفاع بالبكسل',
    dimensionsHelp: 'اختر أبعادًا صحيحة من 16 إلى 512 بكسل.',
    seed: 'البذرة',
    mode: 'النمط',
    fbm: 'ضوضاء كسرية (ببذرة)',
    valueNoise: 'ضوضاء القيم (ببذرة)',
    radial: 'تدرج شعاعي',
    seedHelp: 'ينتج النمط والأبعاد والبذرة نفسها قيم البكسلات نفسها.',
    seedUnused: 'لا يستخدم التدرج الشعاعي البذرة.',
    generate: 'إنشاء معاينة',
    generating: 'جارٍ الإنشاء محليًا…',
    cancel: 'إلغاء الإنشاء',
    cancelled: 'تم إلغاء الإنشاء.',
    download: 'تنزيل PNG',
    preview: 'معاينة النمط الرمادي المُنشأ',
    local: 'يعمل الإنشاء في متصفحك. لا تُرفع أي صورة.',
    scope: 'ينشئ هذا الإصدار ضوضاء كسرية رمادية أو ضوضاء القيم أو تدرجًا شعاعيًا.',
    invalid: 'الأبعاد أو البذرة أو النمط خارج النطاق المدعوم.',
    errorPrefix: 'جرّب هذا',
    errors: {
      'invalid-options': 'إعدادات النمط غير صالحة.',
      'worker-unavailable': 'تعذر على المتصفح بدء عامل الإنشاء المحلي.',
      'worker-failed': 'توقف عامل الإنشاء المحلي بشكل غير متوقع.',
      'canvas-unavailable': 'تعذر على المتصفح إنشاء لوحة صور محلية.',
      'png-encoding-failed': 'تعذر على المتصفح ترميز صورة PNG المُنشأة.',
      'processing-failed': 'تعذر إنشاء النمط.',
      cancelled: 'تم إلغاء الإنشاء.',
    },
    remedies: {
      'invalid-options':
        'استخدم أبعادًا صحيحة من 16 إلى 512 بكسل وبذرة صحيحة ضمن نطاق 32 بت بإشارة.',
      'worker-unavailable':
        'استخدم متصفحًا يدعم العمال البرمجيين من نوع module ثم أعد تحميل الصفحة.',
      'worker-failed': 'أعد تحميل الصفحة وحاول بمتصفح يدعم العمال البرمجيين من نوع module.',
      'canvas-unavailable': 'استخدم متصفحًا يدعم Canvas 2D محليًا ثم حاول مجددًا.',
      'png-encoding-failed': 'جرّب أبعادًا أصغر كي يتمكن المتصفح من ترميز PNG.',
      'processing-failed': 'جرّب نمطًا أصغر أو بذرة أخرى. لم تُرفع أي بيانات صور.',
      cancelled: 'اختر إنشاء معاينة لبدء نمط جديد.',
    },
    done: (width, height) => `أُنشئت صورة PNG محلية بأبعاد ${width} × ${height} بكسل.`,
    faqHeading: 'أسئلة حول هذه الأداة',
    faqDimensions: 'ما الذي يمكنني إنشاؤه؟',
    faqDimensionsAnswer:
      'اختر ضوضاء كسرية رمادية أو ضوضاء القيم أو تدرجًا شعاعيًا. يجب أن تكون الأبعاد أعدادًا صحيحة من 16 إلى 512 بكسل.',
    faqSeed: 'هل تجعل البذرة الناتج قابلًا للتكرار؟',
    faqSeedAnswer:
      'نعم. ينتج النمط والأبعاد والبذرة نفسها قيم البكسلات نفسها. لا يستخدم التدرج الشعاعي بذرة.',
    faqPrivacy: 'هل يتم رفع الصور؟',
    faqPrivacyAnswer:
      'لا. يعمل المولّد داخل عامل محلي في المتصفح، وتُنشأ المعاينة وملف PNG في متصفحك.',
    related: 'أدوات ذات صلة',
    relatedResize: 'تغيير حجم صورة',
    relatedConvert: 'تحويل صورة',
    back: 'العودة إلى الأدوات',
  };

  type CopyKey = Exclude<keyof Copy, 'errors' | 'remedies' | 'done'>;
  type WorkerResponse =
    | {
        readonly type: 'result';
        readonly width: number;
        readonly height: number;
        readonly data: ArrayBuffer;
      }
    | { readonly type: 'error'; readonly kind: T79GeneratorErrorKind };

  let { locale = 'en' }: { locale?: Locale } = $props();
  const selectedCopy = $derived(locale === 'ar' ? ar : en);
  const pseudo = (value: string) =>
    `⟦${value} ${'~'.repeat(Math.max(2, Math.ceil(value.length / 5)))}⟧`;
  const t = (key: CopyKey) => {
    const value = selectedCopy[key];
    return locale === 'en-XA' ? pseudo(value) : value;
  };
  const localizedPath = $derived(locale === 'en' ? '/generate' : `/${locale}/generate`);
  const canonical = $derived(`https://image.complianttools.com${localizedPath}`);
  const title = $derived(t('title'));
  const description = $derived(t('meta'));
  const faq = $derived([
    { question: t('faqDimensions'), answer: t('faqDimensionsAnswer') },
    { question: t('faqSeed'), answer: t('faqSeedAnswer') },
    { question: t('faqPrivacy'), answer: t('faqPrivacyAnswer') },
  ]);
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
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: t('relatedConvert'),
            item: `https://image.complianttools.com${locale === 'en' ? '/convert' : `/${locale}/convert`}`,
          },
          { '@type': 'ListItem', position: 2, name: title, item: canonical },
        ],
      },
    ],
  });

  const defaultOptions = T79GeneratorOptionsSchema.parse({});
  let width = $state(defaultOptions.width);
  let height = $state(defaultOptions.height);
  let seed = $state(defaultOptions.seed);
  let mode = $state<T79GeneratorOptions['mode']>(defaultOptions.mode);
  const optionValues = $derived({
    'generator.width': width,
    'generator.height': height,
    'generator.seed': seed,
    'generator.mode': mode,
  });
  const optionDescriptions = $derived<Record<string, OptionDescription>>({
    'generator.width': {
      ...t79GeneratorOptionDescriptions['generator.width']!,
      label: t('width'),
      help: t('dimensionsHelp'),
    },
    'generator.height': {
      ...t79GeneratorOptionDescriptions['generator.height']!,
      label: t('height'),
      help: t('dimensionsHelp'),
    },
    'generator.seed': {
      ...t79GeneratorOptionDescriptions['generator.seed']!,
      label: t('seed'),
      help: mode === 'radial-gradient' ? t('seedUnused') : t('seedHelp'),
    },
    'generator.mode': {
      ...t79GeneratorOptionDescriptions['generator.mode']!,
      label: t('mode'),
      optionLabels: {
        fbm: t('fbm'),
        'value-noise': t('valueNoise'),
        'radial-gradient': t('radial'),
      },
    },
  });

  let previewUrl = $state('');
  let busy = $state(false);
  let status = $state('');
  let error = $state<T79GeneratorErrorKind>();
  let activeWorker: Worker | undefined;
  let activeTask = 0;

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }

  function invalidateOutput() {
    clearPreview();
    status = '';
    error = undefined;
  }

  function updateOption(path: string, value: unknown) {
    if (path === 'generator.mode' && isGeneratorMode(value)) mode = value;
    else if (path === 'generator.width' && typeof value === 'number') width = value;
    else if (path === 'generator.height' && typeof value === 'number') height = value;
    else if (path === 'generator.seed' && typeof value === 'number') seed = value;
    invalidateOutput();
  }

  function isGeneratorMode(value: unknown): value is T79GeneratorOptions['mode'] {
    return value === 'fbm' || value === 'value-noise' || value === 'radial-gradient';
  }

  function terminateWorker(worker: Worker) {
    worker.terminate();
    if (activeWorker === worker) activeWorker = undefined;
  }

  function cancelGeneration() {
    if (!busy) return;
    activeTask += 1;
    if (activeWorker) terminateWorker(activeWorker);
    busy = false;
    status = '';
    clearPreview();
    error = 'cancelled';
  }

  function reportFailure(task: number, kind: T79GeneratorErrorKind, worker?: Worker) {
    if (task !== activeTask) return;
    if (worker) terminateWorker(worker);
    busy = false;
    status = '';
    error = kind;
  }

  function generate() {
    invalidateOutput();
    const parsed = T79GeneratorOptionsSchema.safeParse({ width, height, seed, mode });
    if (!parsed.success) {
      error = 'invalid-options';
      return;
    }

    activeTask += 1;
    const task = activeTask;
    if (activeWorker) terminateWorker(activeWorker);
    status = t('generating');
    busy = true;
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/t79-generator.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      reportFailure(task, 'worker-unavailable');
      return;
    }
    activeWorker = worker;

    worker.onmessage = async (event: MessageEvent<WorkerResponse>) => {
      if (task !== activeTask) return;
      const response = event.data;
      if (!response || typeof response !== 'object' || !('type' in response)) {
        reportFailure(task, 'worker-failed', worker);
        return;
      }
      if (response.type === 'error') {
        reportFailure(
          task,
          isT79GeneratorErrorKind(response.kind) ? response.kind : 'worker-failed',
          worker,
        );
        return;
      }
      if (
        response.type !== 'result' ||
        response.width !== parsed.data.width ||
        response.height !== parsed.data.height ||
        !(response.data instanceof ArrayBuffer) ||
        response.data.byteLength !== response.width * response.height * 4
      ) {
        reportFailure(task, 'worker-failed', worker);
        return;
      }
      terminateWorker(worker);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = response.width;
        canvas.height = response.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas-unavailable');
        context.putImageData(
          new ImageData(new Uint8ClampedArray(response.data), response.width, response.height),
          0,
          0,
        );
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) => (result ? resolve(result) : reject(new Error('png-encoding-failed'))),
            'image/png',
          );
        });
        if (task !== activeTask) return;
        previewUrl = URL.createObjectURL(blob);
        const done = selectedCopy.done(response.width, response.height);
        status = locale === 'en-XA' ? pseudo(done) : done;
      } catch (cause) {
        if (task === activeTask) {
          const kind =
            cause instanceof Error && isT79GeneratorErrorKind(cause.message)
              ? cause.message
              : cause instanceof Error && cause.message === 'canvas-unavailable'
                ? 'canvas-unavailable'
                : 'processing-failed';
          error = kind;
          status = '';
        }
      } finally {
        if (task === activeTask) busy = false;
      }
    };
    worker.onerror = () => reportFailure(task, 'worker-failed', worker);
    worker.onmessageerror = () => reportFailure(task, 'worker-failed', worker);
    try {
      worker.postMessage(parsed.data);
    } catch {
      reportFailure(task, 'worker-failed', worker);
    }
  }

  onDestroy(() => {
    activeTask += 1;
    if (activeWorker) terminateWorker(activeWorker);
    clearPreview();
  });
</script>

<svelte:head>
  <title>{title} — Image Compliant Tools</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href="https://image.complianttools.com/generate" />
  <link rel="alternate" hreflang="en-XA" href="https://image.complianttools.com/en-XA/generate" />
  <link rel="alternate" hreflang="ar" href="https://image.complianttools.com/ar/generate" />
  <link rel="alternate" hreflang="x-default" href="https://image.complianttools.com/generate" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content="https://image.complianttools.com/og/tools.svg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content="https://image.complianttools.com/og/tools.svg" />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(schema)}</svelte:element
  >
</svelte:head>

<main class="t79-page" lang={locale === 'en' ? 'en' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a class="t79-back" href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('back')}</a>
  <header>
    <h1>{title}</h1>
    <p>{t('description')}</p>
    <p class="t79-local">{t('local')}</p>
  </header>

  <section class="t79-tool" aria-label={title}>
    <div class="t79-controls">
      <h2>{t('settings')}</h2>
      <GeneratedControls
        descriptions={optionDescriptions}
        values={optionValues}
        onChange={updateOption}
        {locale}
      />
      <p class="t79-scope">{t('scope')}</p>
      <div class="t79-actions">
        <button
          data-testid="t79-generate"
          class="t79-primary"
          type="button"
          onclick={generate}
          disabled={busy}
        >
          {busy ? t('generating') : t('generate')}
        </button>
        {#if busy}
          <button
            data-testid="t79-cancel"
            class="t79-secondary"
            type="button"
            onclick={cancelGeneration}
          >
            {t('cancel')}
          </button>
        {/if}
      </div>
      {#if previewUrl}
        <a
          data-testid="t79-download"
          class="t79-download"
          href={previewUrl}
          download={`procedural-${mode}.png`}>{t('download')}</a
        >
      {/if}
      {#if error}
        <p data-testid="t79-error" data-error-kind={error} class="t79-error" role="alert">
          {locale === 'en-XA' ? pseudo(selectedCopy.errors[error]) : selectedCopy.errors[error]}
          {t('errorPrefix')}:
          {locale === 'en-XA' ? pseudo(selectedCopy.remedies[error]) : selectedCopy.remedies[error]}
        </p>
      {/if}
      <p data-testid="t79-status" role="status" aria-live="polite">{status}</p>
    </div>

    <section class="t79-preview" aria-label={t('preview')}>
      {#if previewUrl}
        <img data-testid="t79-preview-image" src={previewUrl} alt={t('preview')} />
      {:else}
        <p>{t('preview')}</p>
      {/if}
    </section>
  </section>

  <section class="tool-completion t79-faq" aria-labelledby="t79-faq-heading">
    <h2 id="t79-faq-heading">{t('faqHeading')}</h2>
    {#each faq as item (item.question)}
      <details>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>
    {/each}
    <nav aria-label={t('related')}>
      <a href={locale === 'en' ? '/resize' : `/${locale}/resize`}>{t('relatedResize')}</a>
      <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('relatedConvert')}</a>
    </nav>
  </section>
</main>

<style>
  .t79-page {
    max-width: 1120px;
    margin: 0 auto;
    padding: 32px 24px 72px;
    color: #1c1a17;
  }
  .t79-back {
    display: inline-block;
    margin-bottom: 24px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  header {
    max-width: 760px;
    margin: 0 auto 28px;
    text-align: center;
  }
  h1 {
    margin: 8px 0 14px;
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 550;
    letter-spacing: -0.04em;
  }
  header p {
    color: #5c5a56;
    line-height: 1.6;
  }
  .t79-local {
    font-size: 0.9rem;
  }
  .t79-tool {
    display: grid;
    grid-template-columns: minmax(250px, 340px) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }
  .t79-controls,
  .t79-preview {
    border: 1px solid #1c1a1724;
    border-radius: 12px;
    background: #fff;
    padding: 24px;
  }
  .t79-controls {
    display: grid;
    gap: 14px;
  }
  .t79-controls h2 {
    margin: 0;
    font-size: 1.2rem;
  }
  .t79-scope {
    margin: 0;
    color: #5c5a56;
    font-size: 0.88rem;
    line-height: 1.5;
  }
  .t79-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .t79-primary,
  .t79-secondary,
  .t79-download {
    display: inline-flex;
    min-height: 42px;
    align-items: center;
    justify-content: center;
    border: 1px solid #1c1a17;
    border-radius: 24px;
    padding: 8px 18px;
    background: #1c1a17;
    color: white;
    cursor: pointer;
    text-align: center;
  }
  .t79-primary:disabled {
    opacity: 0.55;
    cursor: wait;
  }
  .t79-secondary,
  .t79-download {
    background: white;
    color: #1c1a17;
  }
  .t79-error {
    margin: 0;
    color: #a32020;
  }
  .t79-faq {
    margin: 40px auto 0;
  }
  .t79-faq nav {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 18px;
  }
  .t79-preview {
    min-height: 420px;
    display: grid;
    place-items: center;
    overflow: auto;
    background-color: #f6f4f0;
  }
  .t79-preview p {
    color: #5c5a56;
    text-align: center;
  }
  .t79-preview img {
    display: block;
    max-width: 100%;
    max-height: 70vh;
    object-fit: contain;
    image-rendering: pixelated;
  }
  @media (max-width: 760px) {
    .t79-tool {
      grid-template-columns: 1fr;
    }
    .t79-preview {
      min-height: 280px;
    }
  }
</style>
