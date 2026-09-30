<!--
  P5-14 — the §17.2 comparison table.

  Built entirely from the adapter descriptors, so it cannot drift from what the adapters do. The
  three columns that carry the most weight are the ones most likely to be quietly wrong in a
  hand-written table, so each is handled explicitly:

  - **Capabilities** come from `descriptor.capabilities`. Nothing is added because a provider is
    known to do it in the abstract — if the adapter does not declare it, it is not offered.
  - **Works in browser** is `descriptor.browserDirect`, which is a claim the adapter's own author
    made about its provider. `unknown` renders as "Needs checking", not as a yes, because a
    confident wrong answer here costs the user a debugging session.
  - **Rough cost** is the provider's `costHint` plus a link to the provider's own pricing page.
    We do not print a dollar figure of our own: they set the price, and it changes.
-->
<script lang="ts">
  import {
    BROWSER_DIRECT_DISPLAY,
    browserDirectFreshness,
    CAPABILITY_LABELS,
    UNLOCK_ORDER,
    type ProviderGuide,
  } from './providers';
  import { PROVIDER_GUIDES } from './providers';
  import { t as translate, type Locale } from './t';

  let {
    guides = PROVIDER_GUIDES,
    locale = 'en',
  }: { guides?: readonly ProviderGuide[]; locale?: Locale } = $props();

  const t = $derived((key: string, fallback: string) => translate(locale, key, fallback));

  /** Map a `browserDirect` value to the visual verdict, which also carries the accessible word. */
  function verdict(
    value: ProviderGuide['descriptor']['browserDirect'],
  ): 'yes' | 'caution' | 'unknown' {
    if (value === 'yes') return 'yes';
    if (value === 'yes-with-header') return 'caution';
    return 'unknown';
  }
</script>

<!--
  A scrollable region has to be reachable by keyboard or a reader who cannot scroll with a mouse
  cannot read the columns off the right-hand edge — WCAG 2.1.1. Svelte's `a11y_no_noninteractive_
  tabindex` rule flags `tabindex` on a non-interactive element without recognising that case, so
  the suppression below is deliberate and is the reason. `role="group"` stays honest: this box
  holds a table and nothing that acts on the page. The inner overflow is the point — the page body
  itself never scrolls sideways.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="connect-scroll" tabindex="0" role="group" aria-labelledby="provider-table-caption">
  <table class="connect-table" data-testid="provider-table">
    <caption id="provider-table-caption">
      {t(
        'connect.table.caption',
        'Every capability, browser posture, and cost below is read from the adapter that implements it. "Needs checking" means nobody has confirmed it from a browser — not that a yes went stale.',
      )}
    </caption>
    <thead>
      <tr>
        <th scope="col">{t('connect.table.provider', 'Provider')}</th>
        <th scope="col">{t('connect.table.bestFor', 'Best for')}</th>
        <th scope="col">{t('connect.table.caps', 'Capabilities')}</th>
        <th scope="col">{t('connect.table.browser', 'Works in browser')}</th>
        <th scope="col">{t('connect.table.cost', 'Rough cost')}</th>
        <th scope="col">{t('connect.table.setup', 'Setup')}</th>
      </tr>
    </thead>
    <tbody>
      {#each guides as guide (guide.slug)}
        {@const browser = BROWSER_DIRECT_DISPLAY[guide.descriptor.browserDirect]}
        <tr data-provider={guide.slug}>
          <th scope="row">
            <a href={`/connect-ai/${guide.slug}`}>{guide.descriptor.name}</a>
          </th>
          <td>{guide.bestFor}</td>
          <td>
            <span class="connect-caps">
              {#each UNLOCK_ORDER.filter( (c) => guide.descriptor.capabilities.includes(c) ) as capability (capability)}
                <span class="connect-cap" title={CAPABILITY_LABELS[capability]}>
                  {CAPABILITY_LABELS[capability]}
                </span>
              {/each}
            </span>
          </td>
          <td>
            <span class="connect-verdict" data-verdict={verdict(guide.descriptor.browserDirect)}>
              {browser.label}
            </span>
            {#if guide.descriptor.browserDirectNote}
              <span class="cell-note">{guide.descriptor.browserDirectNote}</span>
            {/if}
          </td>
          <td>
            {guide.descriptor.costHint ?? 'Varies.'}
            {#if !guide.selfHosted}
              <span class="cell-note">
                <a href={guide.descriptor.pricingUrl}>Their pricing page</a>
              </span>
            {/if}
          </td>
          <td>About {guide.setupMinutes} min</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<p class="connect-freshness" data-testid="browser-direct-freshness">
  <strong>{t('connect.table.freshness', 'How fresh the browser column is:')}</strong>
  {browserDirectFreshness.note}
</p>
