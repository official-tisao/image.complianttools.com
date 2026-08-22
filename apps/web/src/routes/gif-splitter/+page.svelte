<script lang="ts">
  import {
    decodeGif,
    decodeWithTypedErrors,
    encodeApng,
    engineErrorMessage,
  } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');
  let output = $state<'frames' | 'apng'>('frames');

  async function split(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const bytes = await file.arrayBuffer();
      const image = await decodeWithTypedErrors('gif', () => decodeGif(bytes));
      if (output === 'apng') {
        const bytes = await encodeApng(image);
        const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        const download = document.createElement('a');
        download.href = url;
        download.download = `${file.name.replace(/\.gif$/iu, '')}.apng`;
        download.click();
        URL.revokeObjectURL(url);
        status = `Converted ${image.frames.length} GIF frame${image.frames.length === 1 ? '' : 's'} to APNG locally.`;
        return;
      }
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
      error = engineErrorMessage(reason);
    }
  }
</script>

<svelte:head>
  <title>GIF Splitter — Image Compliant Tools</title>
  <meta name="description" content="Export GIF frames as PNGs or convert them to APNG locally." />
  <link rel="canonical" href="https://image.complianttools.com/gif-splitter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>GIF Splitter</h1>
  <p>Export animated GIF frames as PNG files or a single APNG locally. Nothing is uploaded.</p>
  <label>
    Output
    <select bind:value={output}>
      <option value="frames">Separate PNG frames</option>
      <option value="apng">Animated PNG (APNG)</option>
    </select>
  </label>
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
