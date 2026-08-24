<script lang="ts">
  import {
    DEFAULT_BASE64_MAX_BYTES,
    base64DataUrlSnippets,
    decodeBase64DataUrl,
    encodeBase64DataUrl,
  } from '@complianttools/image-engine/export/base64';
  import { isEngineError } from '@complianttools/image-engine/errors';
  import {
    Base64ToolOptionsSchema,
    base64ToolOptionDescriptions,
  } from '@complianttools/image-engine/schemas/options';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/base64-image' : `/${locale}/base64-image`);

  const maximumBytes = DEFAULT_BASE64_MAX_BYTES;
  let value = $state('');
  let htmlSnippet = $state('');
  let cssSnippet = $state('');
  let decodeInput = $state('');
  let options = $state(Base64ToolOptionsSchema.parse({}));
  const controlValues = $derived({ 'base64.mode': options.mode });
  let status = $state('');
  let error = $state('');

  function setControl(path: string, value: unknown) {
    if (path !== 'base64.mode') return;
    const parsed = Base64ToolOptionsSchema.safeParse({ mode: value });
    if (parsed.success) options = parsed.data;
  }

  async function convert(file: File | undefined) {
    value = '';
    htmlSnippet = '';
    cssSnippet = '';
    status = '';
    error = '';
    if (!file) return;
    try {
      value = encodeBase64DataUrl(
        await file.arrayBuffer(),
        file.type || 'application/octet-stream',
        maximumBytes,
      );
      ({ html: htmlSnippet, css: cssSnippet } = base64DataUrlSnippets(value));
    } catch (reason) {
      error = isEngineError(reason)
        ? t(
            'base64.encodeError',
            'Unable to encode this image. Choose a valid file below the 32 MB limit.',
          )
        : reason instanceof Error
          ? reason.message
          : t('base64.encodeError', 'Unable to encode this image.');
    }
  }

  async function copy(text: string) {
    error = '';
    try {
      await globalThis.navigator.clipboard.writeText(text);
      status = t('base64.copied', 'Copied locally to the clipboard.');
    } catch {
      error = t('base64.clipboardError', 'Unable to copy. Allow clipboard access and try again.');
    }
  }

  function decode() {
    error = '';
    status = '';
    try {
      const decoded = decodeBase64DataUrl(decodeInput, maximumBytes);
      const subtype = decoded.mimeType.split('/')[1]?.replace('+xml', '') || 'bin';
      const extension = subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]/giu, '') || 'bin';
      const url = URL.createObjectURL(new Blob([decoded.bytes], { type: decoded.mimeType }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `decoded.${extension}`;
      download.click();
      URL.revokeObjectURL(url);
      status = `${t(
        'base64.decoded',
        'Decoded {value} bytes locally as',
        decoded.bytes.byteLength.toLocaleString(locale === 'en-XA' ? 'en' : locale),
      )} ${decoded.mimeType}.`;
    } catch (reason) {
      error = isEngineError(reason)
        ? t(
            'base64.decodeError',
            'Unable to decode this data URL. Paste valid Base64 below the 32 MB limit.',
          )
        : reason instanceof Error
          ? reason.message
          : t('base64.decodeError', 'Unable to decode this data URL.');
    }
  }
</script>

<svelte:head>
  <title>{t('base64.title', 'Image to Base64')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t(
      'base64.metaDescription',
      'Encode images as Base64 data URLs or decode them back to local files in your browser.',
    )}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('base64.back', '← Convert')}</a>
  <h1>{t('base64.title', 'Image to Base64')}</h1>
  <p>
    {t(
      'base64.description',
      'Encode an image to a data URL or decode a data URL back to a file locally.',
    )}
  </p>
  <GeneratedControls
    descriptions={localizeOptions(locale, base64ToolOptionDescriptions)}
    values={controlValues}
    onChange={setControl}
    {locale}
  />
  {#if options.mode === 'encode'}
    <label
      >{t('base64.choose', 'Choose an image')}
      <input
        type="file"
        accept="image/*"
        onchange={(event) => void convert(event.currentTarget.files?.[0])}
      /></label
    >
    {#if value}
      <label>{t('base64.dataUrl', 'Base64 data URL')} <textarea readonly {value}></textarea></label>
      <button type="button" onclick={() => void copy(value)}
        >{t('base64.copy', 'Copy Base64')}</button
      >
      <label
        >{t('base64.html', 'HTML snippet')}
        <textarea readonly value={htmlSnippet}></textarea></label
      >
      <button type="button" onclick={() => void copy(htmlSnippet)}
        >{t('base64.copyHtml', 'Copy HTML')}</button
      >
      <label
        >{t('base64.css', 'CSS snippet')} <textarea readonly value={cssSnippet}></textarea></label
      >
      <button type="button" onclick={() => void copy(cssSnippet)}
        >{t('base64.copyCss', 'Copy CSS')}</button
      >
    {/if}
  {:else}
    <label
      >{t('base64.dataUrl', 'Base64 data URL')}
      <textarea bind:value={decodeInput} placeholder="data:image/png;base64,..."></textarea></label
    >
    <button type="button" onclick={decode}>{t('base64.decode', 'Decode and download')}</button>
  {/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
