<script lang="ts">
  import { decodeGif } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');

  async function split(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const image = decodeGif(await file.arrayBuffer());
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser cannot create a local canvas.');
      for (const [index, frame] of image.frames.entries()) {
        context.putImageData(new ImageData(frame.data, image.width, image.height), 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(new Error('Unable to encode PNG.'))),
            'image/png',
          ),
        );
        const url = URL.createObjectURL(blob);
        const download = document.createElement('a');
        download.href = url;
        download.download = `${file.name.replace(/\.gif$/iu, '')}-frame-${String(index + 1).padStart(3, '0')}.png`;
        download.click();
        URL.revokeObjectURL(url);
      }
      status = `Exported ${image.frames.length} GIF frame${image.frames.length === 1 ? '' : 's'} locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to split this GIF.';
    }
  }
</script>

<svelte:head>
  <title>GIF Splitter — Image Compliant Tools</title>
  <meta name="description" content="Export each animated GIF frame as a PNG locally." />
  <link rel="canonical" href="https://image.complianttools.com/gif-splitter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>GIF Splitter</h1>
  <p>Export animated GIF frames as PNG files locally. Nothing is uploaded.</p>
  <label
    >Choose a GIF <input
      type="file"
      accept="image/gif,.gif"
      onchange={(event) => void split(event.currentTarget.files?.[0])}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
