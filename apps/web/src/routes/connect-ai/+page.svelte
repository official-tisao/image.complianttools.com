<!--
  P5-14 — the `/connect-ai` hub (README §17.1).

  A real, indexable, linkable page, not a modal. It is built to be useful before any script runs:
  the comparison table, all fourteen FAQ answers, the why-BYOK reasons, and the security claims are
  plain prerendered HTML, and only the chooser's live re-scoring and the walkthrough's connection
  test need JavaScript.

  The claims discipline that runs through this page:

  - 78 of 81 tools work with no key at all, and nothing here is trial-capped, watermarked, or
    limited without one. This is not a paywall and the page never uses that vocabulary.
  - Anything we have not implemented is named as unimplemented. There is no saved-connection list,
    no ledger readout, and no nightly refresh of the provider data, and pretending otherwise would
    be the exact failure mode the section is meant to prevent.
  - A provider's pricing and data policy are their claims, linked and dated — not ours.
-->
<script lang="ts">
  import '../../connect.css';
  import ProviderChooser from '$lib/connect/ProviderChooser.svelte';
  import ProviderTable from '$lib/connect/ProviderTable.svelte';
  import {
    AI_ONLY_TOOLS,
    CONNECTIONS_STATUS,
    FAQS,
    LEDGER_STATUS,
    LOCAL_TOOL_COUNT,
    SECURITY_FACTS,
    SITE_ORIGIN,
    WHY_BYOK,
  } from '$lib/connect/content';
  import { SUBPAGES } from '$lib/connect/nav';
  import { t as translate, type Locale } from '$lib/connect/t';

  const locale: Locale = 'en';
  const t = (key: string, fallback: string) => translate(locale, key, fallback);

  const title = 'Connect your own AI provider — ctimg';
  const description =
    'Use your own OpenAI, Anthropic, Gemini, fal.ai, Stability, or local Ollama key with these image tools. The key stays in your browser, the request goes straight to the provider, and 78 of 81 tools work without one.';

  const canonical = `${SITE_ORIGIN}/connect-ai`;

  /** The standard three-node graph: SoftwareApplication, FAQPage, BreadcrumbList. */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'Connect your own AI provider',
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web',
        description,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQS.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Tools', item: `${SITE_ORIGIN}/` },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Connect AI',
            item: canonical,
          },
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

<main class="connect-page" lang={locale} dir="ltr" data-testid="connect-ai">
  <!-- Hero: what this is, in three sentences. -->
  <header class="connect-hero">
    <p class="eyebrow">{t('connect.eyebrow', 'Bring your own key')}</p>
    <h1>{t('connect.h1', 'Connect your own AI provider')}</h1>
    <p>
      {t(
        'connect.hero1',
        'This site is a set of static files with no backend, so it cannot hold an API key for you. If you want the handful of tools that need an AI model, you paste a key from a provider you already have an account with, and the request goes from your browser straight to them.',
      )}
    </p>
    <p>
      {t(
        'connect.hero2',
        'You pay that provider directly, at their price. There is no subscription here, no trial, and no limit on the tools that do not need a key.',
      )}
    </p>
    <p>
      {LOCAL_TOOL_COUNT.workingWithoutKey} of the {LOCAL_TOOL_COUNT.total} tools work with nothing connected.
      {LOCAL_TOOL_COUNT.note}
    </p>
    <div class="hero-actions">
      <a class="button primary" href="#chooser">
        {t('connect.heroCta', 'Help me choose a provider')}
      </a>
      <a class="button" href="/convert">
        {t('connect.heroCtaAlt', 'Use the local tools instead')}
      </a>
    </div>
  </header>

  <!-- Why BYOK, stated plainly. -->
  <section class="connect-section" id="why-byok" aria-labelledby="why-byok-heading">
    <h2 id="why-byok-heading">{t('connect.why', 'Why your own key')}</h2>
    <p class="connect-lede">
      {t('connect.whyLede', 'Four reasons, none of which is a sales argument:')}
    </p>
    <dl class="connect-why">
      {#each WHY_BYOK as reason (reason.title)}
        <div>
          <dt>{reason.title}</dt>
          <dd>{reason.body}</dd>
        </div>
      {/each}
    </dl>
  </section>

  <!-- Choose a provider. -->
  <section class="connect-section" id="chooser" aria-labelledby="chooser-heading">
    <h2 id="chooser-heading">{t('connect.choose', 'Choose a provider')}</h2>
    <p class="connect-lede">
      {t(
        'connect.chooseLede',
        'Three questions get you one answer and two alternatives. Not a list of ten — the point is to remove a decision.',
      )}
    </p>
    <ProviderChooser {locale} />
  </section>

  <section class="connect-section" id="compare" aria-labelledby="compare-heading">
    <h2 id="compare-heading">{t('connect.compare', 'Every provider side by side')}</h2>
    <p class="connect-lede">
      {t(
        'connect.compareLede',
        'Read from the adapter that implements each provider, so it cannot drift from what the code does.',
      )}
    </p>
    <ProviderTable {locale} />
  </section>

  <!-- Your providers. -->
  <section class="connect-section" id="your-providers" aria-labelledby="your-providers-heading">
    <h2 id="your-providers-heading">{t('connect.yours', 'Your providers')}</h2>
    <p class="connect-lede">{CONNECTIONS_STATUS.implemented}</p>

    <div class="connect-unverified" data-testid="connections-not-implemented">
      <strong>{t('connect.yours.pending', 'No saved connections yet')}</strong>
      {CONNECTIONS_STATUS.notYet}
      {CONNECTIONS_STATUS.consequence}
    </div>
    <p class="connect-source">{CONNECTIONS_STATUS.exportNote}</p>
  </section>

  <!-- The local cost ledger. -->
  <section class="connect-section" id="usage" aria-labelledby="usage-heading">
    <h2 id="usage-heading">{t('connect.usage', 'What your AI calls cost')}</h2>
    <p class="connect-lede">{LEDGER_STATUS.implemented}</p>

    <div class="connect-unverified" data-testid="ledger-not-implemented">
      <strong>{t('connect.usage.pending', 'Nothing is displayed here yet')}</strong>
      {LEDGER_STATUS.notYet}
      {LEDGER_STATUS.why}
    </div>
    <p class="connect-source">{LEDGER_STATUS.exportNote}</p>

    <p>
      <a href="/connect-ai/cost">{t('connect.usage.more', 'How image pricing actually works →')}</a>
    </p>
  </section>

  <!-- When and how to deploy a relay. -->
  <section class="connect-section" id="relay" aria-labelledby="relay-heading">
    <h2 id="relay-heading">{t('connect.relay', 'If your browser is blocked')}</h2>
    <p class="connect-lede">
      {t(
        'connect.relayLede',
        'A handful of providers do not allow calls from a web page. For those, a relay you deploy yourself forwards the request. There is no relay here to sign up for — the whole point is that you run it.',
      )}
    </p>
    <p>
      <a href="/connect-ai/relay"
        >{t('connect.relayMore', 'What a relay is, and what it can see →')}</a
      >
    </p>
  </section>

  <!-- Exactly what we do and don't do with the key. -->
  <section class="connect-section" id="security" aria-labelledby="security-heading">
    <h2 id="security-heading">{t('connect.security', 'What happens to your key')}</h2>
    <p class="connect-lede">
      {t(
        'connect.securityLede',
        'Every claim here is one you can check in the browser, not one you have to take on trust.',
      )}
    </p>
    <dl class="connect-why">
      {#each SECURITY_FACTS as fact (fact.claim)}
        <div>
          <dt>
            {fact.claim}
            {#if fact.verifiable}
              <span class="connect-cap">{t('connect.checkable', 'Checkable')}</span>
            {:else}
              <span class="connect-cap">{t('connect.notOurs', 'Not ours to promise')}</span>
            {/if}
          </dt>
          <dd>{fact.detail}</dd>
        </div>
      {/each}
    </dl>
    <p>
      <a href="/connect-ai/privacy">
        {t('connect.security.more', 'What each provider says about your images →')}
      </a>
    </p>
  </section>

  <!-- The three tools that genuinely need a model. -->
  <section class="connect-section" id="ai-only" aria-labelledby="ai-only-heading">
    <h2 id="ai-only-heading">{t('connect.aiOnly', 'The three tools that need a model')}</h2>
    <p class="connect-lede">
      {t(
        'connect.aiOnlyLede',
        'These are not trial-capped without a key. They need a model, and there is no local substitute — so the honest thing is to say which ones and why.',
      )}
    </p>
    <div class="connect-subpages">
      {#each AI_ONLY_TOOLS as tool (tool.id)}
        <a href={tool.href}>
          <strong>{tool.title}</strong>
          <span>{tool.body}</span>
        </a>
      {/each}
    </div>

    <h3 class="connect-h3">{t('connect.otherPages', 'Deeper pages')}</h3>
    <div class="connect-subpages">
      {#each SUBPAGES as page (page.href)}
        <a href={page.href}>
          <strong>{page.title}</strong>
          <span>{page.body}</span>
        </a>
      {/each}
    </div>
  </section>

  <!-- All fourteen questions. -->
  <section class="connect-section connect-faq" id="faq" aria-labelledby="faq-heading">
    <h2 id="faq-heading">{t('connect.faq', 'Questions people actually ask')}</h2>
    <p class="connect-lede">
      {t('connect.faqLede', 'Fourteen of them, answered without hedging.')}
    </p>
    {#each FAQS as faq, index (faq.question)}
      <details open={index === 0}>
        <summary>{faq.question}</summary>
        <div>
          <p>{faq.answer}</p>
          {#if faq.note}
            <p class="faq-note">{faq.note}</p>
          {/if}
        </div>
      </details>
    {/each}
  </section>

  <footer class="connect-section">
    <p>
      <a href="/connect-ai">{t('connect.nav.connect', 'Connect AI')}</a> ·
      <a href="/convert">{t('connect.nav.convert', 'Convert')}</a> ·
      <a href="/compress">{t('connect.nav.compress', 'Compress')}</a> ·
      <a href="/resize">{t('connect.nav.resize', 'Resize')}</a>
    </p>
  </footer>
</main>
