<script lang="ts">
  import { onMount } from 'svelte';
  import { transportFetch } from '@complianttools/image-engine/ai/transport';
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
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
      if (parsed.protocol !== 'https:') throw new Error('HTTPS is required for provider requests.');
    } catch (cause) {
      error = `provider-endpoint-invalid: ${cause instanceof Error ? cause.message : String(cause)}`;
      return;
    }
    busy = true;
    try {
      const response = await transportFetch(
        parsed.toString(),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
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
        { allowedOrigins: [parsed.origin], maxRetries: 1, timeoutMs: 30_000 },
      );
      if (!response.ok) {
        error = `provider-error: ${response.status} ${response.statusText || 'request rejected'}`;
        return;
      }
      result = response.body || 'Provider accepted the request.';
      status = 'Provider request completed. Review the response before using its output.';
    } catch (cause) {
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
  pre {
    white-space: pre-wrap;
    overflow: auto;
    padding: 1rem;
    background: #f3f5f8;
  }
</style>
