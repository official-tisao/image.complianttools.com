<script lang="ts">
  import { extractRawCameraPreview } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');

  async function extract(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const preview = extractRawCameraPreview(await file.arrayBuffer());
      const url = URL.createObjectURL(new Blob([preview.bytes], { type: 'image/jpeg' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}-camera-preview.jpg`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Extracted ${preview.label}. This is the camera's embedded JPEG preview, not a RAW develop.`;
    } catch (reason) {
      error =
        reason instanceof Error
          ? reason.message
          : 'Unable to extract a camera preview from this RAW file.';
    }
  }
</script>

<svelte:head>
  <title>RAW Camera Preview Converter — Image Compliant Tools</title>
  <meta name="description" content="Extract an embedded RAW camera preview locally." />
  <link rel="canonical" href="https://image.complianttools.com/raw-converter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>RAW Camera Preview Converter</h1>
  <p>Extract the embedded camera preview locally. This is not a full RAW develop.</p>
  <label
    >Choose a TIFF-based RAW file <input
      type="file"
      accept=".dng,.cr2,.nef,.arw,.rw2,.orf,.raf,.pef"
      onchange={(event) => void extract(event.currentTarget.files?.[0])}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
