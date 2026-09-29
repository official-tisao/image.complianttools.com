<script lang="ts">
  import { onMount } from 'svelte';
  import { transportFetch } from '@complianttools/image-engine/ai/transport';
  import {
    describePath,
    resolveRequest,
    RelayRoutingError,
  } from '@complianttools/image-engine/ai/relay';
  import { setProviderRelay } from '@complianttools/image-engine/ai/connection';
  import { translate, type Locale } from './i18n';

  type AiKind = 'generate' | 'edit' | 'describe';
  let { kind, locale = 'en' }: { kind: AiKind; locale?: Locale } = $props();

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
  let endpoint = $state('');
  let apiKey = $state('');
  let model = $state('');
  let prompt = $state('');
  let imageFile = $state<File | undefined>();
  let consent = $state(false);
  let busy = $state(false);
  let status = $state('');
  let error = $state('');
  let result = $state('');
  let hydrated = $state(false);

  // P5-13 (README §15.4) — Connection: Direct (recommended) | Via my relay.
  // The relay URL and token are component state and module state only: never localStorage, never
  // sessionStorage, never IndexedDB. They are gone on reload, like the API key above.
  const PROVIDER_ID = $derived(`ai-tool-${kind}`);
  let connection = $state<'direct' | 'relay'>('direct');
  let relayUrl = $state('');
  let relayToken = $state('');
  // Shown before the request as the destination, and after it as the path that was actually taken.
  let pathNote = $state('');
  let usedPath = $state<'direct' | 'relay' | ''>('');

  function t(key: string, fallback: string) {
    return translate(locale, key, fallback);
  }

  function selectImage(event: Event) {
    imageFile = (event.currentTarget as HTMLInputElement).files?.[0];
    error = '';
  }

  async function encodeImage(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    }
    return `data:${file.type || 'application/octet-stream'};base64,${btoa(binary)}`;
  }

  async function request() {
    status = '';
    error = '';
    result = '';
    if (!consent) {
      error = 'consent-required: check the consent box before any provider request.';
      return;
    }
    if (!endpoint.trim()) {
      error = 'provider-endpoint-missing: enter the endpoint supplied by your provider or gateway.';
      return;
    }
    if (!apiKey.trim()) {
      error =
        'credential-missing: paste a provider key for this request; it is kept in memory only.';
      return;
    }
    if ((kind === 'edit' || kind === 'describe') && !imageFile) {
      error = 'image-required: choose an image for this capability before consenting to a request.';
      return;
    }
    // Both destinations are validated locally before anything is issued. A relay that is configured
    // but unusable raises here — it never falls back to a direct request.
    let resolved;
    try {
      setProviderRelay(
        PROVIDER_ID,
        connection === 'relay' ? { relayUrl, token: relayToken } : undefined,
      );
      resolved = resolveRequest(
        endpoint,
        connection === 'relay' ? { relayUrl, token: relayToken } : undefined,
      );
    } catch (cause) {
      error =
        cause instanceof RelayRoutingError
          ? `${cause.kind}: ${cause.message}`
          : `provider-endpoint-invalid: ${cause instanceof Error ? cause.message : String(cause)}`;
      return;
    }
    // Tell the user where this is going *before* it goes there (README §15.4).
    pathNote = describePath(resolved, new URL(endpoint).host);
    busy = true;
    try {
      const response = await transportFetch(
        resolved.url,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
            ...resolved.headers,
          },
          body: JSON.stringify({
            capability: kind,
            model: model.trim() || undefined,
            prompt: prompt.trim() || undefined,
            image: imageFile
              ? {
                  name: imageFile.name,
                  mimeType: imageFile.type,
                  data: await encodeImage(imageFile),
                }
              : undefined,
          }),
        },
        // The allowlist covers whichever hop is actually used: the relay's origin when relaying,
        // the provider's when direct.
        { allowedOrigins: [resolved.origin], maxRetries: 1, timeoutMs: 30_000 },
      );
      usedPath = resolved.path;
      if (!response.ok) {
        error = `provider-error: ${response.status} ${response.statusText || 'request rejected'}`;
        return;
      }
      result = response.body || 'Provider accepted the request.';
      status = 'Provider request completed. Review the response before using its output.';
    } catch (cause) {
      // A relayed request that fails is still a relayed request. The path is reported, never
      // silently retried direct.
      usedPath = resolved.path;
      const kindValue =
        cause && typeof cause === 'object' && 'kind' in cause
          ? String(cause.kind)
          : 'provider-error';
      error = `${kindValue}: ${cause instanceof Error ? cause.message : String(cause)}`;
    } finally {
      busy = false;
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
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void request();
    }}
  >
    <label
      >Provider endpoint <input
        data-testid="ai-endpoint"
        type="url"
        bind:value={endpoint}
        placeholder="https://your-provider.example/v1/request"
        autocomplete="off"
      /></label
    >
    <label
      >API key <input
        data-testid="ai-key"
        type="password"
        bind:value={apiKey}
        placeholder="Paste a key for this session"
        autocomplete="off"
      /></label
    >
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
    <label
      >Model (optional) <input
        data-testid="ai-model"
        bind:value={model}
        autocomplete="off"
      /></label
    >
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
    <label class="consent"
      ><input data-testid="ai-consent" type="checkbox" bind:checked={consent} /> I understand that the
      configured provider will receive this request and any included image data.</label
    >
    <button
      data-testid="ai-submit"
      data-hydrated={hydrated ? 'true' : 'false'}
      type="submit"
      disabled={busy}>{busy ? 'Waiting…' : copy[kind].action}</button
    >
  </form>
  {#if pathNote}
    <p data-testid="ai-path" data-path={usedPath || connection}>{pathNote}</p>
  {/if}
  {#if status}<p role="status" data-testid="ai-status">{status}</p>{/if}
  {#if error}<p role="alert" data-testid="ai-error">{error}</p>{/if}
  {#if result}<pre data-testid="ai-result">{result}</pre>{/if}
  <section class="faq">
    <h2>{t('seo.questions', 'Questions')}</h2>
    <details open>
      <summary>When does a request leave this device?</summary>
      <p>
        Only after you enter a valid HTTPS endpoint and key and check the consent box. There are no
        embedded credentials or default provider calls.
      </p>
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
  textarea {
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
  [role='alert'] {
    color: #a12626;
  }
  [role='status'] {
    color: #075e31;
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
</style>
