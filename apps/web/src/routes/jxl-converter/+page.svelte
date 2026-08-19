<script lang="ts">
  import { getCodec } from '@complianttools/image-engine';

  const lazyBytes = getCodec('jxl').lazyBytes;
  let status = $state('');
  let error = $state('');

  async function convert(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const { decodeJxlToRaster } = await import('@complianttools/image-engine');
      const image = await decodeJxlToRaster(await file.arrayBuffer());
      const frame = image.frames[0];
      if (!frame) throw new Error('The JPEG XL decoder returned no image frame.');
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
      download.download = `${file.name.replace(/\.jxl$/iu, '')}.png`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Converted ${image.width}×${image.height} JPEG XL image to PNG locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to convert this JPEG XL image.';
    }
  }
</script>

<svelte:head>
  <title>JPEG XL Converter — Image Compliant Tools</title>
  <meta name="description" content="Convert JPEG XL images to PNG locally in your browser." />
  <link rel="canonical" href="https://image.complianttools.com/jxl-converter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>JPEG XL Converter</h1>
  <p>
    Convert JPEG XL images to PNG locally. The decoder is downloaded only after you select a file.
  </p>
  <p role="status">
    Local decoder download: about {Math.round((lazyBytes / 1_000_000) * 10) / 10} MB.
  </p>
  <label>
    Choose a JPEG XL image
    <input
      type="file"
      accept="image/jxl,.jxl"
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    />
  </label>
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
