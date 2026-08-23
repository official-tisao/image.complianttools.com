<script lang="ts">
  import {
    DEFAULT_BASE64_MAX_BYTES,
    base64DataUrlSnippets,
    decodeBase64DataUrl,
    encodeBase64DataUrl,
    isEngineError,
  } from '@complianttools/image-engine';

  const maximumBytes = DEFAULT_BASE64_MAX_BYTES;
  let value = $state('');
  let htmlSnippet = $state('');
  let cssSnippet = $state('');
  let decodeInput = $state('');
  let mode = $state<'encode' | 'decode'>('encode');
  let status = $state('');
  let error = $state('');

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
        ? reason.remedy
        : reason instanceof Error
          ? reason.message
          : 'Unable to encode this image.';
    }
  }

  async function copy(text: string) {
    await globalThis.navigator.clipboard.writeText(text);
    status = 'Copied locally to the clipboard.';
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
      status = `Decoded ${decoded.bytes.byteLength.toLocaleString()} bytes locally as ${decoded.mimeType}.`;
    } catch (reason) {
      error = isEngineError(reason)
        ? reason.remedy
        : reason instanceof Error
          ? reason.message
          : 'Unable to decode this data URL.';
    }
  }
</script>

<svelte:head>
  <title>Base64 Image Encoder & Decoder — Image Compliant Tools</title>
  <meta
    name="description"
    content="Encode images as Base64 data URLs or decode them back to local files in your browser."
  />
  <link rel="canonical" href="https://image.complianttools.com/base64-image" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Image to Base64</h1>
  <p>Encode an image to a data URL or decode a data URL back to a file locally.</p>
  <label
    >Direction
    <select bind:value={mode}>
      <option value="encode">Image to Base64</option>
      <option value="decode">Base64 to file</option>
    </select></label
  >
  {#if mode === 'encode'}
    <label
      >Choose an image <input
        type="file"
        accept="image/*"
        onchange={(event) => void convert(event.currentTarget.files?.[0])}
      /></label
    >
    {#if value}
      <label>Base64 data URL <textarea readonly {value}></textarea></label>
      <button type="button" onclick={() => void copy(value)}>Copy Base64</button>
      <label>HTML snippet <textarea readonly value={htmlSnippet}></textarea></label>
      <button type="button" onclick={() => void copy(htmlSnippet)}>Copy HTML</button>
      <label>CSS snippet <textarea readonly value={cssSnippet}></textarea></label>
      <button type="button" onclick={() => void copy(cssSnippet)}>Copy CSS</button>
    {/if}
  {:else}
    <label
      >Base64 data URL
      <textarea bind:value={decodeInput} placeholder="data:image/png;base64,..."></textarea></label
    >
    <button type="button" onclick={decode}>Decode and download</button>
  {/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
