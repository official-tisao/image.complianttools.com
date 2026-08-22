<script lang="ts">
  import {
    decodeWithTypedErrors,
    engineErrorMessage,
    extractRawCameraPreview,
  } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');

  async function extract(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const bytes = await file.arrayBuffer();
      const preview = await decodeWithTypedErrors('raw', () => extractRawCameraPreview(bytes));
      const url = URL.createObjectURL(new Blob([preview.bytes], { type: 'image/jpeg' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}-camera-preview.jpg`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Extracted ${preview.label}. This is the camera's embedded JPEG preview, not a RAW develop.`;
    } catch (reason) {
      error = engineErrorMessage(reason);
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
      accept=".3fr,.arw,.bay,.cap,.cr2,.cr3,.crf,.crw,.cs1,.dcr,.dcs,.dng,.drf,.erf,.fff,.iiq,.k25,.kdc,.mdc,.mef,.mos,.mrw,.nef,.nrw,.orf,.pef,.ptx,.raf,.raw,.rw2,.rwl,.rwz,.sr2,.srf,.srw,.x3f"
      onchange={(event) => void extract(event.currentTarget.files?.[0])}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
