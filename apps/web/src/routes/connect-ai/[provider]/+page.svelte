<!--
  P5-14 — a single provider walkthrough page (README §17.3).

  The route exists so every provider has its own indexable URL and its own search description. All
  the content lives in `ProviderWalkthrough.svelte`, which every provider shares, so the second
  provider really does take thirty seconds instead of two minutes.
-->
<script lang="ts">
  import '../../../connect.css';
  import ProviderWalkthrough from '$lib/connect/ProviderWalkthrough.svelte';
  import { providerGuide, PROVIDER_GUIDES } from '$lib/connect/providers';
  import { SITE_ORIGIN } from '$lib/connect/content';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // `load` 404s on an unknown slug, so this is always defined. Read through `$derived` so a
  // client-side navigation between two provider pages updates the content rather than leaving the
  // first provider's name and canonical URL on screen.
  const guide = $derived(providerGuide(data.provider)!);

  // `$derived`, not a plain const: the head must follow a client-side navigation from one
  // provider to another instead of keeping the first provider's title and canonical URL.
  const title = $derived(`Connect ${guide.descriptor.name} — ctimg`);
  const description = $derived(
    `Set up ${guide.descriptor.name} for these image tools: create a key, paste it in, test the connection, and see what it unlocks. ${guide.bestFor} The key stays in your browser.`,
  );
  const canonical = $derived(`${SITE_ORIGIN}/connect-ai/${guide.slug}`);

  const jsonLd = $derived({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: `Connect ${guide.descriptor.name}`,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web',
        description,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Connect AI',
            item: `${SITE_ORIGIN}/connect-ai`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: guide.descriptor.name,
            item: canonical,
          },
        ],
      },
    ],
  });
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={`${SITE_ORIGIN}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(jsonLd)}</svelte:element
  >
</svelte:head>

<main
  class="connect-page"
  lang="en"
  dir="ltr"
  data-testid="provider-page"
  data-provider={guide.slug}
>
  <header class="connect-hero">
    <p class="eyebrow">BYOK provider walkthrough</p>
    <h1>{guide.descriptor.name}</h1>
    <p>{guide.bestFor}</p>
    <p>
      Four steps: create a key, paste it here, test the connection, and use what it unlocks. The key
      is used on this page and is not stored anywhere.
    </p>
    <div class="hero-actions">
      <a class="button primary" href="#step-1">Start at step 1</a>
      <a class="button" href={guide.descriptor.keysUrl}>Their key page</a>
      <a class="button" href="/connect-ai">All providers</a>
    </div>
  </header>

  <ProviderWalkthrough {guide} />

  <footer class="connect-section">
    <p>
      {#each PROVIDER_GUIDES.filter((g) => g.slug !== guide.slug) as other (other.slug)}
        <a href={`/connect-ai/${other.slug}`}>{other.descriptor.name}</a> ·
      {/each}
      <a href="/connect-ai">Back to the chooser</a>
    </p>
  </footer>
</main>
