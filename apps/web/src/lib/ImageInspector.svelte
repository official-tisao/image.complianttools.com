<script lang="ts">
  import {
    engineErrorMessage,
    isEngineError,
    withTypedEngineErrors,
  } from '@complianttools/image-engine/errors';
  import {
    readContainerMetadata,
    type MetadataTag,
  } from '@complianttools/image-engine/metadata/container';
  import {
    inspectImageContainer,
    type ImageInspection,
  } from '@complianttools/image-engine/metadata/inspect';
  import ToolPageCompletion from './ToolPageCompletion.svelte';
  import { translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const title = $derived(t('inspector.title', 'Image Inspector'));
  const metaDescription = $derived(
    t(
      'inspector.metaDescription',
      'Inspect image dimensions, colour, depth, alpha, animation, structure, and metadata locally.',
    ),
  );
  const seoFaqs = $derived([
    {
      question: t('seo.localQuestion', 'Does my file leave this device?'),
      answer: t(
        'seo.localAnswer',
        'No. The file is read and processed locally in your browser without an upload.',
      ),
    },
    {
      question: t('inspector.faqEstimate', 'Are the quality and entropy figures exact?'),
      answer: t(
        'inspector.faqEstimateAnswer',
        'Entropy is a bounded sample and JPEG quality is inferred from quantization tables; both are clearly labelled as estimates.',
      ),
    },
    {
      question: t('inspector.faqFormats', 'Which formats receive full container inspection?'),
      answer: t(
        'inspector.faqFormatsAnswer',
        'PNG, JPEG, GIF, and WebP currently receive complete deterministic inspection. Other formats fail with an actionable message.',
      ),
    },
  ]);

  let details = $state<{
    name: string;
    type: string;
    bytes: number;
    inspection: ImageInspection;
  }>();
  let tags = $state<readonly MetadataTag[]>([]);
  let error = $state('');

  async function inspect(file: File | undefined) {
    details = undefined;
    tags = [];
    error = '';
    if (!file) return;
    try {
      const input = await file.arrayBuffer();
      const inspection = withTypedEngineErrors(
        t('inspector.failure', 'Image inspection failed'),
        t('inspector.remedy', 'Choose a valid PNG, JPEG, GIF, or WebP image and try again.'),
        () => inspectImageContainer(input),
      );
      details = {
        bytes: file.size,
        inspection,
        name: file.name,
        type: file.type,
      };
      try {
        tags = readContainerMetadata(input).tags;
      } catch {
        // Pixel dimensions remain useful for formats without a currently supported metadata reader.
      }
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : t('inspector.unable', 'Unable to inspect this image.');
    }
  }
</script>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}
    >{t('inspector.back', '← Convert')}</a
  >
  <h1>{t('inspector.title', 'Image Inspector')}</h1>
  <p>
    {t(
      'inspector.description',
      'Inspect dimensions, colour, depth, alpha, animation, container structure, and supported metadata locally. Your file is never uploaded.',
    )}
  </p>
  <label for="inspector-file-input"
    >{t('inspector.choose', 'Choose an image')}
    <input
      id="inspector-file-input"
      type="file"
      accept="image/*"
      onchange={(event) => void inspect(event.currentTarget.files?.[0])}
    /></label
  >
  {#if details}
    <dl>
      <dt>{t('inspector.name', 'Name')}</dt>
      <dd>{details.name}</dd>
      <dt>{t('inspector.type', 'Type')}</dt>
      <dd>{details.type || t('inspector.unknown', 'unknown')}</dd>
      <dt>{t('inspector.size', 'Size')}</dt>
      <dd>{details.bytes} bytes</dd>
      <dt>{t('inspector.dimensions', 'Dimensions')}</dt>
      <dd>{details.inspection.width} × {details.inspection.height} px</dd>
      <dt>{t('inspector.aspect', 'Aspect ratio')}</dt>
      <dd>{details.inspection.width}:{details.inspection.height}</dd>
      <dt>{t('inspector.dpi', 'DPI')}</dt>
      <dd>
        {details.inspection.dpi
          ? `${details.inspection.dpi.x} × ${details.inspection.dpi.y}`
          : t('inspector.notDeclared', 'Not declared')}
      </dd>
      <dt>{t('inspector.colour', 'Colour space')}</dt>
      <dd>{details.inspection.colorSpace}</dd>
      <dt>{t('inspector.depth', 'Bit depth')}</dt>
      <dd>{details.inspection.bitDepth ?? t('inspector.unknown', 'Unknown')}</dd>
      <dt>{t('inspector.channels', 'Channels')}</dt>
      <dd>{details.inspection.channels ?? t('inspector.unknown', 'Unknown')}</dd>
      <dt>{t('inspector.alpha', 'Alpha')}</dt>
      <dd>
        {details.inspection.hasAlpha === null
          ? t('inspector.unknown', 'Unknown')
          : details.inspection.hasAlpha
            ? t('inspector.yes', 'Yes')
            : t('inspector.no', 'No')}
      </dd>
      <dt>{t('inspector.animation', 'Animation')}</dt>
      <dd>
        {details.inspection.animated
          ? `${t('inspector.yes', 'Yes')} (${t(
              'inspector.frames',
              '{value} frames',
              details.inspection.frameCount,
            )})`
          : t('inspector.no', 'No')}
      </dd>
      <dt>{t('inspector.entropy', 'Byte entropy')}</dt>
      <dd>
        {details.inspection.entropyBitsPerByte.toFixed(3)}
        {t('inspector.bitsPerByte', 'bits/byte')} ({t('inspector.estimate', 'estimate')})
      </dd>
      <dt>{t('inspector.quality', 'JPEG quality')}</dt>
      <dd>
        {details.inspection.estimatedQuality === null
          ? t('inspector.notApplicable', 'Not applicable or unavailable')
          : `${details.inspection.estimatedQuality}% (${t('inspector.estimate', 'estimate')})`}
      </dd>
    </dl>
    <h2>{t('inspector.structure', 'Chunk / segment dump')}</h2>
    <ol>
      {#each details.inspection.structures as structure, index (`${index}:${structure}`)}<li>
          {structure}
        </li>{/each}
    </ol>
    {#if tags.length}
      <h2>{t('inspector.metadata', 'Supported metadata')}</h2>
      <ul>
        {#each tags as tag (`${tag.namespace}:${tag.name}:${tag.value}`)}<li>
            {tag.namespace}: {tag.name} — {tag.value}
          </li>{/each}
      </ul>
    {/if}
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
  <ToolPageCompletion
    {locale}
    route="image-info"
    {title}
    description={metaDescription}
    formatNote={t(
      'inspector.formatNote',
      'The inspector parses PNG, JPEG, GIF, and WebP structure and reports dimensions, depth, alpha, animation, entropy, and supported metadata.',
    )}
    faqs={seoFaqs}
  />
</main>
