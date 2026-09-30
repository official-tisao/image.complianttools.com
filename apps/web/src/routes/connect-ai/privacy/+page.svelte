<!--
  P5-14 — `/connect-ai/privacy` (README §17.4).

  §17.4's instruction is precise: present each provider's stated policy "as **their** claims,
  quoted, not our summary." That is a constraint about honesty rather than a style note. A
  paraphrase of someone's retention policy is our statement, not theirs, and it is the kind of
  paraphrase that goes quietly out of date. So the table reproduces each provider's own wording
  from its adapter descriptor, links to the document it came from, and dates the reading.

  What the page can state as fact is narrow and is stated once, at the top: the request goes from
  the browser to the provider and does not pass through us. Everything else is either their claim or
  ours about our own behaviour, and the page keeps those apart.

  The "checked" date is the day the descriptor's `dataPolicy` text was read out of the adapter
  source. It is not a nightly refresh — the job that would do that is P5-17 and is not running, and
  the page says so rather than implying the dates stay current.
-->
<script lang="ts">
  import '../../../connect.css';
  import { PROVIDER_GUIDES } from '$lib/connect/providers';
  import { SITE_ORIGIN } from '$lib/connect/content';
  import { SUBPAGES } from '$lib/connect/nav';
  import { VERIFIED_ON } from '$lib/connect/self-hosted';

  const title = 'What each AI provider says about your images — ctimg';
  const description =
    'Each provider’s own stated data-retention and training policy, quoted and linked, with the date it was read — plus the one thing that can be stated as fact: the request goes from your browser to them, not through us.';
  const canonical = `${SITE_ORIGIN}/connect-ai/privacy`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        headline: 'What each AI provider says about your images',
        description,
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
          { '@type': 'ListItem', position: 2, name: 'Privacy', item: canonical },
        ],
      },
    ],
  };
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

<main class="connect-page" lang="en" dir="ltr" data-testid="privacy">
  <header class="connect-hero">
    <p class="eyebrow">Their claims, not ours</p>
    <h1>What each provider says about your images</h1>
    <p>
      When you connect a provider, you are sending your image to a company. What they then do with
      it is governed by their policy, not by anything on this site, and those policies change
      without notice.
    </p>
    <p>
      So the table below quotes each provider’s own wording and links to the document it came from.
      We are not summarising someone else’s legal terms into a promise on their behalf.
    </p>
  </header>

  <!-- The one claim we can make as fact. -->
  <section class="connect-section" id="fact" aria-labelledby="fact-heading">
    <h2 id="fact-heading">The one thing we can state as fact</h2>
    <div class="connect-note" data-testid="privacy-fact">
      <strong>The request goes from your browser to them. It does not pass through us.</strong>
      This site is static files with no backend. When a tool calls a provider, the request is issued by
      your browser and delivered to that provider — there is no intermediate host that could copy, store,
      or examine it. You can verify this yourself: open the Network tab in your browser’s developer tools
      and watch where each request goes.
    </div>
    <p>
      If you run a model on your own machine instead, the request goes from your browser to
      <code>localhost</code>, and no company sees anything at all. See
      <a href="/connect-ai/self-hosted">running a model yourself</a>.
    </p>
  </section>

  <section class="connect-section" id="policies" aria-labelledby="policies-heading">
    <h2 id="policies-heading">Each provider’s stated policy</h2>
    <p class="connect-lede">
      Reproduced from each adapter’s own descriptor. Read the linked document for the authoritative
      version — the wording below is a pointer to it, not a substitute for it.
    </p>

    <!-- WCAG 2.1.1: a scrollable region must be keyboard-reachable. See ProviderTable.svelte. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="connect-scroll" tabindex="0" role="group" aria-labelledby="policies-heading">
      <table class="connect-table" data-testid="privacy-table">
        <caption>
          Each row is that provider’s own claim, with a link to the document it came from. Read it
          there.
        </caption>
        <thead>
          <tr>
            <th scope="col">Provider</th>
            <th scope="col">What they say</th>
            <th scope="col">Where they say it</th>
            <th scope="col">Checked</th>
          </tr>
        </thead>
        <tbody>
          {#each PROVIDER_GUIDES as guide (guide.slug)}
            <tr data-provider={guide.slug}>
              <th scope="row">
                <a href={`/connect-ai/${guide.slug}`}>{guide.descriptor.name}</a>
              </th>
              <td>
                “{guide.descriptor.dataPolicy.summary}”
                <span class="cell-note">Quoted from the provider’s own documentation.</span>
              </td>
              <td>
                <a href={guide.descriptor.dataPolicy.url}>Their policy</a>
              </td>
              <td>
                {VERIFIED_ON}
                <span class="cell-note">Read from the adapter source.</span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="connect-warning" data-testid="privacy-date-caveat">
      <strong>These dates are a reading, not a subscription</strong>
      Each date is when that provider’s wording was read out of the adapter source. There is no nightly
      job re-reading these policies — the one that would is still to be built, and the same applies to
      the browser-access data on the chooser table. A provider can change its policy tomorrow without
      this page changing at all, so the linked document is the source and this table is an index into
      it.
    </div>
  </section>

  <section class="connect-section" id="ours" aria-labelledby="ours-heading">
    <h2 id="ours-heading">What this site does, specifically</h2>
    <p class="connect-lede">Our own behaviour, which is the part we can actually be held to.</p>
    <dl class="connect-why">
      <div>
        <dt>No image reaches us</dt>
        <dd>
          Local tools never send a file anywhere. An AI tool sends the image to the provider you
          connected, and to nobody else. There is no upload endpoint on this site.
        </dd>
      </div>
      <div>
        <dt>No analytics, no third-party scripts</dt>
        <dd>
          Nothing here loads from another origin — no tag manager, no analytics, no script or font
          CDN. That is also why a provider request has nowhere else to go.
        </dd>
      </div>
      <div>
        <dt>Your key is used on the page and not stored</dt>
        <dd>
          The credential field holds the key in the page’s memory for the life of the tab. There is
          no saved list of connections yet, so nothing is written to storage and nothing survives a
          reload. Revoking a key happens at the provider, which is the only place a copy exists.
        </dd>
      </div>
      <div>
        <dt>A relay, if you deploy one, is yours</dt>
        <dd>
          The relay stores nothing and logs nothing, but it runs on a hosting platform that may
          record request metadata outside our control. <a href="/connect-ai/relay"
            >That page says exactly what.</a
          >
        </dd>
      </div>
    </dl>
  </section>

  <section class="connect-section" id="related">
    <h2>Related</h2>
    <div class="connect-subpages">
      {#each SUBPAGES.filter((p) => p.href !== '/connect-ai/privacy') as page (page.href)}
        <a href={page.href}>
          <strong>{page.title}</strong>
          <span>{page.body}</span>
        </a>
      {/each}
    </div>
  </section>
</main>
