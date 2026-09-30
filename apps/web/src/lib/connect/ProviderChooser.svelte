<!--
  P5-14 — the "Help me choose" flow (README §17.2).

  Three questions, and an output that removes a decision: **one** recommendation with a
  one-sentence reason, plus two alternatives. §17.2 is explicit that this is never a ranked list of
  ten, and `recommend()` in `chooser.ts` returns exactly three providers however it is called.

  ## Why this has no JavaScript

  The obvious implementation re-scores on every radio-button change, which needs a framework and
  about 27 kB of hydration over a page whose 45 kB budget has only ~4 kB of headroom. This one does
  not. `allCombinations()` scores every task × priority pair at build time, the 30 outcomes are
  prerendered into the HTML, and the switching rules that reveal the matching one as the reader
  changes the radios are generated into `connect.css`. The blocks and the rules come from the same
  array, so a combination cannot render without a rule or a rule without a block.

  The account question works the same way: each outcome carries a per-provider note that appears
  when that provider's box is ticked, so "you already have an account here" shows up in whichever
  recommendation is on screen.

  The cost is HTML weight — 30 outcomes instead of 1 — which is the right currency here, because
  this route's budget is JavaScript and gzip, and a 24 kB HTML file is cheaper for a reader than a
  68 kB bundle. The degradation is also graceful: a browser without `:has()` shows the default
  answer rather than nothing.

  The chooser deliberately collects no credential. Keys are entered on a provider walkthrough, one
  at a time, and never here.
-->
<script lang="ts">
  import {
    ACCOUNT_PROVIDERS,
    allCombinations,
    PRIORITY_OPTIONS,
    recommend,
    TASK_OPTIONS,
    type ChooserAnswers,
  } from './chooser';
  import { t as translate, type Locale } from './t';
  // The switching rules this component depends on live at the end of connect.css.
  import '../../connect.css';

  let { locale = 'en' }: { locale?: Locale } = $props();

  const t = $derived((key: string, fallback: string) => translate(locale, key, fallback));

  /** Every task × priority outcome, scored at build time. */
  const outcomes = allCombinations().map((combo) => ({
    ...combo,
    result: recommend({ ...combo, accounts: [] } as ChooserAnswers),
  }));
</script>

<!--
  The switching rules that reveal the matching outcome live in `connect.css`, generated from this
  component's own `allCombinations()`. See the note at the end of that file for why they are not
  injected through a <style> block here.
-->
<div class="chooser" data-testid="chooser">
  <fieldset>
    <legend id="chooser-task-legend">{t('connect.chooser.q1', '1. What do you want to do?')}</legend
    >
    <div class="chooser-options" role="group" aria-labelledby="chooser-task-legend">
      {#each TASK_OPTIONS as option (option.value)}
        <label>
          <input type="radio" name="task" value={option.value} />
          {option.label}
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend id="chooser-priority-legend">
      {t('connect.chooser.q2', '2. What matters most?')}
    </legend>
    <div class="chooser-options" role="group" aria-labelledby="chooser-priority-legend">
      {#each PRIORITY_OPTIONS as option (option.value)}
        <label>
          <input type="radio" name="priority" value={option.value} />
          {option.label}
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend id="chooser-account-legend">
      {t('connect.chooser.q3', '3. Do you already have an account anywhere? (optional)')}
    </legend>
    <div class="chooser-checkboxes">
      {#each ACCOUNT_PROVIDERS as provider (provider.value)}
        <label>
          <input type="checkbox" name="account" value={provider.value} />
          {provider.label}
        </label>
      {/each}
    </div>
    <p class="field-help">
      {t(
        'connect.chooser.q3.help',
        'An account you already have shortens setup. It is not sent anywhere — it only changes the explanation below.',
      )}
    </p>
  </fieldset>

  <!--
    Exactly one recommendation per outcome, visibly set apart from the two alternatives. The layout
    is part of the argument: a reader who sees three equal boxes has been handed the same decision
    with more rows, which is the outcome §17.2 is written against.
  -->
  <div class="chooser-result" data-testid="chooser-result">
    <p class="eyebrow">{t('connect.chooser.result', 'Our recommendation')}</p>

    {#each outcomes as outcome (outcome.task + outcome.priority)}
      <div
        class="chooser-outcome chooser-outcome--{outcome.task}--{outcome.priority}"
        data-task={outcome.task}
        data-priority={outcome.priority}
        data-testid="chooser-outcome"
      >
        <div class="chooser-pick">
          <h4>
            <a href={`/connect-ai/${outcome.result.pick.slug}`}
              >{outcome.result.pick.descriptor.name}</a
            >
          </h4>
          <p>{outcome.result.reason}</p>
          {#if outcome.result.pick.selfHosted}
            <p class="chooser-owned-note">
              You said <strong>most private</strong>, and this is the only option that keeps your
              images off someone else's machine entirely.
            </p>
          {/if}
          {#each ACCOUNT_PROVIDERS as provider (provider.slug)}
            {#if provider.slug === outcome.result.pick.slug}
              <p
                class="chooser-owned chooser-owned--{outcome.task}--{outcome.priority}--{provider.slug}"
              >
                Tick {provider.label} above and setup drops to a couple of minutes.
              </p>
            {/if}
          {/each}
          <p class="connect-source">
            {t('connect.chooser.bestFor', 'Best for:')}
            {outcome.result.pick.bestFor}
          </p>
          <a class="button primary" href={`/connect-ai/${outcome.result.pick.slug}`}>
            {t('connect.chooser.walkthrough', 'Set it up')}
          </a>
        </div>

        <h4 class="connect-h3">{t('connect.chooser.alternatives', 'Two other options')}</h4>
        <div class="chooser-alt">
          {#each outcome.result.alternatives as alternative, index (alternative.slug)}
            <div data-testid="chooser-alternative">
              <h4><a href={`/connect-ai/${alternative.slug}`}>{alternative.descriptor.name}</a></h4>
              <p>{outcome.result.alternativeReasons[index]}</p>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
