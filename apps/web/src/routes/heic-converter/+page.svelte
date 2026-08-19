<script lang="ts">
  import {
    HEIC_UNSUPPORTED_MESSAGE,
    decodeHeic,
    supportsHeicDecode,
  } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');

  async function convert(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      if (!(await supportsHeicDecode())) throw new Error(HEIC_UNSUPPORTED_MESSAGE);
      const image = await decodeHeic(await file.arrayBuffer());
      const frame = image.frames[0];
      if (!frame) throw new Error('The HEIC decoder returned no image frame.');
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser cannot create a local canvas.');
      context.putImageData(new ImageData(frame.data, image.width, image.height), 0, 0);
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('Unable to encode PNG locally.'))),
          'image/png',
        ),
      );
      const url = URL.createObjectURL(png);
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.(heic|heif)$/iu, '')}.png`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Converted ${image.width}×${image.height} HEIC image to PNG locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to convert this HEIC image.';
    }
  }
</script>

<svelte:head>
  <title>HEIC / HEIF Converter — Image Compliant Tools</title>
  <meta
    name="description"
    content="Convert HEIC and HEIF to PNG locally with your browser's platform decoder. HEIC output is deliberately unavailable."
  />
  <link rel="canonical" href="https://image.complianttools.com/heic-converter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>HEIC / HEIF Converter</h1>
  <p>
    Convert a HEIC or HEIF image to PNG locally when your browser provides a platform decoder. HEIC
    encoding is deliberately unavailable.
  </p>
  <label>
    Choose a HEIC or HEIF image
    <input
      type="file"
      accept="image/heic,image/heif,.heic,.heif"
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    />
  </label>
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
