<!--
  P5-16 — the escalation control for every `Local ⇗AI` tool (README §12.3, §13.2, §22.6a).

  PLAN P5-06 specifies an `EscalationControl` that "states provider, capability, and estimated cost
  **before** it is pressed; never a primary button; never focused by default". PLAN P5-16 is what
  makes it load-bearing: its companion test presses it once and asserts **exactly one** provider
  request, so a control that fired twice, or fired on render, or fired before consent would be caught
  by CI rather than by a user's bill.

  Three properties are structural here, not stylistic:

  - **The estimate is rendered above the button and computed on selection**, so the cost is readable
    before the gesture. It is never a post-hoc figure.
  - **Nothing is requested except from the click handler.** There is no `$effect` that requests, no
    `onMount` that requests, and no watcher on the local result. The one call site is `escalate()`.
  - **The button is not `class="primary"`** and carries no autofocus, so an accidental Enter on
    another control cannot reach it.

  The request itself goes through `runProviderRequest`, which is the single gate every provider call
  in this app passes (§4.9). This component adds no second path.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { AiCapability } from '@complianttools/image-engine/ai/types';
  import type { RasterImage } from '@complianttools/image-engine/types';
  import { buildCostEstimate, runProviderRequest, type CostEstimate } from './run-provider-request';
  import { loadAdapterFor, providerOptionsFor, withheldProvidersFor } from './providers';
  import { IMPLEMENTED_ADAPTER_IDS } from './implemented-adapters';
  import { translate, type Locale } from '../i18n';

  type Failure = {
    readonly headline: string;
    readonly detail: string;
    readonly remedy: string;
    readonly severity: 'error' | 'warning';
    readonly token?: string;
  };

  let {
    capability,
    /** The local result, rendered beside the AI one so the comparison is real. */
    localResultUrl,
    /** Decodes to the `RasterImage` the adapters expect, or `undefined` to be gated out locally. */
    buildImage,
    /** Extra request fields the capability needs (a prompt, a scale factor, a trimap). */
    buildRequest = () => ({}),
    locale = 'en',
  }: {
    capability: AiCapability;
    localResultUrl: string;
    buildImage?: () => Promise<RasterImage | undefined>;
    buildRequest?: () => Record<string, unknown>;
    locale?: Locale;
  } = $props();

  /**
   * Every string below routes through the shared translator, as the sibling tool components do.
   *
   * `translate` picks the Arabic string when one is registered and pseudo-localizes the English
   * fallback otherwise, so `en-XA` renders in the bracketed pseudo-locale rather than plain English.
   * The English literals stay visible as the fallback argument, which is what makes an untranslated
   * string degrade to readable English instead of to a key.
   */
  const t = $derived((key: string, fallback: string) => translate(locale, key, fallback));

  const options = $derived(providerOptionsFor(capability));
  const defaultValue = $derived(options[0]?.value ?? '');
  let selected = $state('');
  $effect(() => {
    const first = defaultValue;
    if (first === '') return;
    if (selected === '' || !options.some((option) => option.value === selected)) selected = first;
  });

  /**
   * Providers withheld for this capability, so an empty picker is explained rather than silent.
   *
   * §17.3's contract is that every absence has a reason. Today only `describe` and `inpaint` have an
   * adapter whose `run()` really performs the capability, so the other four escalation routes render
   * this explanation instead of a disabled button nobody can reason about.
   */
  const withheld = $derived(
    withheldProvidersFor(capability, IMPLEMENTED_ADAPTER_IDS).filter(
      (entry) => entry.reason === 'not-implemented',
    ),
  );
  const hasProviders = $derived(options.length > 0);

  let apiKey = $state('');
  let consent = $state(false);
  let busy = $state(false);
  let estimate = $state<CostEstimate | undefined>();
  let estimateFor = $state('');
  let aiResultUrl = $state('');
  let aiProviderName = $state('');
  let costIncurred = $state('');
  let failure = $state<Failure | undefined>();
  let requestCount = $state(0);

  /**
   * The estimate, recomputed whenever the selection changes.
   *
   * An effect, not a click handler, because §13.6 requires the cost to be known *before* the request
   * and the user must be able to read it and change their mind. The key guard stops a slower earlier
   * estimate from overwriting a newer one after the user has already switched models.
   */
  $effect(() => {
    const choice = options.find((option) => option.value === selected);
    const key = `${selected}:${capability}`;
    if (!choice) {
      estimate = undefined;
      estimateFor = key;
      return;
    }
    if (key === estimateFor) return;
    let cancelled = false;
    void buildCostEstimate(choice.descriptor, choice.model?.id ?? '', capability, 1).then(
      (value) => {
        if (cancelled) return;
        estimate = value;
        estimateFor = key;
      },
    );
    return () => {
      cancelled = true;
    };
  });

  /**
   * The one call site.
   *
   * Reached only from the button's `onclick`. If this handler is ever called from a mount, an effect,
   * or a watcher, `requestCount` below makes it visible to the test suite rather than invisible in
   * production.
   */
  async function escalate() {
    if (busy) return;
    const choice = options.find((option) => option.value === selected);
    if (!choice) return;
    busy = true;
    failure = undefined;
    try {
      const adapter = await loadAdapterFor(choice.descriptor.id);
      if (!adapter) {
        failure = {
          headline: 'That provider could not be loaded',
          detail: 'Nothing was sent.',
          remedy: 'Pick a different provider, or reload the page.',
          severity: 'error',
          token: 'provider-unavailable',
        };
        return;
      }
      const image = buildImage ? await buildImage() : undefined;
      const outcome = await runProviderRequest({
        capability,
        descriptor: choice.descriptor,
        adapter,
        consent,
        credentials: { apiKey },
        baseUrl: '',
        request: {
          capability,
          model: choice.model?.id ?? '',
          ...(image ? { image } : {}),
          ...buildRequest(),
        },
      });
      if (!outcome.ok) {
        failure = { ...outcome.error.message, token: outcome.error.message.class };
        return;
      }
      requestCount += 1;
      const returnedFrame = outcome.value.result.images?.[0]?.frames[0];
      const preview = returnedFrame ? previewUrlFor(returnedFrame) : undefined;
      if (preview) {
        if (aiResultUrl) URL.revokeObjectURL(aiResultUrl);
        aiResultUrl = preview;
      }
      aiProviderName = choice.descriptor.name;
      costIncurred =
        outcome.value.providerCostNote ??
        (outcome.value.estimate.available && outcome.value.estimate.amount !== undefined
          ? `≈ ${outcome.value.estimate.amount.toFixed(4)} USD estimated`
          : outcome.value.estimate.label);
    } finally {
      busy = false;
    }
  }

  /**
   * Turn a returned frame into a previewable object URL.
   *
   * An `AiResult` frame carries **encoded** image bytes — a PNG/JPEG/WebP/GIF as the provider sent
   * it — not decoded RGBA. `AiTool.svelte` renders those straight into a `Blob`, and treating them
   * as pixels (`new ImageData(data, width, height)`) throws `InvalidStateError`, because an encoded
   * PNG is a few hundred bytes rather than `width * height * 4`.
   *
   * The magic-number sniff is the same one `AiTool.imageUrlFor` uses, and an unrecognised payload
   * returns `undefined` rather than a URL that would render broken.
   */
  function previewUrlFor(frame: { data: Uint8ClampedArray | Uint8Array }): string | undefined {
    const bytes = frame.data;
    if (bytes.length < 4) return undefined;
    const mime =
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        ? 'image/png'
        : bytes[0] === 0xff && bytes[1] === 0xd8
          ? 'image/jpeg'
          : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
            ? 'image/webp'
            : bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46
              ? 'image/gif'
              : undefined;
    if (mime === undefined) return undefined;
    // A copy into a fresh ArrayBuffer: a view over a shared buffer is not a valid BlobPart on
    // every engine.
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return URL.createObjectURL(new Blob([copy], { type: mime }));
  }

  function dismiss() {
    if (aiResultUrl) URL.revokeObjectURL(aiResultUrl);
    aiResultUrl = '';
    costIncurred = '';
    failure = undefined;
  }

  // A returned image is a Blob URL, and this component unmounts whenever the user changes the
  // source file. Without this the object's memory is held until the whole document is discarded.
  onDestroy(() => {
    if (aiResultUrl) URL.revokeObjectURL(aiResultUrl);
    aiResultUrl = '';
  });
</script>

<!--
  Rendered only once a local result exists. §17.7: on an escalation control the local result is
  already on screen, so this is an offer, not a gate. Gating on the parent keeps that true.
-->
<section class="escalation" aria-labelledby="escalation-heading" data-testid="escalation-control">
  <h3 id="escalation-heading">
    {t('escalation.heading', 'Try this with an AI model?')}
  </h3>
  <p class="escalation-lead">
    {t(
      'escalation.lead',
      'The result above was made on your device, free, and it is finished. This is optional: an AI model may do better, and it needs your own provider account — you pay them directly.',
    )}
  </p>

  {#if hasProviders}
    <label>
      {t('escalation.provider', 'Provider and model')}
      <select data-testid="escalation-provider" bind:value={selected}>
        {#each options as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>

    <label>
      {t('escalation.key', 'API key')}
      <input
        data-testid="escalation-key"
        type="password"
        bind:value={apiKey}
        autocomplete="off"
        placeholder={t('escalation.keyPlaceholder', 'Your own provider key')}
      />
    </label>

    <!--
      The cost sits above the button and is an estimate, never a settled figure. When the price table
      has no entry the label says so; inventing a number is the failure mode this prevents.
    -->
    {#if estimate}
      <p
        class="escalation-estimate"
        role="status"
        data-testid="escalation-estimate"
        data-available={estimate.available ? 'true' : 'false'}
        data-table={estimate.tableVersion}
      >
        {estimate.label}
      </p>
    {/if}

    <label class="escalation-consent">
      <input data-testid="escalation-consent" type="checkbox" bind:checked={consent} />
      {t(
        'escalation.consent',
        'Send this image to the provider named above, at the cost stated above.',
      )}
    </label>

    <!--
      Not `primary`, and never autofocused: the local result's own download button stays the primary
      action on this page (§13.1.2 — the local tier is the default, permanently).
    -->
    <button
      data-testid="escalation-submit"
      type="button"
      class="escalation-button"
      disabled={busy || !consent}
      onclick={escalate}
    >
      {busy
        ? t('escalation.requesting', 'Requesting…')
        : t('escalation.submit', 'Send to the provider')}
    </button>
  {:else}
    <!--
      §17.3: an absence is explained, never silently missing. These routes have a local path that
      works and a register row admitting a Tier 3 case, but no adapter yet performs the capability,
      so there is nothing to offer. Saying so is honest; rendering a permanently disabled button
      would read as a bug.
    -->
    <p class="escalation-note" data-testid="escalation-unavailable">
      {t(
        'escalation.unavailable',
        'No provider currently performs this operation, so there is nothing to escalate to yet. The result above was made on your device and is complete.',
      )}
    </p>
    {#if withheld.length > 0}
      <details data-testid="escalation-withheld">
        <summary>{t('escalation.withheld', 'Why these providers are not offered')}</summary>
        <ul>
          {#each withheld as entry (entry.descriptor.id)}
            <li>{entry.message}</li>
          {/each}
        </ul>
      </details>
    {/if}
  {/if}

  <p class="escalation-note">
    {t(
      'escalation.note',
      'Nothing is sent until you press the button, and nothing is sent at all without the tick above.',
    )}
  </p>

  {#if failure}
    <!--
      §17.3's shape, matching `AiTool.svelte`: the prose is what a person reads, and the stable
      token is what the tests key on. The token is rendered rather than kept in an attribute so a
      refusal can be identified by name from the page itself.
    -->
    <div
      role="alert"
      data-testid="escalation-error"
      data-severity={failure.severity}
      data-error={failure.token ?? ''}
    >
      <p class="headline">{failure.headline}</p>
      <p>{failure.detail}</p>
      <p class="remedy">{failure.remedy}</p>
    </div>
  {/if}

  <!--
    The AI result is shown *against* the local one rather than replacing it. §13.1.2's "a tier is
    never removed" means the local result stays downloadable however the escalation went.
  -->
  {#if aiResultUrl}
    <div class="escalation-compare" data-testid="escalation-result">
      <figure>
        <figcaption>
          {t('escalation.localCaption', 'Local')}
          <span data-testid="escalation-local-badge">{t('escalation.localBadge', 'Local')}</span>
        </figcaption>
        <img
          src={localResultUrl}
          alt={t('escalation.localAlt', 'The local result')}
          data-testid="escalation-local-image"
        />
      </figure>
      <figure>
        <figcaption>
          {aiProviderName}
          <span data-testid="escalation-ai-badge">{t('escalation.aiBadge', 'Provider')}</span>
        </figcaption>
        <img
          src={aiResultUrl}
          alt={t('escalation.aiAlt', 'The result returned by the provider')}
          data-testid="escalation-ai-image"
        />
      </figure>
      <p data-testid="escalation-cost">{costIncurred}</p>
      <button
        type="button"
        class="escalation-button"
        data-testid="escalation-dismiss"
        onclick={dismiss}
      >
        {t('escalation.dismiss', 'Keep the local result')}
      </button>
    </div>
  {/if}

  <!-- Test-only counter. Not a control: it exists so §22.6a's companion test can assert a request
       *count* rather than that a handler ran, which is a much weaker claim. -->
  <span hidden data-testid="escalation-request-count">{requestCount}</span>
</section>

<style>
  .escalation {
    display: grid;
    gap: 12px;
    margin: 24px auto;
    padding: 20px;
    border: 1px solid #1c6dd51f;
    border-radius: 12px;
    background: #f7fbff;
  }
  .escalation-lead,
  .escalation-note {
    margin: 0;
    color: #4a5568;
    font-size: 0.9rem;
    line-height: 1.5;
  }
  label {
    display: grid;
    gap: 6px;
    font-weight: 600;
  }
  .escalation-consent {
    font-weight: 400;
  }
  .escalation-estimate {
    margin: 0;
    font-size: 0.9rem;
  }
  .escalation-button {
    justify-self: start;
    padding: 0.5rem 1rem;
    border: 1px solid #1c6dd5;
    border-radius: 8px;
    background: #fff;
    color: #1c6dd5;
    font: inherit;
    cursor: pointer;
  }
  .escalation-button[disabled] {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .escalation-compare {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    align-items: start;
    margin: 0;
    padding-top: 12px;
    border-top: 1px solid #1c6dd52e;
  }
  .escalation-compare figure {
    display: grid;
    gap: 8px;
    margin: 0;
  }
  .escalation-compare img {
    max-width: 100%;
    border: 1px solid #1c6dd52e;
    border-radius: 8px;
    background: #f2f2f2;
  }
</style>
