<script lang="ts">
  /**
   * P5-15 — T64 Generate / T65 Prompt Edit / T71 Describe (README §4.9).
   *
   * What changed, and why each part is not optional:
   *
   * - **Provider/model picker instead of free-text URL + model.** §13.2 binds tools to
   *   capabilities; a URL cannot be capability-checked. `providerOptionsFor` filters the catalogue
   *   down to models whose adapter genuinely implements this capability, so the UI cannot offer a
   *   model for an operation its provider does not perform.
   *
   * - **The adapter runs the request, not a hand-rolled JSON envelope.** Each provider has its own
   *   body shape and auth header. The old inline `{capability, model, prompt, image}` POST matched
   *   none of them, and treated "the endpoint returned 200" as success — `response.body || 'Provider
   *   accepted the request.'` reported an empty response as a completed generation.
   *
   * - **Every gate lives in `runProviderRequest`.** Consent first, then configuration, then
   *   credentials, then the cost estimate, then path resolution, then the request. §4.9 requires the
   *   cost to be known *before* a potentially billable call.
   *
   * - **Failures go through §17.3's taxonomy.** `failures.ts` existed with eleven specific messages
   *   and nothing called it; every refusal and provider error now renders through it.
   *
   * - **T71's local skeleton is independent of all of this.** On `/ai/describe` the skeleton runs
   *   from the chosen file alone — no key, no endpoint, no consent, no request — and it is not gated
   *   on any of the provider form's state.
   */
  import { onMount } from 'svelte';
  import type { AiCapability, ProviderAdapter } from '@complianttools/image-engine/ai/types';
  import type { RasterImage } from '@complianttools/image-engine/types';
  import { setProviderRelay } from '@complianttools/image-engine/ai/connection';
  import ConnectEmptyState from './connect/ConnectEmptyState.svelte';
  import { AI_ONLY_STATE } from './connect/empty-states';
  import DescriptiveSkeleton from './ai/DescriptiveSkeleton.svelte';
  import {
    buildCostEstimate,
    runProviderRequest,
    type CostEstimate,
    type RequestOutcome,
  } from './ai/run-provider-request';
  import {
    endpointFor,
    loadAdapterFor,
    providerOptionsFor,
    withheldProvidersFor,
  } from './ai/providers';
  import { IMPLEMENTED_ADAPTER_IDS } from './ai/implemented-adapters';
  import '../connect.css';
  import { translate, type Locale } from './i18n';

  type AiKind = 'generate' | 'edit' | 'describe';
  let { kind, locale = 'en' }: { kind: AiKind; locale?: Locale } = $props();

  /** Ceiling on the decoded pixels we will hand a provider. Mirrors the skeleton’s own bound. */
  const MAX_REQUEST_PIXELS = 24_000_000;

  const CAPABILITY: Readonly<Record<AiKind, AiCapability>> = {
    generate: 'generate',
    edit: 'edit',
    describe: 'describe',
  };
  const capability = CAPABILITY[kind];

  const copy: Record<AiKind, { title: string; description: string; action: string }> = {
    generate: {
      title: 'AI Image Generator',
      description: 'Connect a provider you control to generate an image after explicit consent.',
      action: 'Request generation',
    },
    edit: {
      title: 'AI Image Editor',
      description: 'Connect a provider you control to edit an image after explicit consent.',
      action: 'Request edit',
    },
    describe: {
      title: 'AI Image Description',
      description: 'Connect a provider you control to describe an image after explicit consent.',
      action: 'Request description',
    },
  };
  const arabic: Record<AiKind, string> = {
    generate: 'مولد الصور بالذكاء الاصطناعي',
    edit: 'محرر الصور بالذكاء الاصطناعي',
    describe: 'وصف الصور بالذكاء الاصطناعي',
  };
  const title = $derived(
    locale === 'ar'
      ? arabic[kind]
      : locale === 'en-XA'
        ? `［${copy[kind].title} ~~］`
        : copy[kind].title,
  );
  const canonicalPath = $derived(locale === 'en' ? `/ai/${kind}` : `/${locale}/ai/${kind}`);

  // Provider selection. The catalogue is descriptor-only, so this costs no adapter bytes.
  const options = $derived(providerOptionsFor(capability));
  const withheld = $derived(withheldProvidersFor(capability, IMPLEMENTED_ADAPTER_IDS));

  /**
   * The selected option, defaulted rather than left empty.
   *
   * `selected` is bound to the `<select>`, and an unbound `<select>` reports its first option as the
   * visible value while `bind:value` still reads `''` — so seeding the state with the first option's
   * value keeps the binding, the derived choice, and what the user sees in agreement. Without it,
   * `providerChoice` resolved to `undefined` and nothing downstream (the estimate row, the request)
   * had a provider to work with.
   */
  const defaultValue = $derived(options[0]?.value ?? '');
  let selected = $state('');
  $effect(() => {
    // Re-seed when the option set changes; keep the user's own choice when it is still valid.
    const first = defaultValue;
    if (first === '') return;
    if (selected === '' || !options.some((option) => option.value === selected)) {
      selected = first;
    }
  });
  const providerChoice = $derived(
    options.find((option) => option.value === selected) ?? options[0],
  );

  let apiKey = $state('');
  let baseUrl = $state('');
  let prompt = $state('');
  let imageFile = $state<File | undefined>();
  let consent = $state(false);
  let busy = $state(false);
  let hydrated = $state(false);
  let online = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
  $effect(() => {
    if (typeof window === 'undefined') return;
    const update = () => (online = navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  });

  // P5-13 (README §15.4) — Connection: Direct (recommended) | Via my relay. The relay URL and
  // token are component and module state only: never localStorage, sessionStorage, or IndexedDB.
  let connection = $state<'direct' | 'relay'>('direct');
  let relayUrl = $state('');
  let relayToken = $state('');
  let pathNote = $state('');
  let usedPath = $state<'direct' | 'relay' | ''>('');

  let estimate = $state<CostEstimate | undefined>();
  let estimateFor = $state('');
  let failure = $state<
    | {
        headline: string;
        detail: string;
        remedy: string;
        severity: string;
        /** The machine-readable refusal token, also exposed as `data-error` on the alert. */
        token: string;
      }
    | undefined
  >();
  let resultText = $state('');
  let resultImages = $state<string[]>([]);

  function t(key: string, fallback: string) {
    return translate(locale, key, fallback);
  }

  function selectImage(event: Event) {
    imageFile = (event.currentTarget as HTMLInputElement).files?.[0];
  }

  /**
   * The path note for a request that did not complete.
   *
   * The runner only produces a `pathNote` on success, but §15.4's rule is that the user learns which
   * path was taken — including when it failed, so a broken relay is never mistaken for a direct
   * attempt. Built from the same inputs the router used.
   */
  function describePathNote(path: 'direct' | 'relay', relayUrlValue: string): string {
    if (path === 'relay') {
      let host = relayUrlValue;
      try {
        host = new URL(relayUrlValue).host;
      } catch {
        // The gate already refused an unparseable relay; show what the user typed.
      }
      return `Via your relay — this request went to ${host}, which forwarded it to the provider.`;
    }
    return 'Direct — this request went straight to the provider.';
  }

  /**
   * Turn an adapter result frame into a displayable URL.
   *
   * The adapters return the provider's *encoded* image bytes (PNG/JPEG/WebP) in
   * `frames[0].data`, not a decoded RGBA buffer, so the format is sniffed from the magic bytes
   * rather than assumed. Returns `undefined` when the bytes are not a recognisable image — in which
   * case the UI says the image arrived but cannot be previewed, instead of rendering a broken tile.
   */
  function imageUrlFor(frame: { data: Uint8ClampedArray | Uint8Array }): string | undefined {
    const bytes = frame.data;
    if (bytes.length < 4) return undefined;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
    const mime = isPng
      ? 'image/png'
      : isJpeg
        ? 'image/jpeg'
        : isWebp
          ? 'image/webp'
          : isGif
            ? 'image/gif'
            : undefined;
    if (mime === undefined) return undefined;
    // A copy into a fresh ArrayBuffer: `Uint8ClampedArray` and `Uint8Array` views over a shared
    // buffer are not valid BlobPart types on every engine.
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return URL.createObjectURL(new Blob([copy], { type: mime }));
  }

  /**
   * The pre-request estimate, recomputed when the selection changes.
   *
   * Shown while the user can still decline, which is the entire point of §13.6. A pair with no
   * documented price yields `available: false` and says so — no fabricated figure, no silent zero.
   *
   * Failures resolve to `available: false` rather than rejecting. `estimateRequestCost` reads a
   * price table from IndexedDB, and IndexedDB is unavailable in a private window or a blocked
   * storage context; an unhandled rejection there would leave the estimate row simply missing,
   * which reads as "no cost information exists at all" rather than "we could not load the table".
   */
  $effect(() => {
    if (typeof window === 'undefined') return;
    const choice = providerChoice;
    if (choice === undefined) return;
    const model = choice.model?.id ?? '';
    const key = `${capability}:${model}`;
    if (key === estimateFor) return;
    let cancelled = false;
    // Claim the key only once the result has been committed. Claiming it up front meant the seeding
    // effect's re-run cancelled the very promise that would have set `estimate`, and the row stayed
    // missing for the whole session.
    void buildCostEstimate(choice.descriptor, model, capability)
      .catch(() => ({
        available: false,
        label:
          'Estimate unavailable — the local price table could not be read, so no figure is shown ' +
          'rather than a guessed one. Check your provider’s own pricing page before running this.',
        tableVersion: 'unavailable',
      }))
      .then((value) => {
        if (cancelled) return;
        estimate = value;
        estimateFor = key;
      });
    return () => {
      cancelled = true;
    };
  });

  async function run() {
    const choice = providerChoice;
    failure = undefined;
    resultText = '';
    if (choice === undefined) {
      failure = {
        headline: 'No provider available',
        detail:
          'No provider on offer really implements this operation, so there is nothing to call.',
        remedy: 'See the connect page for which providers declare it, and why some are withheld.',
        severity: 'error',
        token: 'capability-unsupported',
      };
      return;
    }

    busy = true;
    try {
      // The endpoint is validated locally before the adapter is even loaded.
      const endpoint = endpointFor(choice.descriptor, baseUrl);
      if (!endpoint.ok) {
        failure = {
          headline: 'That endpoint will not work',
          detail: 'Nothing was sent.',
          remedy: endpoint.error,
          severity: 'error',
          token: 'provider-invalid',
        };
        return;
      }

      const adapter: ProviderAdapter | undefined = await loadAdapterFor(choice.descriptor.id);
      if (adapter === undefined) {
        failure = {
          headline: 'That provider could not be loaded',
          detail: 'Nothing was sent.',
          remedy: 'Pick a different provider, or reload the page.',
          severity: 'error',
          token: 'provider-unavailable',
        };
        return;
      }

      setProviderRelay(
        `ai-tool-${kind}`,
        connection === 'relay' ? { relayUrl, token: relayToken } : undefined,
      );

      const outcome: RequestOutcome = await runProviderRequest({
        capability,
        descriptor: choice.descriptor,
        adapter,
        consent,
        credentials: { apiKey },
        baseUrl: baseUrl.trim(),
        relay: connection === 'relay' ? { relayUrl, token: relayToken } : undefined,
        request: await buildRequest(choice.model?.id ?? ''),
      });

      if (!outcome.ok) {
        // The path is reported even on failure. A relayed request that failed is still a relayed
        // request, and saying so is what stops it looking like the app quietly tried direct.
        usedPath = connection;
        pathNote = describePathNote(connection, relayUrl);
        failure = {
          ...outcome.error.message,
          severity: outcome.error.message.severity,
          // The refusal token when the request was gated locally; otherwise the §17.3 class, which
          // is the closest stable label for a provider-side failure.
          token: outcome.error.refusal ?? outcome.error.message.class,
        };
        return;
      }

      usedPath = outcome.value.usedPath;
      pathNote = outcome.value.pathNote;
      estimate = outcome.value.estimate;
      const usableText = outcome.value.result.text ?? '';
      if (capability === 'describe') {
        resultText = usableText;
      } else {
        // A usable result has at least one frame; `resultIsUsable` already guaranteed that. Frames
        // whose bytes are not a recognisable image are reported rather than rendered broken.
        const frames = (outcome.value.result.images ?? []).map((image) => image.frames[0]);
        const urls = frames.map((frame) => (frame === undefined ? undefined : imageUrlFor(frame)));
        resultImages = urls.filter((url): url is string => url !== undefined);
        const unrenderable = urls.length - resultImages.length;
        resultText =
          `${resultImages.length} image${resultImages.length === 1 ? '' : 's'} returned` +
          (unrenderable > 0
            ? ` · ${unrenderable} arrived but could not be previewed; the response format is not recognised.`
            : '.');
      }
    } finally {
      busy = false;
    }
  }

  /**
   * The adapter request body.
   *
   * The image is decoded to a `RasterImage` here rather than passed as a data URI, because that is
   * what `AiRequest` declares and what every adapter expects. A decode failure is a `decode-failed`
   * in the gate's own vocabulary: the request is refused rather than sent without its image.
   */
  /**
   * The adapter request body.
   *
   * `AiRequest.image` is a decoded `RasterImage`, not a data URI — every adapter decodes it itself,
   * so passing the `File` through as bytes would have left `edit` permanently unusable (the gate saw
   * no image and refused). Decoding happens here, on the user's explicit request action, and a
   * decode failure surfaces as the gate's own `image-required` refusal rather than a silent no-op.
   */
  async function buildRequest(
    model: string,
  ): Promise<Parameters<typeof runProviderRequest>[0]['request']> {
    let image: RasterImage | undefined;
    if (capability !== 'generate' && imageFile !== undefined) {
      image = await decodeRasterForRequest(imageFile);
    }
    return {
      capability,
      model,
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
      ...(capability === 'describe' && prompt.trim() ? { question: prompt.trim() } : {}),
      ...(image ? { image } : {}),
    };
  }

  /**
   * Decode a chosen image to the `RasterImage` the adapters expect.
   *
   * Returns `undefined` on failure so the request is refused by the `image-required` gate with a
   * message the user can act on, rather than being sent without its image. Bounded by the same
   * pixel ceiling the skeleton uses, because a 100 MP photo would otherwise stall the main thread.
   */
  async function decodeRasterForRequest(file: File): Promise<RasterImage | undefined> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return undefined;
    }
    try {
      if (bitmap.width * bitmap.height > MAX_REQUEST_PIXELS) return undefined;
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) return undefined;
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
      return {
        width: bitmap.width,
        height: bitmap.height,
        colorSpace: 'srgb',
        bitDepth: 8,
        premultipliedAlpha: false,
        frames: [{ data: data.data, durationMs: 0 }],
      };
    } catch {
      return undefined;
    } finally {
      bitmap.close();
    }
  }

  onMount(() => {
    hydrated = true;
  });
</script>

<svelte:head>
  <title>{title} — Image Compliant Tools</title>
  <meta name="description" content={copy[kind].description} />
  <link rel="canonical" href={`https://image.complianttools.com${canonicalPath}`} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={copy[kind].description} />
</svelte:head>

<main
  class="ai-tool"
  lang={locale}
  dir={locale === 'ar' ? 'rtl' : 'ltr'}
  data-testid={`ai-${kind}`}
>
  <header><a href="/">ctimg</a><span>{t('privacy.badge', 'Local until you opt in')}</span></header>
  <section class="intro">
    <p class="eyebrow">BYOK provider connection</p>
    <h1>{title}</h1>
    <p>{copy[kind].description}</p>
    <p>Nothing is sent until you provide the endpoint and key and confirm consent.</p>
  </section>

  <!--
    T71 only: the local descriptive skeleton (§4.9, "Without a key"). It is rendered before and
    independently of the provider form, needs no key, no endpoint, no consent, and makes no request,
    and it stays available even when every provider control below is refused.
  -->
  {#if kind === 'describe'}
    <section class="picker-shell">
      <h2>{t('describe.localHeading', 'Start locally — no key needed')}</h2>
      <label
        >Choose an image <input
          data-testid="ai-local-image"
          type="file"
          accept="image/*"
          onchange={selectImage}
        /></label
      >
      {#if imageFile}
        <DescriptiveSkeleton file={imageFile} {locale} />
      {:else}
        <p class="hint" data-testid="ai-local-empty">
          {t(
            'describe.localEmpty',
            'Pick an image and a local report appears here: dimensions, aspect, dominant palette, transparency, orientation, face count, embedded text, and EXIF subject fields. Nothing leaves your device.',
          )}
        </p>
      {/if}
    </section>
  {/if}

  <section class="picker-shell">
    <h2>{t('provider.heading', 'Connect a provider — optional, and only for the AI step')}</h2>

    <form
      onsubmit={(event) => {
        event.preventDefault();
        void run();
      }}
    >
      <label
        >Provider and model <select data-testid="ai-provider" bind:value={selected}>
          {#each options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select></label
      >
      {#if withheld.length > 0}
        <details class="withheld">
          <summary data-testid="ai-withheld-summary">
            {t('provider.withheld', 'Why some providers are missing')}&nbsp;({withheld.length})
          </summary>
          <ul data-testid="ai-withheld-list">
            {#each withheld as entry (entry.descriptor.id)}
              <li data-testid={`ai-withheld-${entry.descriptor.id}`}>{entry.message}</li>
            {/each}
          </ul>
        </details>
      {/if}

      <label
        >API key <input
          data-testid="ai-key"
          type="password"
          bind:value={apiKey}
          placeholder="Paste a key for this session"
          autocomplete="off"
        /></label
      >
      {#if providerChoice?.descriptor.allowsCustomBaseUrl}
        <label
          >Base URL (optional for hosted providers) <input
            data-testid="ai-endpoint"
            type="url"
            bind:value={baseUrl}
            placeholder={providerChoice.descriptor.defaultBaseUrl}
            autocomplete="off"
          /></label
        >
      {/if}

      <fieldset data-testid="ai-connection">
        <legend>Connection</legend>
        <label class="radio"
          ><input
            type="radio"
            name={`connection-${kind}`}
            data-testid="ai-connection-direct"
            bind:group={connection}
            value="direct"
          /> Direct (recommended)</label
        >
        <label class="radio"
          ><input
            type="radio"
            name={`connection-${kind}`}
            data-testid="ai-connection-relay"
            bind:group={connection}
            value="relay"
          /> Via my relay</label
        >
        {#if connection === 'relay'}
          <label
            >Relay URL <input
              data-testid="ai-relay-url"
              type="url"
              bind:value={relayUrl}
              placeholder="https://ctimg-relay.<your-subdomain>.workers.dev"
              autocomplete="off"
            /></label
          >
          <label
            >Relay token (optional) <input
              data-testid="ai-relay-token"
              type="password"
              bind:value={relayToken}
              placeholder="Your RELAY_TOKEN, if you set one"
              autocomplete="off"
            /></label
          >
          <p class="hint">
            Kept in memory for this page only — not saved, and cleared on reload. A relay must be
            deployed by you, to your own account; we host none. See
            <a href="/connect-ai">Connect an AI provider</a>.
          </p>
        {/if}
      </fieldset>

      {#if kind === 'edit' || kind === 'describe'}
        <label
          >Image <input
            data-testid="ai-image"
            type="file"
            accept="image/*"
            onchange={selectImage}
          /></label
        >
      {/if}
      <label
        >{kind === 'describe' ? 'Question (optional)' : 'Instruction'}
        <textarea data-testid="ai-prompt" bind:value={prompt} rows="4"></textarea></label
      >

      <!--
        The estimate sits immediately above the request button, so it is read before the click and
        not after the charge. `available: false` renders the price table's own "no documented price"
        sentence rather than any number.
      -->
      {#if estimate}
        <p
          class="estimate"
          role="status"
          data-testid="ai-estimate"
          data-available={estimate.available ? 'true' : 'false'}
          data-table={estimate.tableVersion}
        >
          {estimate.label}
        </p>
      {/if}

      <label class="consent"
        ><input data-testid="ai-consent" type="checkbox" bind:checked={consent} /> I understand that the
        configured provider will receive this request and any included image data.</label
      >
      <button
        data-testid="ai-submit"
        data-hydrated={hydrated ? 'true' : 'false'}
        type="submit"
        disabled={busy || !online}
      >
      </button>
    </form>

    <!--
      P5-14 (README §17.7) — the AI-only empty state. On `/ai/describe` it is now only half the
      story: the local skeleton above already answers "what can I do without a key?", which is
      exactly the degradation §4.9 promises.
    -->
    <ConnectEmptyState route={`/ai/${kind}`} state={AI_ONLY_STATE} {locale} />

    {#if pathNote}
      <p data-testid="ai-path" data-path={usedPath || connection}>{pathNote}</p>
    {/if}
    {#if failure}
      <!--
        The token is rendered as visible text *and* mirrored to `data-error`. The prose is what a
        person reads; the token is the stable identifier the tests and the §17.3 taxonomy key on.
        Keeping it visible rather than attribute-only preserves the existing contract that a refusal
        can be identified by name from the page itself.
      -->
      <div
        role="alert"
        data-testid="ai-error"
        data-severity={failure.severity}
        data-error={failure.token}
      >
        <p class="headline">{failure.headline}</p>
        <p>{failure.detail}</p>
        <p class="remedy">{failure.remedy}</p>
        <p class="token"><code>{failure.token}</code></p>
      </div>
    {/if}
    {#if resultImages.length > 0}
      <div class="results" data-testid="ai-result-images">
        {#each resultImages as url (url)}
          <img src={url} alt="Result returned by the configured provider." />
        {/each}
      </div>
    {/if}
    {#if resultText}
      <pre data-testid="ai-result">{resultText}</pre>
    {/if}
  </section>

  <section class="faq">
    <h2>{t('seo.questions', 'Questions')}</h2>
    <details open>
      <summary>When does a request leave this device?</summary>
      <p>
        Only after you choose a provider, enter its key, and check the consent box. There are no
        embedded credentials and no default provider calls. On <code>/ai/describe</code>, the local
        report above never sends anything at all.
      </p>
    </details>
    <details>
      <summary>What does the local report on /ai/describe cost?</summary>
      <p>Nothing. It runs on your device with no key and no request.</p>
    </details>
  </section>
</main>

<style>
  .ai-tool {
    max-width: 60rem;
    margin: 0 auto;
    padding: 1.5rem;
    color: #172033;
  }
  header {
    display: flex;
    justify-content: space-between;
  }
  .intro {
    margin: 3rem 0 2rem;
  }
  .eyebrow {
    color: #52627a;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .picker-shell {
    margin: 2rem 0;
  }
  .picker-shell h2 {
    font-size: 1.1rem;
  }
  form {
    display: grid;
    gap: 0.8rem;
    max-width: 48rem;
  }
  label {
    display: grid;
    gap: 0.35rem;
    font-weight: 600;
  }
  input,
  textarea,
  select {
    padding: 0.65rem;
    font: inherit;
  }
  .consent {
    grid-template-columns: auto 1fr;
    align-items: start;
  }
  .consent input {
    margin-top: 0.2rem;
  }
  button {
    width: fit-content;
    padding: 0.7rem 1rem;
    cursor: pointer;
  }
  .estimate {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-left: 3px solid #3a5f9e;
    background: #f3f5f8;
    font-size: 0.88rem;
  }
  [role='alert'] {
    margin: 1rem 0;
    padding: 0.8rem 1rem;
    border-left: 3px solid #a12626;
    background: #fdf1f1;
    color: #7c1d1d;
  }
  [role='alert'] .headline {
    margin: 0 0 0.3rem;
    font-weight: 700;
  }
  [role='alert'] p {
    margin: 0.2rem 0;
    font-size: 0.9rem;
  }
  [role='alert'] .token {
    margin-top: 0.5rem;
    opacity: 0.75;
  }
  [role='alert'] .token code {
    font-size: 0.8rem;
  }
  .withheld {
    max-width: 48rem;
    padding: 0.6rem 0.8rem;
    border: 1px dashed #c8d0dd;
    border-radius: 0.4rem;
    font-size: 0.85rem;
  }
  .withheld ul {
    display: grid;
    gap: 0.35rem;
    margin: 0.5rem 0 0;
    padding-left: 1.1rem;
    color: #52627a;
  }
  fieldset {
    display: grid;
    gap: 0.6rem;
    max-width: 48rem;
    border: 1px solid #c8d0dd;
    border-radius: 0.4rem;
    padding: 0.8rem;
  }
  legend {
    font-weight: 700;
    padding: 0 0.35rem;
  }
  label.radio {
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.5rem;
    font-weight: 400;
  }
  .hint {
    margin: 0;
    color: #52627a;
    font-size: 0.85rem;
  }
  [data-testid='ai-path'] {
    max-width: 48rem;
    padding: 0.6rem 0.8rem;
    border-left: 3px solid #3a5f9e;
    background: #f3f5f8;
  }
  pre {
    white-space: pre-wrap;
    overflow: auto;
    padding: 1rem;
    background: #f3f5f8;
  }
  .results {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 1rem 0;
  }
  .results img {
    max-width: min(100%, 24rem);
    height: auto;
    border: 1px solid #c8d0dd;
    border-radius: 0.3rem;
  }
</style>
