<!--
  P5-14 — the per-provider walkthrough (README §17.3), steps 1 to 4.

  The template is identical for every provider, on purpose: §17.3 says consistency is what makes
  the second provider take thirty seconds instead of two minutes. Only the content changes.

  ## What is real and what is not

  - **Real:** every capability, model name, key page, pricing link, and data-policy link. They come
    from the adapter descriptor via `providers.ts`, not from this file. The step 4 grid is rendered
    from `descriptor.capabilities`, so it cannot offer an operation the adapter does not implement.
  - **Not claimed:** connected state, confirmed capabilities, model counts, and test results. None
    of them are known until a test runs, and this page reports only what a test actually returned.
    Step 4 is therefore rendered as "what this provider *can* do", and step 3 lists the outcomes a
    test can produce rather than claiming one has happened.

  ## Why this page ships no JavaScript

  Steps 1, 2, and 4 are instructions, and instructions are markup. The one interactive part of §17.3
  is the *Test connection* button, and it cannot work here yet: a key pasted on one page does not
  survive a navigation, and the engine has no connection manager to hold it (`CONNECTIONS_STATUS` in
  `content.ts` says so on the hub). A button that cannot run would be worse than no button, so step
  3 documents the test, the states it can report, and the failure messages — and the route sets
  `csr = false`, which takes the whole page to zero bytes of JavaScript against a 45 kB budget.

  `failureMessage()` in `failures.ts` is the single source for those messages, so the failure copy
  shown here is the same copy a working button would render, and the tests exercise the same
  function rather than a copy of the strings.
-->
<script lang="ts">
  import {
    CAPABILITY_DESCRIPTIONS,
    CAPABILITY_LABELS,
    capabilityRoute,
    UNLOCK_ORDER,
    type ProviderGuide,
  } from './providers';
  import { failureMessage, type FailureClass } from './failures';
  import ProviderConnectionTest from './ProviderConnectionTest.svelte';
  import { t as translate, type Locale } from './t';

  let { guide, locale = 'en' }: { guide: ProviderGuide; locale?: Locale } = $props();

  const t = $derived((key: string, fallback: string) => translate(locale, key, fallback));
  const descriptor = $derived(guide.descriptor);

  /** Declared capabilities, in the §17.2 order rather than the descriptor's arbitrary order. */
  const capabilities = $derived(UNLOCK_ORDER.filter((c) => descriptor.capabilities.includes(c)));

  /** Adapters whose `test()` may make a billable call, and so need a confirming second click. */
  const testMayCost = $derived(guide.slug === 'bfl');

  /**
   * The failure classes this provider can actually reach, in the order a user meets them.
   *
   * Derived from the descriptor rather than hard-coded per provider, so the list is the taxonomy
   * the UI will render and not a set of messages chosen by a page author. A provider whose server
   * sets no CORS headers is the case `cors-blocked` exists for, and it is listed for every
   * provider because the page cannot know the provider's current CORS posture for certain — which
   * is exactly what the freshness note on the chooser table admits.
   */
  const failureClasses: readonly FailureClass[] = $derived([
    'rejected',
    'forbidden',
    'not-configured',
    'cors-blocked',
    ...(testMayCost ? (['no-credits'] as const) : ([] as const)),
    'rate-limited',
    'provider-error',
  ]);
</script>

<!-- Step 1 — create an account and a key. -->
<section class="connect-section" id="step-1" aria-labelledby="step-1-heading">
  <h2 id="step-1-heading">{t('connect.step1', 'Step 1 — Create an account and a key')}</h2>
  <p class="connect-lede">
    {#if guide.selfHosted}
      {t(
        'connect.step1.selfHosted',
        'There is no account to create and no key to issue. You already run the server; what it needs is permission to be called from this page.',
      )}
    {:else}
      {t(
        'connect.step1.hosted',
        'This takes a couple of minutes. You are creating an account with a company, not with this site.',
      )}
    {/if}
  </p>

  <ol>
    {#each guide.keySteps as step (step.text)}
      <li class="connect-step">
        <h4>{step.text}</h4>
        {#if step.uiLabels}
          <p class="connect-source">{t('connect.uiLabels', 'Labels you will see:')}</p>
          <p class="connect-ui-labels">
            {#each step.uiLabels as label (label)}
              <code>{label}</code>
            {/each}
          </p>
        {/if}
      </li>
    {/each}
  </ol>

  <p>
    {#if guide.selfHosted}
      {t('connect.step1.selfHostedLink', 'The setup for each runtime:')}
    {:else}
      {t('connect.step1.keyPage', 'Go directly to the key page:')}
    {/if}
    <a href={descriptor.keysUrl}>{descriptor.keysUrl}</a>
  </p>

  <div class="connect-note">
    <strong>{t('connect.billing.title', 'Does billing need to be set up first?')}</strong>
    {guide.billingRequired}
  </div>

  <!--
    §17.3 asks for a screenshot placeholder with a caption describing what the user should see. No
    screenshots are captured yet, so this is a described placeholder rather than an <img>: a missing
    image would be a broken promise, and §17.3's own rule is that a stale screenshot is worse than
    none.
  -->
  <figure class="connect-shot">
    <figcaption>
      <strong>{t('connect.screenshot.what', 'What you should see:')}</strong>
      {guide.screenshotCaption}
      <span class="connect-stamp">
        {t(
          'connect.screenshot.pending',
          'Screenshot not yet captured — the caption above is the instruction.',
        )}
      </span>
    </figcaption>
  </figure>
</section>

<!-- Step 2 — what to paste here, and what happens to it. -->
<section class="connect-section" id="step-2" aria-labelledby="step-2-heading">
  <h2 id="step-2-heading">{t('connect.step2', 'Step 2 — Paste it here')}</h2>
  <p class="connect-lede">
    {t(
      'connect.step2.lede',
      'The field is masked, is not filled in by autocomplete, and stays on the page you typed it into. Nothing is sent anywhere until you run a test.',
    )}
  </p>

  <div class="connect-form">
    {#each descriptor.credentialFields as field (field.key)}
      <div class="connect-field">
        <label for={`cred-${field.key}`}>{field.label}</label>
        <div>
          <input
            id={`cred-${field.key}`}
            type={field.secret ? 'password' : 'text'}
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            placeholder={field.placeholder}
            required={field.required}
            aria-describedby={field.help ? `cred-${field.key}-help` : undefined}
            data-testid={`cred-${field.key}`}
          />
        </div>
        {#if field.help}
          <p class="field-help" id={`cred-${field.key}-help`}>{field.help}</p>
        {/if}
        {#if field.required && field.placeholder !== 'not-needed'}
          <p class="connect-soft-warn" data-testid={`soft-warn-${field.key}`}>
            A soft check only: if the key does not look like {descriptor.name}'s, you will see a
            warning and the key will still be tried. A provider can change its key format at any
            time, and warning must never become a lockout.
          </p>
        {/if}
      </div>
    {/each}
  </div>

  <div class="connect-note">
    <strong>{t('connect.storage.title', 'Where this key is kept')}</strong>
    {t(
      'connect.storage.body',
      'In the page that took it, for as long as that page is open, and nowhere else. Nothing is written to storage and nothing survives a reload, because there is no saved list of connections yet. If you want a key to outlive a tab, a server you run yourself keeps it in your own server instead.',
    )}
  </div>
</section>

<!-- Step 3 — testing the connection, and every message it can produce. -->
<section class="connect-section" id="step-3" aria-labelledby="step-3-heading">
  <h2 id="step-3-heading">{t('connect.step3', 'Step 3 — Test the connection')}</h2>
  <p class="connect-lede">
    {t(
      'connect.step3.lede',
      'Testing runs a real check against the provider and reports exactly what came back — including when the answer is that a capability was not confirmed, and including which specific thing went wrong when it did.',
    )}
  </p>

  <!--
    The real control. §17.3 step 3 asks for a button that runs `adapter.test()` and reports what
    actually came back, and Flow C' depends on it, so it exists rather than being documented as
    pending. `ProviderConnectionTest` imports the adapter at press time and renders only what the
    test returned.
  -->
  <ProviderConnectionTest {guide} {locale} />

  <div class="connect-unverified" data-testid="test-pending">
    <strong>What this page does not do yet</strong>
    There is no connection manager, so a key pasted here is not remembered: it lives on this page and
    is gone when you navigate away or close the tab. Nothing here lists your connections or stores a key
    for next time. The states a test reports, and the exact message for each, are below.
  </div>

  {#if testMayCost}
    <!--
      The cost disclosure now lives in `ProviderConnectionTest`, next to the button that can spend
      money, and it is gated on the same condition. Duplicating it here produced two elements with
      `data-testid="test-may-cost"` on the same page — a strict-mode violation for anything
      asserting on it, and a user reading the same warning twice.
    -->
    <p class="connect-leded" data-testid="test-may-cost-note">
      {t(
        'connect.test.costPointer',
        'This provider has no free endpoint to check a key against, so testing may cost a little. The button above says so before it is pressed and asks you to confirm.',
      )}
    </p>
  {/if}

  <h3 class="connect-h3">{t('connect.test.success', 'What a successful test reports')}</h3>
  <!--
    This is an illustration of the *shape* of a success message, not a result.

    It previously read "Connected to {name}." with `data-severity="ok"` and was styled like a live
    result panel, on every one of the fourteen provider pages, while no test had ever run. Anything
    scraping or screenshotting this page — or a reader skimming it — could reasonably take it as a
    live confirmation. §4.9 forbids reporting a placeholder as a success, and that applies to
    documentation as much as to code.

    So it is now marked as an example in three independent ways: a neutral severity, a
    `data-example` attribute rather than a result testid, and an explicit line saying no test has
    been run. The real `successMessage()` output is what a working button renders.
  -->
  <div
    class="connect-result"
    data-severity="neutral"
    data-example="true"
    data-testid="test-success-example"
    aria-label="Example of what a successful connection test reports"
  >
    <h4>Connected to {descriptor.name}.</h4>
    <p>
      {descriptor.models.length > 0
        ? `Found ${descriptor.models.length} model${descriptor.models.length === 1 ? '' : 's'} available. `
        : ''}Confirmed: only the operations the test actually proved. This test was free — no image
      was generated.
    </p>
    <p class="connect-note">
      {t(
        'connect.test.successExampleNote',
        'This is an example of the message, not a live result. No test has been run on this page, and the model count above is what the adapter declares rather than what the provider returned. A real Test connection reports what actually came back.',
      )}
    </p>
    <p>
      {t(
        'connect.test.successNote',
        'A provider that cannot confirm a capability says so rather than offering it, and the same is true here.',
      )}
    </p>
  </div>

  <h3 class="connect-h3">
    {t('connect.test.failures', 'When it does not, one message per failure class')}
  </h3>
  <p class="connect-lede">
    {t(
      'connect.test.failuresLede',
      'Failure is specific, because a generic one leaves you nothing to act on. Each of these is keyed to a distinct error the provider or your browser actually returned.',
    )}
  </p>

  {#each failureClasses as failureClass (failureClass)}
    {@const message = failureMessage(failureClass, descriptor)}
    <div
      class="connect-result"
      data-severity={message.severity}
      data-failure-class={failureClass}
      data-testid={`failure-${failureClass}`}
    >
      <h4>{message.headline}</h4>
      <p>{message.detail}</p>
      <p>
        <span class="remedy-label">{t('connect.test.remedy', 'What to do:')}</span>
        {message.remedy}
      </p>
      {#if message.actions.length > 0}
        <div class="connect-result-links">
          {#each message.actions as action (action.href + action.label)}
            <a href={action.href}>{action.label}</a>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</section>

<!-- Step 4 — what you can now do. -->
<section class="connect-section" id="step-4" aria-labelledby="step-4-heading">
  <h2 id="step-4-heading">{t('connect.step4', 'Step 4 — What you can now do')}</h2>
  <p class="connect-lede">
    {t(
      'connect.step4.declared',
      'These are the operations this provider’s adapter implements, and each links straight to the tool. A test confirms which of them your account can actually use; until one has run, they are listed, not promised.',
    )}
  </p>

  <div class="connect-unlock">
    {#each capabilities as capability (capability)}
      {@const route = capabilityRoute(capability)}
      <a
        href={route?.href ?? '/connect-ai'}
        aria-disabled={route ? undefined : 'true'}
        data-capability={capability}
        data-testid={`unlock-${capability}`}
      >
        <strong>{CAPABILITY_LABELS[capability]}</strong>
        <span>{CAPABILITY_DESCRIPTIONS[capability]}</span>
      </a>
    {/each}
  </div>

  {#if descriptor.models.length > 0}
    <h3 class="connect-h3">{t('connect.models', 'Models this adapter offers')}</h3>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="connect-scroll" tabindex="0" role="group" aria-label="Models">
      <table class="connect-table">
        <caption>
          {t(
            'connect.models.caption',
            'Declared in the adapter, not fetched live. A test can confirm which of them your account can use.',
          )}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t('connect.models.model', 'Model')}</th>
            <th scope="col">{t('connect.models.caps', 'Can')}</th>
            <th scope="col">{t('connect.models.note', 'Note')}</th>
          </tr>
        </thead>
        <tbody>
          {#each descriptor.models as model (model.id)}
            <tr>
              <th scope="row">{model.label}</th>
              <td>
                <span class="connect-caps">
                  {#each model.capabilities as capability (capability)}
                    <span class="connect-cap">{CAPABILITY_LABELS[capability]}</span>
                  {/each}
                </span>
              </td>
              <td>{model.notes ?? ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <h3 class="connect-h3">{t('connect.otherPages', 'Before you start')}</h3>
  <div class="connect-subpages">
    <a href="/connect-ai/self-hosted">
      <strong>{t('connect.sub.selfHosted', 'Running a model on your own machine?')}</strong>
      <span
        >{t(
          'connect.sub.selfHostedBody',
          'Verified CORS commands for Ollama, LM Studio, vLLM, and LiteLLM.',
        )}</span
      >
    </a>
    <a href="/connect-ai/relay">
      <strong>{t('connect.sub.relay', 'Browser blocked the request?')}</strong>
      <span>{t('connect.sub.relayBody', 'What a relay is and exactly what it can see.')}</span>
    </a>
    <a href="/connect-ai/cost">
      <strong>{t('connect.sub.cost', 'What this will cost')}</strong>
      <span>{t('connect.sub.costBody', 'How image pricing works and where the money goes.')}</span>
    </a>
  </div>
</section>
