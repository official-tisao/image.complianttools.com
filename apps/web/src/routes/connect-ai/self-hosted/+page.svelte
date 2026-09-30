<!--
  P5-14 — `/connect-ai/self-hosted` (README §17.4), the flagship page.

  §17.4 puts a warning on it that this page takes literally: "VERIFY every command against the
  current release of each tool before publishing; a wrong command here destroys trust faster than
  any bug." So every command on this page is reproduced from `self-hosted.ts`, which records the
  exact upstream source it was read from and the date it was read, and that source is printed next
  to the commands rather than buried.

  Three of the four runtimes turned out to differ from README §17.4's summary table. Those
  differences are stated on the page with the reason, because a reader who follows §17.4's wording
  will fail, and a reader who follows the page will succeed. Silently correcting the spec would
  leave the spec wrong for the next person to read.

  This page is fully prerendered and needs no JavaScript. That is not an accident: it is a document
  people land on from a search, read once, copy commands from, and leave. A connection test is not
  offered here because the walkthrough at `/connect-ai/openai-compatible` already provides one and
  duplicating it would create a second place for its state to live.
-->
<script lang="ts">
  import '../../../connect.css';
  import {
    CURL_CHECKS,
    LOCAL_VISION_NOTES,
    MIXED_CONTENT_NOTES,
    RUNTIMES,
    TROUBLESHOOTING_STEPS,
    VERIFIED_ON,
  } from '$lib/connect/self-hosted';
  import { SITE_ORIGIN } from '$lib/connect/content';
  import { SUBPAGES } from '$lib/connect/nav';

  const title = 'Run an AI model on your own machine — Ollama, LM Studio, vLLM, LiteLLM — ctimg';
  const description =
    'Exact, copy-pasteable CORS commands for Ollama, LM Studio, vLLM, and LiteLLM so a browser can reach a model running on your own machine. Every command is verified against that project’s own documentation, with the source and the date shown.';
  const canonical = `${SITE_ORIGIN}/connect-ai/self-hosted`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        headline: 'Run an AI model on your own machine',
        description,
        dateModified: VERIFIED_ON,
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
          { '@type': 'ListItem', position: 2, name: 'Self-hosted', item: canonical },
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

<main class="connect-page" lang="en" dir="ltr" data-testid="self-hosted">
  <header class="connect-hero">
    <p class="eyebrow">Nothing leaves your machine</p>
    <h1>Run an AI model on your own machine</h1>
    <p>
      A model running on your own computer is the only version of this that is genuinely private:
      the request goes to <code>localhost</code>, so there is no company, no account, and no image
      on anyone’s server. Four runtimes do this well, and each needs one setting before a web page
      is allowed to call it.
    </p>
    <p>
      That setting is CORS — a rule about which web pages may call a server. It is enforced by your
      browser and it defaults to refusing. The commands below turn it on for this site and nothing
      else.
    </p>
    <div class="hero-actions">
      <a class="button primary" href="#ollama">Jump to your runtime</a>
      <a class="button" href="/connect-ai/openai-compatible">The self-hosted walkthrough</a>
    </div>
  </header>

  <div class="connect-note" data-testid="verification-stamp">
    <strong>Checked against upstream on {VERIFIED_ON}</strong>
    Every command below was read out of the project’s own documentation or source on that date, and the
    source is printed with it. Three of the four differ from the summary in the specification, and where
    they do, the difference is called out on the page.
  </div>

  {#each RUNTIMES as runtime (runtime.id)}
    <section class="connect-section" id={runtime.id} aria-labelledby={`${runtime.id}-heading`}>
      <h2 id={`${runtime.id}-heading`}>{runtime.name}</h2>
      <p class="connect-lede">{runtime.blurb}</p>
      <p>
        Base URL to paste into the walkthrough: <code>{runtime.baseUrl}</code>
        <span class="cell-note">Default port {runtime.defaultPort}.</span>
      </p>

      {#if runtime.differsFromReadme}
        <div class="connect-warning" data-testid={`differs-${runtime.id}`}>
          <strong>This differs from the specification’s summary</strong>
          {runtime.differsFromReadme}
        </div>
      {/if}

      <ol>
        {#each runtime.steps as step, index (index)}
          <li class="connect-step">
            <h4>
              {step.label}
              {#if step.restart}
                <span class="connect-cap">run this last</span>
              {/if}
            </h4>
            {#if step.command}
              <pre class="connect-command"><code>{step.command}</code></pre>
            {/if}
            {#if step.note}
              <p>{step.note}</p>
            {/if}
          </li>
        {/each}
      </ol>

      {#if runtime.securityNote}
        <div class="connect-note">
          <strong>In their words</strong>
          {runtime.securityNote}
        </div>
      {/if}

      <p class="connect-source" data-testid={`source-${runtime.id}`}>
        <strong>Verified against</strong>
        {runtime.source}
        {#if runtime.verified}
          <a href={runtime.sourceUrl}>Source</a>
          · <span class="connect-cap">verified {VERIFIED_ON}</span>
        {:else}
          <span class="connect-cap connect-cap">unverified</span>
        {/if}
      </p>
    </section>
  {/each}

  <!-- Mixed content, per browser. Labelled with what is known and what is not. -->
  <section class="connect-section" id="mixed-content" aria-labelledby="mixed-heading">
    <h2 id="mixed-heading">If it works in curl but not in the browser</h2>
    <p class="connect-lede">
      This page is served over HTTPS. A browser will sometimes refuse to let an HTTPS page talk to a
      plain-HTTP local server, and the error mentions “mixed content” rather than CORS. Which
      engines do this has changed between versions, so treat the table as a starting point rather
      than a specification.
    </p>
    <!-- WCAG 2.1.1: a scrollable region must be keyboard-reachable. See ProviderTable.svelte. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="connect-scroll" tabindex="0" role="group" aria-labelledby="mixed-heading">
      <table class="connect-table">
        <caption>
          Observed behaviour, not a guarantee. Re-check against your browser’s current release if
          this table is the thing that is wrong.
        </caption>
        <thead>
          <tr>
            <th scope="col">Browser</th>
            <th scope="col">What it does</th>
          </tr>
        </thead>
        <tbody>
          {#each MIXED_CONTENT_NOTES as note (note.browser)}
            <tr>
              <th scope="row">{note.browser}</th>
              <td>
                {note.behaviour}
                <span class="cell-note">
                  {note.confident
                    ? 'Verified.'
                    : 'Observed, and subject to change between releases.'}
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p>
      If your browser refuses, the options are to serve your local model over TLS, to use a browser
      that permits it, or to run the same model somewhere with HTTPS. Only the first two keep the
      images on your machine.
    </p>
  </section>

  <!-- Verify with curl before blaming the page. -->
  <section class="connect-section" id="verify" aria-labelledby="verify-heading">
    <h2 id="verify-heading">Check it from a terminal first</h2>
    <p class="connect-lede">
      If curl cannot reach the server, the browser was never the problem. This is the fastest way to
      find out which half of the problem you have.
    </p>
    {#each CURL_CHECKS as check (check.runtime)}
      <div class="connect-step">
        <h4>{check.runtime}</h4>
        <pre class="connect-command"><code>{check.command}</code></pre>
        <p>{check.expected}</p>
      </div>
    {/each}
  </section>

  <!-- Which local models are actually good at vision. -->
  <section class="connect-section" id="models" aria-labelledby="models-heading">
    <h2 id="models-heading">Which local models are good at images</h2>
    <p class="connect-lede">
      A local model on a laptop is usually very good at ordinary alt-text work and clearly worse
      than a hosted model at fine detail. Better to know that before you spend an afternoon tuning a
      prompt.
    </p>
    <dl class="connect-why">
      {#each LOCAL_VISION_NOTES as model (model.family)}
        <div>
          <dt>{model.family}</dt>
          <dd>
            {model.note}
            <span class="cell-note" style="display: block; margin-top: 6px;">
              {model.caveat}
            </span>
          </dd>
        </div>
      {/each}
    </dl>
  </section>

  <!-- Troubleshooting, as an order to work through. -->
  <section class="connect-section" id="troubleshooting" aria-labelledby="troubleshooting-heading">
    <h2 id="troubleshooting-heading">When it does not work</h2>
    <p class="connect-lede">In this order. The earlier checks rule out most causes.</p>
    <ol>
      {#each TROUBLESHOOTING_STEPS as step (step.check)}
        <li class="connect-step">
          <h4>{step.check}</h4>
          <p>{step.if}</p>
        </li>
      {/each}
    </ol>
  </section>

  <section class="connect-section" id="related">
    <h2>Related</h2>
    <div class="connect-subpages">
      {#each SUBPAGES.filter((p) => p.href !== '/connect-ai/self-hosted') as page (page.href)}
        <a href={page.href}>
          <strong>{page.title}</strong>
          <span>{page.body}</span>
        </a>
      {/each}
    </div>
  </section>
</main>
