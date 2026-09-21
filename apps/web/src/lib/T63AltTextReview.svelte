<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    T63_ALT_TEXT_MAX_LENGTH,
    T63AltTextReviewOptionsSchema,
    t63AltTextReviewOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import { previewAltTextAttribute } from '@complianttools/image-engine/ops/alt-text-review';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { translateT63, localizeT63Options } from './t63I18n';
  import type { Locale } from './i18n';

  type FileErrorKind = 'unsupported-file' | 'file-too-large' | 'image-too-large' | 'decode-failed';
  type SourceImage = {
    readonly file: File;
    readonly url: string;
    readonly width: number;
    readonly height: number;
  };

  const ORIGIN = 'https://image.complianttools.com';
  const MAX_FILE_BYTES = 16 * 1024 * 1024;
  const MAX_IMAGE_PIXELS = 6_000_000;
  const acceptedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];

  let { locale = 'en' } = $props<{ locale?: Locale }>();
  let source = $state<SourceImage>();
  let altText = $state('');
  let options = $state(T63AltTextReviewOptionsSchema.parse({}));
  let fileError = $state<FileErrorKind>();
  let copyStatus = $state('');
  let selectionToken = 0;

  const t = (key: string, fallback: string, value?: string | number) =>
    translateT63(locale, key, fallback, value);
  const prefix = $derived(locale === 'en' ? '' : `/${locale}`);
  const title = $derived(t('t63.title', 'Alt Text Review'));
  const description = $derived(
    t(
      't63.description',
      'Draft concise alt text for a person to review. This tool does not generate descriptions.',
    ),
  );
  const metaDescription = $derived(
    t(
      't63.metaDescription',
      'Write and review alt text manually for a local image, then copy the resulting HTML attribute.',
    ),
  );
  const canonical = $derived(`${ORIGIN}${prefix}/alt-text`);
  const optionValues = $derived({
    't63.decorative': options.decorative,
    't63.purposeReviewed': options.purposeReviewed,
    't63.redundancyReviewed': options.redundancyReviewed,
    't63.essentialDetailReviewed': options.essentialDetailReviewed,
  });
  const optionDescriptions = $derived(
    localizeT63Options(locale, t63AltTextReviewOptionDescriptions),
  );
  const attributePreview = $derived(
    source
      ? previewAltTextAttribute(altText, options)
      : { ok: true as const, kind: 'empty' as const, attribute: '' as const },
  );
  const outputAttribute = $derived(attributePreview.ok ? attributePreview.attribute : '');
  const attributeError = $derived(
    attributePreview.ok
      ? undefined
      : {
          message: t(`t63.error.${attributePreview.error.kind}`, attributePreview.error.message),
          remedy: t(`t63.remedy.${attributePreview.error.kind}`, attributePreview.error.remedy),
          kind: attributePreview.error.kind,
        },
  );
  const faqs = $derived([
    {
      question: t('t63.faqAutomatic', 'Does this tool write alt text automatically?'),
      answer: t(
        't63.faqAutomaticAnswer',
        'No. A person reviews the image and writes the draft; this page does not use a model or image recognition.',
      ),
    },
    {
      question: t('t63.faqDecorative', 'When should I mark an image decorative?'),
      answer: t(
        't63.faqDecorativeAnswer',
        'Only when it adds no meaning beyond nearby text or layout. The generated attribute is alt="".',
      ),
    },
    {
      question: t('t63.faqPrivacy', 'Is my image uploaded?'),
      answer: t(
        't63.faqPrivacyAnswer',
        'No. Image preview and attribute copying run in this browser.',
      ),
    },
  ]);
  const structuredData = $derived({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: title,
        description: metaDescription,
        url: canonical,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map(({ question, answer }) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  });

  function clearSource() {
    if (source) URL.revokeObjectURL(source.url);
    source = undefined;
  }

  async function chooseImage(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    selectionToken += 1;
    const token = selectionToken;
    clearSource();
    fileError = undefined;
    copyStatus = '';
    altText = '';
    options = T63AltTextReviewOptionsSchema.parse({});

    if (!acceptedMimeTypes.includes(file.type)) {
      fileError = 'unsupported-file';
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      fileError = 'file-too-large';
      return;
    }

    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      if (token !== selectionToken) return;
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
        fileError = 'image-too-large';
        return;
      }
      source = {
        file,
        url: URL.createObjectURL(file),
        width: bitmap.width,
        height: bitmap.height,
      };
    } catch {
      if (token === selectionToken) fileError = 'decode-failed';
    } finally {
      bitmap?.close();
    }
  }

  function updateOption(path: string, value: unknown) {
    const optionNames = {
      't63.decorative': 'decorative',
      't63.purposeReviewed': 'purposeReviewed',
      't63.redundancyReviewed': 'redundancyReviewed',
      't63.essentialDetailReviewed': 'essentialDetailReviewed',
    } as const;
    const property = optionNames[path as keyof typeof optionNames];
    if (!property) return;
    const parsed = T63AltTextReviewOptionsSchema.safeParse({ ...options, [property]: value });
    if (!parsed.success) return;
    options = parsed.data;
    copyStatus = '';
  }

  async function copyAttribute() {
    if (!outputAttribute) return;
    try {
      await navigator.clipboard.writeText(outputAttribute);
      copyStatus = t('t63.copied', 'Attribute copied.');
    } catch {
      copyStatus = t('t63.copyError', 'Could not copy. Select the attribute and copy it manually.');
    }
  }

  function fileErrorMessage(kind: FileErrorKind) {
    const fallbacks: Record<FileErrorKind, readonly [string, string]> = {
      'unsupported-file': [
        'Choose a PNG, JPEG, or WebP image.',
        'Export a still PNG, JPEG, or WebP image and choose it again.',
      ],
      'file-too-large': ['The image exceeds 16 MiB.', 'Choose an image smaller than 16 MiB.'],
      'image-too-large': [
        'The image exceeds 6 megapixels.',
        'Choose an image of 6 megapixels or less.',
      ],
      'decode-failed': [
        'The browser could not decode this image.',
        'Export a valid image and choose it again.',
      ],
    };
    const [message, remedy] = fallbacks[kind];
    return {
      message: t(`t63.error.${kind}`, message),
      remedy: t(`t63.remedy.${kind}`, remedy),
    };
  }

  onDestroy(() => {
    selectionToken += 1;
    clearSource();
  });
</script>

<svelte:head>
  <title>{title} — ctimg</title>
  <meta name="description" content={metaDescription} />
  <meta property="og:title" content={`${title} — ctimg`} />
  <meta property="og:description" content={metaDescription} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${ORIGIN}/alt-text`} />
  <link rel="alternate" hreflang="en-XA" href={`${ORIGIN}/en-XA/alt-text`} />
  <link rel="alternate" hreflang="ar" href={`${ORIGIN}/ar/alt-text`} />
  <link rel="alternate" hreflang="x-default" href={`${ORIGIN}/alt-text`} />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(structuredData)}</svelte:element
  >
</svelte:head>

<header class="tool-header t63-header">
  <a class="logo" href="/">ctimg</a>
  <nav aria-label={t('t63.mainNavigation', 'Main navigation')}>
    <a href="/convert">{t('nav.convert', 'Convert')}</a>
    <a href="/resize">{t('nav.resize', 'Resize')}</a>
    <a href={`${prefix}/alt-text`} aria-current="page">{title}</a>
  </nav>
  <span class="privacy">{t('privacy.badge', 'Local only')}</span>
</header>

<main class="tool-page t63-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <section class="tool-intro">
    <p class="eyebrow">{t('t63.eyebrow', 'Manual accessibility aid')}</p>
    <h1>{title}</h1>
    <p>{description}</p>
    <p class="privacy-copy">
      {t(
        't63.privacy',
        'The image and draft stay in this browser. No upload or automated analysis.',
      )}
    </p>
  </section>

  <section class="t63-workspace" aria-labelledby="t63-review-heading">
    <h2 id="t63-review-heading">{t('t63.previewLabel', 'Image preview')}</h2>
    <label class="file-entry t63-file-entry">
      <span>{t('t63.chooseImage', 'Choose an image to review')}</span>
      <input
        data-testid="t63-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        aria-describedby="t63-file-help"
        onchange={chooseImage}
      />
    </label>
    <p id="t63-file-help" class="t63-help">
      {t('t63.fileHelp', 'Still PNG, JPEG, or WebP; up to 16 MiB and 6 megapixels.')}
    </p>

    {#if fileError}
      {@const issue = fileErrorMessage(fileError)}
      <p class="error" role="alert" data-testid="t63-file-error" data-error-kind={fileError}>
        {issue.message}<br /><strong>{t('t63.remedy', 'Remedy:')}</strong>
        {issue.remedy}
      </p>
    {/if}

    {#if source}
      <figure class="t63-preview">
        <img
          data-testid="t63-preview-image"
          src={source.url}
          alt={t('t63.previewAlt', 'Selected image for manual review')}
          width={source.width}
          height={source.height}
        />
        <figcaption>
          {t(
            't63.imageDimensions',
            'Image dimensions: {value}',
            `${source.width} × ${source.height}`,
          )}
        </figcaption>
      </figure>
    {/if}

    <div class="t63-draft">
      <h2>{t('t63.draftHeading', 'Write a draft')}</h2>
      {#if source}
        <h3>{t('t63.checklistHeading', 'Human review checklist')}</h3>
        <GeneratedControls
          descriptions={optionDescriptions}
          values={optionValues}
          onChange={updateOption}
          {locale}
        />
      {:else}
        <p>{t('t63.chooseBeforeDraft', 'Choose an image before drafting its alt text.')}</p>
      {/if}
      <label for="t63-alt-text">{t('t63.draftLabel', 'Alt text draft')}</label>
      <p id="t63-draft-help" class="t63-help">
        {t(
          't63.draftHelp',
          'Describe what a reader needs to understand in this page context; review it yourself.',
        )}
      </p>
      <textarea
        id="t63-alt-text"
        data-testid="t63-alt-text"
        maxlength={T63_ALT_TEXT_MAX_LENGTH}
        rows="4"
        disabled={!source || options.decorative}
        aria-describedby="t63-draft-help t63-character-count"
        value={altText}
        oninput={(event) => {
          altText = event.currentTarget.value;
          copyStatus = '';
        }}></textarea>
      <p id="t63-character-count" class="t63-help" data-testid="t63-character-count">
        {t('t63.characterCount', 'Characters: {value}/125', altText.length)}
      </p>
    </div>

    <section class="t63-attribute" aria-labelledby="t63-attribute-heading">
      <h2 id="t63-attribute-heading">{t('t63.attributeHeading', 'HTML attribute preview')}</h2>
      {#if attributeError}
        <p
          class="error"
          role="alert"
          data-testid="t63-draft-error"
          data-error-kind={attributeError.kind}
        >
          {attributeError.message}<br /><strong>{t('t63.remedy', 'Remedy:')}</strong>
          {attributeError.remedy}
        </p>
      {:else if outputAttribute}
        <code data-testid="t63-attribute">{outputAttribute}</code>
      {:else}
        <p data-testid="t63-attribute-empty">
          {t(
            't63.attributeEmpty',
            'Write a draft or mark the image decorative to preview its attribute.',
          )}
        </p>
      {/if}
      <button
        class="button"
        data-testid="t63-copy"
        type="button"
        disabled={!outputAttribute}
        onclick={copyAttribute}>{t('t63.copyAttribute', 'Copy attribute')}</button
      >
      {#if copyStatus}<p role="status" aria-live="polite">{copyStatus}</p>{/if}
    </section>
  </section>

  <section class="faq t63-faq">
    <h2>{t('t63.faqHeading', 'Questions about this tool')}</h2>
    {#each faqs as faq (faq.question)}
      <details>
        <summary>{faq.question}</summary>
        <p>{faq.answer}</p>
      </details>
    {/each}
  </section>

  <nav class="t63-related" aria-label={t('seo.related', 'Related tools and guides')}>
    <h2>{t('t63.related', 'Related tools')}</h2>
    <a href="/convert">{t('t63.linkConvert', 'Convert images')}</a>
    <a href="/image-info">{t('t63.linkInspector', 'Image inspector')}</a>
    <a href="/ocr">{t('t63.linkOcr', 'Read text')}</a>
    <a href="/compare">{t('t63.linkCompare', 'Compare images')}</a>
    <a href="/color-match">{t('t63.linkColor', 'Colour match')}</a>
    <a href="/exif-viewer">{t('t63.linkMetadata', 'Metadata viewer')}</a>
  </nav>
</main>

<style>
  .t63-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 68px;
  }
  .t63-header nav {
    display: flex;
    gap: 20px;
  }
  .t63-header nav a[aria-current='page'] {
    font-weight: 700;
    text-decoration-thickness: 2px;
  }
  .t63-workspace {
    display: grid;
    gap: 20px;
    max-width: 980px;
    margin: 0 auto;
    padding: 32px clamp(16px, 4vw, 56px);
  }
  .t63-workspace h2,
  .t63-related h2 {
    margin: 0;
    font-size: 20px;
  }
  .t63-file-entry {
    max-width: 560px;
  }
  .t63-help {
    color: #5c5a56;
    line-height: 1.5;
  }
  .t63-preview {
    margin: 0;
    padding: 16px;
    border: 1px solid #1c1a1720;
    border-radius: 8px;
    background: #ebe6de;
  }
  .t63-preview img {
    display: block;
    max-width: 100%;
    max-height: 480px;
    object-fit: contain;
    margin-inline: auto;
  }
  .t63-preview figcaption {
    margin-top: 10px;
    text-align: center;
  }
  .t63-draft,
  .t63-attribute {
    display: grid;
    gap: 12px;
  }
  .t63-draft textarea {
    width: 100%;
    min-height: 112px;
    padding: 12px;
    border: 1px solid #1c1a1740;
    border-radius: 6px;
    font: inherit;
  }
  .t63-attribute code {
    display: block;
    padding: 12px;
    overflow-wrap: anywhere;
    background: #ebe6de;
    border-radius: 6px;
  }
  .t63-related {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    max-width: 980px;
    margin: 48px auto;
    padding: 0 clamp(16px, 4vw, 56px);
  }
  .t63-related h2 {
    flex-basis: 100%;
  }
  .t63-faq {
    margin-top: 56px;
  }
  @media (max-width: 767px) {
    .t63-header nav {
      display: none;
    }
  }
</style>
