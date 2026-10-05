<script lang="ts">
  /**
   * T18 HTML / URL → Image — README §4.1, §15, PLAN.md P6-01.
   *
   * The pasted-HTML half is genuinely local: the engine parses the document, lays it out, and
   * this component rasterizes it with a canvas text blitter. No script runs, nothing is fetched,
   * and images are reported as omitted rather than silently dropped.
   *
   * The URL half is *not* available, and saying so plainly is the correct behaviour rather than a
   * gap. README §4.1 marks this tool "Local†" with the note that "a URL needs a Relay or
   * screenshot provider (§15)". The Relay's compiled-in destination allowlist
   * (`ALLOWED_DESTINATIONS` in `apps/relay`) contains only AI provider hosts — no screenshot
   * service — and `IMPLEMENTED_ADAPTER_IDS` in the engine holds only `openai` and `anthropic`,
   * neither of which captures a web page. Fetching an arbitrary URL from the page would also
   * mean either a CORS failure or a bypass of the browser's security model, neither of which
   * this project does. So the control is present, explains exactly why it cannot work here, and
   * points at the one supported alternative: paste the HTML.
   */
  import { onDestroy } from 'svelte';
  import {
    T18HtmlToImageOptionsSchema,
    t18HtmlToImageOptionDescriptions,
    type T18HtmlToImageOptions,
  } from '@complianttools/image-engine/schemas/p6-01-options';
  import {
    HTML_CARD_MAX_PIXELS,
    engineErrorMessage,
    isEngineError,
    layoutHtmlCard,
    paintHtmlCardBackground,
    parseHtmlBlocks,
    type HtmlCardWarning,
  } from '@complianttools/image-engine';
  import GeneratedControls from './GeneratedControls.svelte';
  import { localizeOptions, type Locale } from './i18n';

  type ErrorKind = 'invalid-html' | 'canvas-unavailable' | 'output-too-large' | 'render-failed';

  const MAX_SOURCE_CHARS = 200_000;
  const ORIGIN = 'https://image.complianttools.com';

  const enText = {
    title: 'HTML / URL to Image',
    eyebrow: 'Local convert and export',
    description:
      'Paste HTML and CSS and render it to a PNG entirely in your browser. The renderer parses the document, lays out its text, and paints it locally — it never executes script, never fetches a remote asset, and reports anything it had to leave out. Capturing a live URL is not available here; see the note below.',
    metaDescription:
      'Render pasted HTML and CSS to a PNG locally in your browser, with width, padding, font size, and colour controls. No script runs and nothing is uploaded.',
    privacy:
      'The pasted markup never leaves this browser. Rendering runs locally and nothing is uploaded.',
    inputHeading: 'Paste your HTML',
    inputLabel: 'HTML source',
    htmlPlaceholder: '<h1>Hello</h1>\n<p>Rendered locally.</p>',
    inputHelp:
      'Text, headings, colours, fonts sizes, padding, and alignment are rendered. Images, script, frames, flexbox, grid, and web fonts are not — the renderer says which it dropped.',
    urlHeading: 'Capturing a URL',
    urlInput: 'Page URL',
    urlPlaceholder: 'https://example.com',
    urlHelp:
      'Not available in this build. Capturing a live page needs a screenshot provider reached through the Relay, and no screenshot provider is in the Relay’s allowlist — only AI model endpoints are. Fetching the URL directly from this page would fail CORS on most sites or require bypassing the browser’s security controls, so neither is done. Paste the page’s HTML and CSS above instead, which renders fully locally.',
    render: 'Render image',
    busy: 'Rendering locally…',
    ready: 'Paste some HTML to begin.',
    previewHeading: 'Rendered image',
    previewAlt: 'The image rendered from the pasted HTML',
    download: 'Download PNG',
    dimensions: 'Dimensions',
    blocks: 'blocks',
    rendered: 'Rendered {width}×{height} from {blocks} block(s) ({bytes} bytes).',
    fidelity: 'The preview and the download are the same encoded PNG bytes.',
    warningHeading: 'What the renderer left out',
    noWarnings: 'Everything in the pasted markup was rendered.',
    faqHeading: 'Questions about HTML to image',
    faqUrl: 'Why can’t I paste a URL?',
    faqUrlAnswer:
      'Capturing a live page needs a screenshot provider reached through the Relay, and none is configured. Fetching the URL from this page would either fail CORS or require bypassing the browser’s security controls. Paste the HTML and CSS instead — that path is fully local.',
    faqSafe: 'Is the pasted HTML safe?',
    faqSafeAnswer:
      'Yes. The renderer walks the markup as text: script, style, and frame contents are discarded rather than executed, remote images are never fetched, and nothing is sent anywhere.',
    faqLimits: 'What does the renderer support?',
    faqLimitsAnswer:
      'Block and inline text, headings, colours, font sizes and weights, padding, margins, alignment, max-width, and a style block with element and class selectors. It is not a browser: flexbox, grid, floats, tables, transforms, and web fonts are not implemented, and each one it meets is reported.',
    faqPrivacy: 'Is anything uploaded?',
    faqPrivacyAnswer: 'No. Parsing, layout, and PNG encoding all run in this browser.',
    related: 'Related tools',
    maker: 'GIF maker',
    errors: {
      'invalid-html': 'The pasted markup could not be parsed into any renderable content.',
      'canvas-unavailable': 'The browser could not create a local image canvas.',
      'output-too-large':
        'The rendered image would exceed the 16 megapixel area limit. Use a smaller width or padding.',
      'render-failed': 'The image could not be rendered from this markup.',
    },
    remedies: {
      'invalid-html': 'Paste a fragment with at least one heading or paragraph inside it.',
      'canvas-unavailable': 'Try a browser with local 2D canvas support.',
      'output-too-large': 'Reduce the output width or the padding, then render again.',
      'render-failed': 'Simplify the markup and try again. Nothing was uploaded or changed.',
    },
  } as const;

  type TextKey = Exclude<keyof typeof enText, 'errors' | 'remedies'>;
  type LocalizedCopy = Record<TextKey, string> & {
    errors: Record<ErrorKind, string>;
    remedies: Record<ErrorKind, string>;
  };

  const arText: LocalizedCopy = {
    title: 'تحويل HTML / URL إلى صورة',
    eyebrow: 'تحويل وتصدير محلي',
    description:
      'الصق HTML وCSS واعرضهما كصورة PNG بالكامل في متصفحك. يحلل المحرك المستند ويخطيط نصه ويرسمه محليًا — لا ينفّذ أي نص برمجي، ولا يجلب أي أصل بعيد، ويذكر كل ما اضطر إلى تجاهله. التقاط رابط حي غير متاح هنا؛ انظر الملاحظة أدناه.',
    metaDescription:
      'اعرض HTML وCSS الملصوقين كصورة PNG محليًا في متصفحك، مع تحكم في العرض والحشو وحجم الخط والألوان. لا يُنفّذ نص برمجي ولا يُرفع شيء.',
    privacy: 'لا يغادر الترميز الملصق هذا المتصفح. يجري العرض محليًا ولا يُرفع شيء.',
    inputHeading: 'الصق كود HTML',
    inputLabel: 'مصدر HTML',
    htmlPlaceholder: '<h1>مرحبًا</h1>\n<p>معروض محليًا.</p>',
    inputHelp:
      'تُعرض النصوص والعناوين والألوان وأحجام الخطوط والحشو والمحاذاة. لا تُعرض الصور ولا النصوص البرمجية ولا الإطارات ولا flexbox ولا grid ولا خطوط الويب — ويذكر المُصيّر ما تجاهله.',
    urlHeading: 'التقاط رابط',
    urlInput: 'رابط الصفحة',
    urlPlaceholder: 'https://example.com',
    urlHelp:
      'غير متاح في هذه النسخة. التقاط صفحة حية يحتاج مزوّد لقطات شاشة يُوصل عبر Relay، ولا يوجد مزوّد لقطات في قائمة سماح Relay — فهي تضم نقاط نهاية مزوّدي الذكاء الاصطناعي فقط. أما جلب الرابط مباشرة من هذه الصفحة فيفشل مع CORS في معظم المواقع أو يتطلب تجاوز ضوابط أمان المتصفح، ولا يُجرى أيٌّ منهما. الصق كود HTML وCSS للصفحة أعلاه بدلًا من ذلك، فيُعرض محليًا بالكامل.',
    render: 'اعرض الصورة',
    busy: 'جارٍ العرض محليًا…',
    ready: 'الصق كود HTML للبدء.',
    previewHeading: 'الصورة المعروضة',
    previewAlt: 'الصورة المعروضة من كود HTML الملصوق',
    download: 'تنزيل PNG',
    dimensions: 'الأبعاد',
    blocks: 'كتلة',
    rendered: 'عُرضت {width}×{height} من {blocks} كتلة ({bytes} بايت).',
    fidelity: 'المعاينة والتنزيل هما بايتات PNG المرمّزة نفسها.',
    warningHeading: 'ما استبعده المُصيّر',
    noWarnings: 'عُرض كل شيء في الترميز الملصوق.',
    faqHeading: 'أسئلة حول تحويل HTML إلى صورة',
    faqUrl: 'لماذا لا أستطيع لصق رابط؟',
    faqUrlAnswer:
      'التقاط صفحة حية يحتاج مزوّد لقطات شاشة عبر Relay، ولا يوجد أي مزوّد مُهيأ. أما جلب الرابط من هذه الصفحة فيفشل مع CORS أو يتطلب تجاوز ضوابط أمان المتصفح. الصق كود HTML وCSS بدلًا من ذلك — فذلك المسار محلي بالكامل.',
    faqSafe: 'هل الترميز الملصوق آمن؟',
    faqSafeAnswer:
      'نعم. يمشي المُصيّر في الترميز معاملًا كنص: يُطرح محتوى النص البرمجي والتنسيق والإطارات بدلًا من تنفيذه، ولا تُجلب الصور البعيدة أبدًا، ولا يُرسل شيء إلى أي مكان.',
    faqLimits: 'ما الذي يدعمه المُصيّر؟',
    faqLimitsAnswer:
      'النصوص الكتلية والداخلية، والعناوين، والألوان، وأحجام الخطوط ودرجاتها، والحشو والهوامش والمحاذاة والعرض الأقصى، وكتلة تنسيق بمحددات العناصر والأصناف. ليس متصفحًا: لا يُنفَّذ flexbox ولا grid ولا الطفو ولا الجداول ولا التحويلات ولا خطوط الويب، وكل واحد منها يُذكر عند遇到了ه.',

    faqPrivacy: 'هل يُرفع شيء؟',
    faqPrivacyAnswer: 'لا. يجري التحليل والتخطيط وترميز PNG في هذا المتصفح.',
    related: 'أدوات ذات صلة',
    maker: 'منشئ GIF',
    errors: {
      'invalid-html': 'تعذر تحليل الترميز الملصوق إلى أي محتوى قابل للعرض.',
      'canvas-unavailable': 'تعذر على المتصفح إنشاء لوحة صور محلية.',
      'output-too-large':
        'ستتجاوز الصورة المعروضة حد المساحة البالغ 16 megapixel. استخدم عرضًا أو حشوًا أصغر.',
      'render-failed': 'تعذر إنتاج الصورة من هذا الترميز.',
    },
    remedies: {
      'invalid-html': 'الصق مقطعًا يحتوي على عنوان أو فقرة واحدة على الأقل.',
      'canvas-unavailable': 'جرّب متصفحًا يدعم لوحة 2D محلية.',
      'output-too-large': 'قلّل عرض الإخراج أو الحشو ثم أعد العرض.',
      'render-failed': 'بسّط الترميز ثم أعد المحاولة. لم يُرفع شيء ولم يتغيّر شيء.',
    },
  };

  let { locale = 'en' }: { locale?: Locale } = $props();

  let source = $state('<h1>Hello from ctimg</h1>\n<p>Rendered locally.</p>');
  let urlInput = $state('');
  let options = $state<T18HtmlToImageOptions>(T18HtmlToImageOptionsSchema.parse({}));
  let previewUrl = $state('');
  let outputBytes = $state(0);
  let outputDimensions = $state({ width: 0, height: 0 });
  let blockCount = $state(0);
  let warnings = $state<readonly HtmlCardWarning[]>([]);
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
  const path = $derived(locale === 'en' ? '/html-to-image' : `/${locale}/html-to-image`);
  const canonical = $derived(`${ORIGIN}${path}`);
  const faq = $derived([
    { question: tr('faqUrl'), answer: tr('faqUrlAnswer') },
    { question: tr('faqSafe'), answer: tr('faqSafeAnswer') },
    { question: tr('faqLimits'), answer: tr('faqLimitsAnswer') },
    { question: tr('faqPrivacy'), answer: tr('faqPrivacyAnswer') },
  ]);
  const localizedOptionDescriptions = $derived(
    localizeOptions(locale, t18HtmlToImageOptionDescriptions),
  );
  const optionValues = $derived({
    't18.width': options.width,
    't18.padding': options.padding,
    't18.fontSize': options.fontSize,
    't18.background': options.background,
    't18.color': options.color,
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
          { '@type': 'ListItem', position: 1, name: tr('related'), item: `${ORIGIN}/gif-maker` },
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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    outputBytes = 0;
    outputDimensions = { width: 0, height: 0 };
    warnings = [];
  }

  function updateOption(path: string, value: unknown) {
    const key = path.startsWith('t18.') ? path.slice(4) : path;
    const parsed = T18HtmlToImageOptionsSchema.safeParse({ ...options, [key]: value });
    if (parsed.success) {
      options = parsed.data;
      clearOutput();
      status = '';
      error = undefined;
    }
  }

  function updateSource(event: Event) {
    source = (event.currentTarget as HTMLTextAreaElement).value;
    clearOutput();
    status = '';
    error = undefined;
  }

  async function renderCard() {
    if (source.trim() === '') {
      error = 'invalid-html';
      return;
    }
    if (source.length > MAX_SOURCE_CHARS) {
      error = 'invalid-html';
      return;
    }

    clearOutput();
    error = undefined;
    status = '';
    busy = true;
    try {
      const { blocks, warnings: reported } = parseHtmlBlocks(source, options.fontSize);
      if (blocks.length === 0) throw 'invalid-html' satisfies ErrorKind;

      // Text metrics come from a canvas 2D context: the engine stays DOM-free by taking the
      // measurer as a parameter, and this is the browser's real font metrics rather than an
      // approximation that would misplace every line.
      const measureCanvas = document.createElement('canvas');
      const measureContext = measureCanvas.getContext('2d');
      if (!measureContext) throw 'canvas-unavailable' satisfies ErrorKind;
      const family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      const measureText = (text: string, sizePx: number, bold: boolean): number => {
        measureContext.font = `${bold ? 'bold ' : ''}${sizePx}px ${family}`;
        return measureContext.measureText(text).width;
      };

      const layout = layoutHtmlCard(blocks, options, measureText);
      if (layout.width * layout.height > HTML_CARD_MAX_PIXELS)
        throw 'output-too-large' satisfies ErrorKind;

      const canvas = document.createElement('canvas');
      canvas.width = layout.width;
      canvas.height = layout.height;
      const context = canvas.getContext('2d');
      if (!context) throw 'canvas-unavailable' satisfies ErrorKind;

      const imageData = context.createImageData(layout.width, layout.height);
      imageData.data.set(paintHtmlCardBackground(layout));
      context.putImageData(imageData, 0, 0);

      context.textBaseline = 'alphabetic';
      for (const run of layout.runs) {
        context.fillStyle = run.color;
        context.font = `${run.bold ? 'bold ' : ''}${run.sizePx}px ${family}`;
        context.fillText(run.text, run.x, run.y);
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject('render-failed' satisfies ErrorKind)),
          'image/png',
        );
      });

      previewUrl = URL.createObjectURL(blob);
      outputBytes = blob.size;
      outputDimensions = { width: layout.width, height: layout.height };
      blockCount = blocks.length;
      warnings = reported;
      status = `${localized(tr('rendered'))
        .replace('{width}', String(layout.width))
        .replace('{height}', String(layout.height))
        .replace('{blocks}', String(blocks.length))
        .replace('{bytes}', String(blob.size))} ${localized(tr('fidelity'))}`;
    } catch (cause) {
      if (typeof cause === 'string' && cause in enText.errors) error = cause as ErrorKind;
      else if (isEngineError(cause)) {
        error = cause.kind === 'dimension-limit' ? 'output-too-large' : 'render-failed';
        status = engineErrorMessage(cause);
      } else error = 'render-failed';
    } finally {
      busy = false;
    }
  }

  onDestroy(clearOutput);
</script>

<svelte:head>
  <title>{tr('title')} — Image Compliant Tools</title>
  <meta name="description" content={tr('metaDescription')} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${ORIGIN}/html-to-image`} />
  <link rel="alternate" hreflang="en-XA" href={`${ORIGIN}/en-XA/html-to-image`} />
  <link rel="alternate" hreflang="ar" href={`${ORIGIN}/ar/html-to-image`} />
  <link rel="alternate" hreflang="x-default" href={`${ORIGIN}/html-to-image`} />
  <meta property="og:title" content={tr('title')} />
  <meta property="og:description" content={tr('metaDescription')} />
  <meta property="og:image" content={`${ORIGIN}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={`${ORIGIN}/og/tools.svg`} />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(schema)}</svelte:element
  >
</svelte:head>

<main class="tool-page t18-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <header class="tool-intro">
    <p class="eyebrow">{tr('eyebrow')}</p>
    <h1>{tr('title')}</h1>
    <p>{tr('description')}</p>
    <p class="privacy-copy">{tr('privacy')}</p>
  </header>

  <section class="t18-controls" aria-labelledby="t18-input-heading">
    <h2 id="t18-input-heading">{tr('inputHeading')}</h2>
    <label class="t18-source">
      <span>{tr('inputLabel')}</span>
      <textarea
        data-testid="t18-input"
        rows="10"
        spellcheck="false"
        placeholder={tr('htmlPlaceholder')}
        value={source}
        oninput={updateSource}></textarea>
    </label>
    <p class="t18-help">{tr('inputHelp')}</p>

    <section class="t18-url" aria-labelledby="t18-url-heading">
      <h3 id="t18-url-heading">{tr('urlHeading')}</h3>
      <label>
        <span>{tr('urlInput')}</span>
        <input
          data-testid="t18-url"
          type="url"
          inputmode="url"
          placeholder={tr('urlPlaceholder')}
          bind:value={urlInput}
          disabled
          aria-describedby="t18-url-help"
        />
      </label>
      <p id="t18-url-help" class="t18-help" data-testid="t18-url-help">{tr('urlHelp')}</p>
    </section>

    <GeneratedControls
      descriptions={localizedOptionDescriptions}
      values={{ ...optionValues }}
      onChange={updateOption}
      {locale}
    />

    <div class="t18-actions">
      <button
        class="button primary"
        data-testid="t18-run"
        type="button"
        disabled={busy}
        onclick={() => void renderCard()}>{tr('render')}</button
      >
    </div>
    {#if busy}<p role="status" aria-live="polite">{tr('busy')}</p>
    {:else if status}<p role="status" aria-live="polite" data-testid="t18-status">{status}</p>
    {:else}<p role="status" aria-live="polite">{tr('ready')}</p>{/if}
    {#if error}
      <p class="t18-error" role="alert" data-error-kind={error} data-testid="t18-error">
        {errorText(error)}
      </p>
    {/if}
  </section>

  {#if previewUrl}
    <section class="t18-result" aria-labelledby="t18-preview-heading">
      <h2 id="t18-preview-heading">{tr('previewHeading')}</h2>
      <img data-testid="t18-preview" src={previewUrl} alt={tr('previewAlt')} />
      <p class="t18-metrics">
        {tr('dimensions')}: {outputDimensions.width} × {outputDimensions.height} · {outputBytes} bytes
        · {blockCount}
        {tr('blocks')}
      </p>
      <p class="t18-fidelity">{tr('fidelity')}</p>
      <a
        class="button primary t18-download"
        data-testid="t18-download"
        href={previewUrl}
        download="html-card.png">{tr('download')}</a
      >

      <section class="t18-warnings" aria-labelledby="t18-warnings-heading">
        <h3 id="t18-warnings-heading">{tr('warningHeading')}</h3>
        {#if warnings.length === 0}
          <p class="t18-help" data-testid="t18-no-warnings">{tr('noWarnings')}</p>
        {:else}
          <ul data-testid="t18-warnings">
            {#each warnings as warning (warning.feature)}
              <li><strong>{warning.feature}</strong>: {localized(warning.detail)}</li>
            {/each}
          </ul>
        {/if}
      </section>
    </section>
  {/if}

  <section class="tool-completion t18-faq" aria-labelledby="t18-faq-heading">
    <h2 id="t18-faq-heading">{tr('faqHeading')}</h2>
    {#each faq as item (item.question)}<details>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>{/each}
    <nav aria-label={tr('related')}>
      <a href={locale === 'en' ? '/gif-maker' : `/${locale}/gif-maker`}>{tr('maker')}</a>
    </nav>
  </section>
</main>

<style>
  .t18-controls,
  .t18-result,
  .t18-faq {
    width: min(1080px, calc(100% - 32px));
    margin: 0 auto 40px;
  }
  .t18-controls {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: white;
  }
  .t18-controls h2,
  .t18-result h2 {
    margin-block-start: 0;
  }
  .t18-source {
    display: grid;
    gap: 8px;
  }
  .t18-source > span {
    font-weight: 600;
  }
  .t18-source textarea {
    width: 100%;
    padding: 12px;
    font:
      0.95rem/1.45 ui-monospace,
      SFMono-Regular,
      Consolas,
      monospace;
    border: 1px solid #1c1a1720;
    border-radius: 8px;
    resize: vertical;
  }
  .t18-help {
    color: #5c5a56;
    font-size: 13px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
  .t18-url {
    margin: 24px 0;
    padding: 16px;
    border: 1px solid #1c1a1720;
    border-radius: 8px;
    background: #faf9f7;
  }
  .t18-url h3 {
    margin-block-start: 0;
  }
  .t18-url label {
    display: grid;
    gap: 6px;
  }
  .t18-url input {
    max-width: 420px;
    padding: 8px;
  }
  .t18-actions {
    margin-block-start: 16px;
  }
  .t18-result {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: #fff;
  }
  .t18-result img {
    display: block;
    width: 100%;
    max-width: 720px;
    height: auto;
    border: 1px solid #1c1a1720;
  }
  .t18-metrics {
    font-variant-numeric: tabular-nums;
  }
  .t18-download {
    display: inline-block;
    margin-block-start: 8px;
  }
  .t18-warnings {
    margin-block-start: 24px;
    padding: 16px;
    border: 1px solid #1c1a1720;
    border-radius: 8px;
    background: #fffaf0;
  }
  .t18-warnings h3 {
    margin-block-start: 0;
  }
  .t18-warnings ul {
    margin: 0;
    padding-inline-start: 20px;
    font-size: 14px;
    line-height: 1.6;
  }
  .t18-error {
    padding: 12px;
    border-inline-start: 4px solid #a21f17;
    color: #7c1711;
    background: #fff1ef;
  }
  @media (max-width: 700px) {
    .t18-controls,
    .t18-result {
      padding: 16px;
    }
  }
</style>
