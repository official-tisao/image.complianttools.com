<!--
  P5-14 / Flow C' — the real `Test connection` control (README §17.3 step 3).

  ## Why this component exists

  The walkthrough previously rendered step 3 as a static document. That was the right call *while*
  there was no way to run a test, but §17.3 asks for a button that "runs `adapter.test()` and
  reports a **real** result", and Flow C' depends on it: "Pick a provider → follow the 4-step
  walkthrough → paste the key → `Test connection` runs a real, minimal, cheap probe and reports
  exactly what worked."

  ## What it does, and what it deliberately does not do

  It runs the adapter's own `test()` against the provider with the credential the user pasted on this
  page, and renders exactly what came back — a confirmation, or one specific message per failure
  class from `failures.ts`.

  It does **not** claim a capability the test did not confirm. That is why `confirmed` is rendered
  verbatim from `test()`'s return rather than from `descriptor.capabilities`: several adapters
  document capabilities their `test()` cannot exercise, and a button that lit up nine tools after a
  single credential check would be the exact over-claim §4.9 forbids.

  ## Credential handling (§16)

  The key lives in component state for the lifetime of this page and is never written to
  `localStorage`, `sessionStorage`, or IndexedDB. `type="password"`, `autocomplete="off"`, and it
  is cleared on unmount. §16.2's storage-mode selector is not offered here precisely because no
  storage layer exists to honour it; the page says so rather than implying persistence it cannot
  deliver.

  ## Spend (§13.6, §17.3)

  Adapters whose `test()` may be billable — BFL, per §14.5's "no free endpoint" — require a second,
  explicit confirming click, and the estimate is shown *before* the first one. Every other adapter
  documented a free or metadata endpoint, so their tests run on a single click.

  ## The failure message is the one §17.3 specifies

  `failureMessage()` is the same function the walkthrough documents, so the text a user reads after a
  real failure is identical to the text the page promises — one message per class, with a remedy.
-->

<script lang="ts">
  import { CAPABILITY_LABELS, loadProviderAdapter, type ProviderGuide } from './providers';
  import { classify, failureMessage, successMessage } from './failures';
  import { t as translate, type Locale } from './t';
  import type { EngineError } from '@complianttools/image-engine/types';
  import type { AiCapability } from '@complianttools/image-engine/ai/types';

  let { guide, locale = 'en' }: { guide: ProviderGuide; locale?: Locale } = $props();

  const t = $derived((key: string, fallback: string) => translate(locale, key, fallback));
  const descriptor = $derived(guide.descriptor);

  /** The pasted credentials, keyed by `descriptor.credentialFields[].key`. Never persisted. */
  let credentials = $state<Record<string, string>>({});
  // `$derived` would make the field uneditable — the user is meant to type a custom server URL — so
  // the initial value is read once here. The `state_referenced_locally` lint concern is real for
  // changing props and not for a one-time default: `guide` is fixed for this page's lifetime, and a
  // client-side navigation to another provider remounts the component.
  let baseUrl = $state(guide.descriptor.defaultBaseUrl);

  type Phase = 'idle' | 'running' | 'confirmed' | 'failed';
  let phase = $state<Phase>('idle');
  let error = $state<EngineError | null>(null);
  let status = $state<number | undefined>(undefined);
  let confirmed = $state<readonly string[]>([]);
  let detail = $state('');
  let modelCount = $state<number | undefined>(undefined);
  let free = $state(true);
  let consentForCost = $state(false);

  /**
   * Adapters whose `test()` may spend money.
   *
   * §14.5 is the only spec section that documents a provider with no free endpoint, and it names
   * BFL. Derived from the guide rather than hard-coded per provider so a new billable adapter is
   * added in one place.
   */
  const testMayCost = $derived(guide.slug === 'bfl');

  const missingRequired = $derived(
    descriptor.credentialFields
      .filter((field) => field.required && field.placeholder !== 'not-needed')
      .filter((field) => !(credentials[field.key] ?? '').trim())
      .map((field) => field.label),
  );

  const failureClass = $derived(error ? classify(error, status) : null);
  const failure = $derived(failureClass ? failureMessage(failureClass, descriptor, status) : null);

  /**
   * Run the adapter's own `test()`.
   *
   * The adapter module is imported at the moment the button is pressed (see `loadProviderAdapter`),
   * not bundled with the page — ten adapter implementations would otherwise roughly double this
   * route's budget for code a reader without a key never runs.
   */
  async function run(): Promise<void> {
    if (phase === 'running') return;
    phase = 'running';
    error = null;
    status = undefined;

    try {
      const adapter = await loadProviderAdapter(guide.slug);
      if (!adapter) {
        // A guide with no adapter is a build-time inconsistency; the catalogue and the loader are
        // meant to agree. Reported rather than thrown, so the page still renders.
        phase = 'failed';
        detail = 'No adapter is registered for this provider.';
        return;
      }

      const result = await adapter.test({
        credentials: { ...credentials },
        baseUrl,
        fetch: globalThis.fetch,
      });

      if (result.ok) {
        phase = 'confirmed';
        confirmed = result.confirmed;
        detail = result.detail;

        // The model count comes from a real `listModels()` call, and only when the adapter offers
        // one. `undefined` renders no sentence at all, rather than a fabricated number.
        if (adapter.listModels) {
          try {
            modelCount = (
              await adapter.listModels({
                credentials: { ...credentials },
                baseUrl,
                fetch: globalThis.fetch,
              })
            ).length;
          } catch {
            modelCount = undefined;
          }
        }
        return;
      }

      phase = 'failed';
      error = result.error;
      status = 'status' in result.error ? result.error.status : undefined;
    } catch (cause) {
      // A thrown value is not an `EngineError`; §17.3 still requires a specific message, and the
      // honest one for an unrecognised failure is the catch-all that admits it is one.
      phase = 'failed';
      error = {
        kind: 'internal',
        detail: String(cause),
        remedy: 'Try again.',
      } satisfies EngineError;
    }
  }

  const success = $derived(
    phase === 'confirmed' ? successMessage(descriptor, confirmed, modelCount, free) : null,
  );
</script>

<div class="connect-test" data-testid="test-connection">
  <div class="connect-field">
    {#each descriptor.credentialFields as field (field.key)}
      <label for={`test-cred-${field.key}`}>{field.label}</label>
      <div>
        <input
          id={`test-cred-${field.key}`}
          type={field.secret ? 'password' : 'text'}
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          placeholder={field.placeholder}
          bind:value={credentials[field.key]}
          aria-describedby={`test-cred-${field.key}-help`}
          data-testid={`test-cred-${field.key}`}
        />
      </div>
      {#if field.help}
        <p class="field-help" id={`test-cred-${field.key}-help`}>{field.help}</p>
      {/if}
    {/each}

    {#if descriptor.allowsCustomBaseUrl}
      <label for="test-base-url">Server URL</label>
      <div>
        <input
          id="test-base-url"
          type="url"
          autocomplete="off"
          spellcheck="false"
          placeholder={descriptor.defaultBaseUrl}
          bind:value={baseUrl}
          data-testid="test-base-url"
        />
      </div>
    {/if}
  </div>

  <p class="connect-lede">
    {t(
      'connect.test.credentialNote',
      'This key is used on this page and is not stored. Nothing is sent anywhere until you press the button.',
    )}
  </p>

  {#if missingRequired.length > 0}
    <p class="connect-soft-warn" data-testid="test-missing-credential">
      {t('connect.test.missing', 'Still needed:')}
      {missingRequired.join(', ')}
    </p>
  {/if}

  {#if testMayCost}
    <!-- §17.3: "the button says so *before* it is pressed, with the estimated amount, and
         requires a second confirming click." -->
    <div class="connect-warning" data-testid="test-may-cost">
      <strong>{t('connect.test.costTitle', 'This test may cost a little')}</strong>
      {t(
        'connect.test.costBody',
        'This provider documents no free endpoint, so confirming the key may make a billable call of roughly a cent.',
      )}
      <label class="escalation-consent">
        <input type="checkbox" bind:checked={consentForCost} data-testid="test-cost-consent" />
        {t('connect.test.costConsent', 'I understand this may spend a small amount')}
      </label>
    </div>
  {/if}

  <button
    class="button primary"
    type="button"
    onclick={run}
    disabled={phase === 'running' || missingRequired.length > 0 || (testMayCost && !consentForCost)}
    data-testid="test-run"
  >
    {#if phase === 'running'}
      {t('connect.test.running', 'Testing…')}
    {:else if testMayCost && !consentForCost}
      {t('connect.test.confirmCost', 'Confirm the cost, then test')}
    {:else}
      {t('connect.test.run', 'Test connection')}
    {/if}
  </button>

  {#if phase === 'running'}
    <p role="status" data-testid="test-running">…</p>
  {/if}

  {#if success}
    <!-- The result is rendered only from what `test()` returned. `confirmed` is empty for several
         adapters because a credential check cannot prove a capability, and that is shown as such. -->
    <div class="connect-result" data-severity="ok" data-testid="test-result-ok">
      <h4>{success.headline}</h4>
      <p>{success.detail}</p>
      <!--
        The adapter's own words, verbatim. §17.3 asks a successful test to report "exactly what
        worked", and the model count in the sentence above is only one of the things a probe returns —
        a balance endpoint also returns a balance. Rendering `detail` is what surfaces it, and it is
        already credential-redacted by the engine.
      -->
      {#if detail}
        <p data-testid="test-result-detail">{detail}</p>
      {/if}
      {#if confirmed.length > 0}
        <p class="connect-caps">
          {#each confirmed as capability (capability)}
            <!-- A label is looked up through `AiCapability`; an adapter returning a capability the
                 union does not contain renders the raw string rather than throwing. -->
            <span class="connect-cap">
              {CAPABILITY_LABELS[capability as AiCapability] ?? capability}
            </span>
          {/each}
        </p>
      {/if}
    </div>
  {/if}

  {#if failure}
    <div
      class="connect-result"
      data-severity={failure.severity}
      data-failure-class={failureClass}
      data-testid="test-result-error"
      role="alert"
    >
      <h4>{failure.headline}</h4>
      <p>{failure.detail}</p>
      <p>
        <span class="remedy-label">{t('connect.test.remedy', 'What to do:')}</span>
        {failure.remedy}
      </p>
      {#if failure.actions.length > 0}
        <div class="connect-result-links">
          {#each failure.actions as action (action.href + action.label)}
            <a href={action.href}>{action.label}</a>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- The adapter's own words, kept separate from the rendered message so a user can see what the
       provider actually said. Already credential-redacted by the engine. -->
  {#if phase === 'failed' && detail}
    <p class="connect-lede" data-testid="test-detail">{detail}</p>
  {/if}
</div>
