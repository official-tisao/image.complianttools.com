<!--
  P5-14 — README §17.7's two in-app empty states.

  One component, two states, and they are genuinely different screens. The escalation state renders
  inside a tool that already has a local result on screen, so it is framed as an offer and leads
  with the fact that the local result is finished and free. The AI-only state renders on a tool
  with no local path at all, so it says that plainly and puts a working local alternative in the
  action row rather than below the fold.

  The copy rules are enforced in `empty-states.ts` and asserted by the test suite. Two properties
  are worth stating here because they are easy to break by accident:

  - The two headlines are not interchangeable, and `connect.css` gives the states different borders
    so they do not read as the same component twice.
  - There is no "Upgrade", "Pro", or "Premium" anywhere. This is not a paywall and must not borrow
    that vocabulary — 78 of the 81 tools work with no key at all, and nothing here is limited
    without one.
-->
<script lang="ts">
  import { emptyStateFor, type EmptyState } from './empty-states';
  import { t as translate, type Locale } from './t';

  let {
    route,
    state,
    locale = 'en',
  }: {
    /** The route the state is being shown on. Selects the state unless one is passed. */
    route: string;
    /** Pass a state directly to override the route lookup (used by the two AI tool pages). */
    state?: EmptyState;
    locale?: Locale;
  } = $props();

  const resolved = $derived(state ?? emptyStateFor(route));
  const t = $derived((key: string, fallback: string) => translate(locale, key, fallback));
</script>

<aside
  class={resolved.id === 'escalation' ? 'connect-escalation' : 'connect-empty-state'}
  aria-labelledby="connect-empty-state-headline"
  data-empty-state={resolved.id}
>
  <p class="eyebrow">{t('connect.empty.eyebrow', resolved.eyebrow)}</p>
  <h3 id="connect-empty-state-headline">{t('connect.empty.headline', resolved.headline)}</h3>

  {#each resolved.body as paragraph, index (index)}
    <p>{paragraph}</p>
  {/each}

  <div class="connect-state-actions">
    {#each resolved.actions as action (action.href)}
      <a
        href={action.href}
        class={action.primary ? 'primary-action' : undefined}
        class:primary-action={action.primary}
      >
        {action.label}
      </a>
    {/each}
  </div>

  <!--
    The local alternative is a real link with its own reason, never consolation text. §17.7: the
    request is always paired with a local path that works, so a user who declines can still act.
  -->
  <p class="connect-local-alt">
    <a href={resolved.localAlternative.href}>{resolved.localAlternative.label}</a> —
    {resolved.localAlternative.why}
  </p>

  <!-- The cost and the provider, named before the request rather than after it. -->
  <p class="connect-cost">
    <strong>{t('connect.empty.cost', 'Cost:')}</strong>
    {resolved.cost}
  </p>
</aside>
