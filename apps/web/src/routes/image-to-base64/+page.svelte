<script lang="ts">
  const maximumBytes = 10 * 1024 * 1024;
  let value = $state('');
  let error = $state('');

  async function convert(file: File | undefined) {
    value = '';
    error = '';
    if (!file) return;
    if (file.size > maximumBytes) {
      error = 'Choose an image no larger than 10 MB for an in-browser Base64 conversion.';
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      value = `data:${file.type || 'application/octet-stream'};base64,${globalThis.btoa(binary)}`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to encode this image.';
    }
  }

  async function copy() {
    await globalThis.navigator.clipboard.writeText(value);
  }
</script>

<svelte:head>
  <title>Image to Base64 — Image Compliant Tools</title>
  <meta
    name="description"
    content="Convert an image to a Base64 data URL locally in your browser."
  />
  <link rel="canonical" href="https://image.complianttools.com/image-to-base64" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Image to Base64</h1>
  <p>Convert an image to a data URL locally. Files never leave your browser.</p>
  <label
    >Choose an image <input
      type="file"
      accept="image/*"
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    /></label
  >
  {#if value}
    <textarea readonly {value} aria-label="Base64 data URL"></textarea>
    <button type="button" onclick={() => void copy()}>Copy Base64</button>
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
