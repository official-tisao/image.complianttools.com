<script lang="ts">
  import { translate, type Locale } from './i18n';

  type Faq = { readonly question: string; readonly answer: string };
  let {
    locale,
    route,
    title,
    description,
    formatNote,
    faqs,
  }: {
    locale: Locale;
    route: string;
    title: string;
    description: string;
    formatNote: string;
    faqs: readonly Faq[];
  } = $props();

  const origin = 'https://image.complianttools.com';
  const canonical = $derived(`${origin}${locale === 'en' ? '' : `/${locale}`}/${route}`);
  const jsonLd = $derived({
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
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Tools', item: origin },
          { '@type': 'ListItem', position: 2, name: title, item: canonical },
        ],
      },
    ],
  });
  const localized = (path: string) => (locale === 'en' ? path : `/${locale}${path}`);
</script>

<svelte:head>
  <title>{title} — Image Compliant Tools</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${origin}/${route}`} />
  <link rel="alternate" hreflang="en-XA" href={`${origin}/en-XA/${route}`} />
  <link rel="alternate" hreflang="ar" href={`${origin}/ar/${route}`} />
  <link rel="alternate" hreflang="x-default" href={`${origin}/${route}`} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={`${origin}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={`${origin}/og/tools.svg`} />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(jsonLd)}</svelte:element
  >
</svelte:head>

<section class="tool-completion" aria-labelledby={`${route}-questions`}>
  <h2 id={`${route}-questions`}>
    {translate(locale, 'seo.questions', 'Questions about this tool')}
  </h2>
  <p>{formatNote}</p>
  {#each faqs as faq (faq.question)}
    <details>
      <summary>{faq.question}</summary>
      <p>{faq.answer}</p>
    </details>
  {/each}
  <nav aria-label={translate(locale, 'seo.related', 'Related tools and guides')}>
    <a href={localized('/convert')}>{translate(locale, 'nav.convert', 'Convert')}</a>
    <a href={localized('/exif-viewer')}
      >{translate(locale, 'seo.metadataViewer', 'Metadata viewer')}</a
    >
    <a href={localized('/remove-exif')}
      >{translate(locale, 'seo.metadataRemover', 'Metadata remover')}</a
    >
    <a href={localized('/image-info')}
      >{translate(locale, 'seo.imageInspector', 'Image inspector')}</a
    >
    <a href={localized('/compress')}>{translate(locale, 'nav.compress', 'Compress')}</a>
    <a href="/docs/formats/jpeg">{translate(locale, 'nav.jpegGuide', 'JPEG guide')}</a>
  </nav>
</section>

<style>
  .tool-completion {
    margin-block-start: 2rem;
  }
  details {
    margin-block: 0.75rem;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    margin-block-start: 1.25rem;
  }
</style>
