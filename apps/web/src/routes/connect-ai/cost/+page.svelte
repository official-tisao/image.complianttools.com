<!--
  P5-14 — `/connect-ai/cost` (README §17.4).

  The page is written to be useful to someone who has never read a model pricing page. The
  organising idea is the one that saves people the most money: **most of what these tools do is
  arithmetic, and arithmetic is free locally.** Paying per image to resize or convert is the
  easiest waste to avoid, so the page leads with that rather than with billing terminology.

  Every price shape below is described generically rather than quoted, because quoting numbers from
  a third party's pricing page is a snapshot that goes stale. The one worked example §17.4 asks for
  is included with its arithmetic shown, and it is explicitly labelled an illustration rather than
  a quote — each figure links out to the provider whose price it is imitating.

  The cost ledger is described honestly: the engine records calls, but this page does not yet read
  the stored records back, so there is no table of zeros pretending to be a spend report.
-->
<script lang="ts">
  import '../../../connect.css';
  import { COST_EXAMPLE, COST_LEVERS, LEDGER_STATUS, SITE_ORIGIN } from '$lib/connect/content';
  import { PROVIDER_GUIDES } from '$lib/connect/providers';
  import { SUBPAGES } from '$lib/connect/nav';

  const title = 'What AI image operations cost — per image, per token, per second — ctimg';
  const description =
    'How image-model pricing actually works, what drives the cost of each operation, how to spend less, and a worked example you can check the arithmetic on.';
  const canonical = `${SITE_ORIGIN}/connect-ai/cost`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'TechArticle', headline: 'What AI image operations cost', description },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Connect AI',
            item: `${SITE_ORIGIN}/connect-ai`,
          },
          { '@type': 'ListItem', position: 2, name: 'Cost', item: canonical },
        ],
      },
    ],
  };

  /** The three ways a provider can charge. §17.4. */
  const MODELS = [
    {
      name: 'Per image',
      detail:
        'A fixed price for each picture produced. The easiest to predict and by far the most common for image models. Some providers offer a cheaper preview and a full-price export of the same operation.',
      who: 'Most image generation and editing APIs.',
    },
    {
      name: 'Per token',
      detail:
        'Charged for the text in the prompt and the text coming back, the same way a text model is billed. This is how description and alt-text work is usually priced, because what you are paying for is a written answer rather than a picture.',
      who: 'Vision-language models used for describing an image.',
    },
    {
      name: 'Per second',
      detail:
        'Charged for the compute time a model runs, which is the norm for community-model marketplaces. Cost therefore depends on how long the job takes, which depends on the model and the hardware behind it — so the same operation can differ in price by an order of magnitude.',
      who: 'Model marketplaces and self-hosted-model gateways.',
    },
  ];

  /** What actually moves the number, per §17.4. */
  const DRIVERS = [
    {
      name: 'Output resolution',
      detail:
        'Most providers price by size, and a 4K render costs more than a 1:1 render of the same image.',
    },
    {
      name: 'Quality tier',
      detail:
        'Where a provider offers a draft and a final setting, the final setting is the expensive one, and iterating on the draft is the saving.',
    },
    {
      name: 'Step count',
      detail:
        'Diffusion-style models charge for how many denoising steps run. Fewer steps is cheaper and usually slightly softer.',
    },
    {
      name: 'Number of variations',
      detail: 'Asking for four at once is four times the cost of asking for one at a time.',
    },
    {
      name: 'The model itself',
      detail:
        'A larger, newer model is priced above a smaller one, sometimes by a lot. On a marketplace you choose which one runs.',
    },
  ];
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

<main class="connect-page" lang="en" dir="ltr" data-testid="cost">
  <header class="connect-hero">
    <p class="eyebrow">Nobody here marks anything up</p>
    <h1>What AI image operations cost</h1>
    <p>
      The local tools cost nothing, because they are arithmetic running on your own machine. The AI
      tools cost whatever your provider charges them, billed by them, at their price — this site
      takes no cut, resells nothing, and has no subscription.
    </p>
    <p>
      So the question is not what this costs. It is which operations are worth paying for, and which
      are cheaper to do yourself.
    </p>
  </header>

  <section class="connect-section" id="models" aria-labelledby="models-heading">
    <h2 id="models-heading">Three ways a provider can charge you</h2>
    <p class="connect-lede">
      The unit matters more than the number, because it tells you what to reduce. A per-image price
      falls when you generate fewer images; a per-second price falls when you pick a smaller model.
    </p>
    <dl class="connect-why">
      {#each MODELS as model (model.name)}
        <div>
          <dt>{model.name}</dt>
          <dd>
            {model.detail}
            <span class="cell-note" style="display: block; margin-top: 6px;">{model.who}</span>
          </dd>
        </div>
      {/each}
    </dl>
  </section>

  <section class="connect-section" id="drivers" aria-labelledby="drivers-heading">
    <h2 id="drivers-heading">What actually drives the price</h2>
    <p class="connect-lede">
      The same operation on the same image can differ by an order of magnitude. These are the knobs.
    </p>
    <dl class="connect-why">
      {#each DRIVERS as driver (driver.name)}
        <div>
          <dt>{driver.name}</dt>
          <dd>{driver.detail}</dd>
        </div>
      {/each}
    </dl>
  </section>

  <section class="connect-section" id="spend-less" aria-labelledby="spend-less-heading">
    <h2 id="spend-less-heading">How to spend less</h2>
    <p class="connect-lede">
      In rough order of how much they save. The first one is free and usually the biggest.
    </p>
    <dl class="connect-why">
      {#each COST_LEVERS as lever (lever.title)}
        <div>
          <dt>{lever.title}</dt>
          <dd>{lever.body}</dd>
        </div>
      {/each}
    </dl>
  </section>

  <!-- The worked example §17.4 asks for. -->
  <section class="connect-section" id="example" aria-labelledby="example-heading">
    <h2 id="example-heading">{COST_EXAMPLE.heading}</h2>
    <p class="connect-lede">
      The same 200 images, three different ways, and you can check the arithmetic because the
      difference is entirely in which operations you chose to pay for.
    </p>
    <!-- WCAG 2.1.1: a scrollable region must be keyboard-reachable. See ProviderTable.svelte. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="connect-scroll" tabindex="0" role="group" aria-labelledby="example-heading">
      <table class="connect-table" data-testid="cost-example">
        <caption
          >Illustrative figures, not quotes. Each links to the provider whose price it imitates.</caption
        >
        <thead>
          <tr>
            <th scope="col">Job</th>
            <th scope="col">How</th>
            <th scope="col">Cost</th>
          </tr>
        </thead>
        <tbody>
          {#each COST_EXAMPLE.rows as row (row.job)}
            <tr>
              <th scope="row">{row.job}</th>
              <td>{row.how}</td>
              <td>{row.cost}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p>{COST_EXAMPLE.conclusion}</p>
    <p class="connect-source">{COST_EXAMPLE.note}</p>
  </section>

  <section class="connect-section" id="ledger" aria-labelledby="ledger-heading">
    <h2 id="ledger-heading">Reading your own spend</h2>
    <p class="connect-lede">{LEDGER_STATUS.implemented}</p>
    <div class="connect-unverified" data-testid="cost-ledger-status">
      <strong>Nothing is displayed here yet</strong>
      {LEDGER_STATUS.notYet}
      {LEDGER_STATUS.why}
    </div>
    <p class="connect-source">{LEDGER_STATUS.exportNote}</p>
    <p>
      The spend guard is separate and does work: it can warn before a batch would cross a threshold
      you set, entirely in your browser. It protects your budget, not our capacity — there is no
      queue here to protect.
    </p>
  </section>

  <section class="connect-section" id="providers" aria-labelledby="providers-heading">
    <h2 id="providers-heading">Where each provider’s price is set</h2>
    <p class="connect-lede">
      These are the providers’ own pricing pages. We do not restate a number that a third party can
      change without telling us.
    </p>
    <div class="connect-subpages">
      {#each PROVIDER_GUIDES.filter((g) => !g.selfHosted) as guide (guide.slug)}
        <a href={guide.descriptor.pricingUrl}>
          <strong>{guide.descriptor.name}</strong>
          <span>{guide.descriptor.costHint ?? 'See their pricing page.'}</span>
        </a>
      {/each}
    </div>
  </section>

  <section class="connect-section" id="related">
    <h2>Related</h2>
    <div class="connect-subpages">
      {#each SUBPAGES.filter((p) => p.href !== '/connect-ai/cost') as page (page.href)}
        <a href={page.href}>
          <strong>{page.title}</strong>
          <span>{page.body}</span>
        </a>
      {/each}
    </div>
  </section>
</main>
