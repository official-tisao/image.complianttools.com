<script lang="ts">
  import { rasterizeSvg } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');
  let width = $state('');

  async function convert(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const svg = await file.text();
      const image = await rasterizeSvg(svg, width ? { width: Number(width) } : {});
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser cannot create a local canvas.');
      context.putImageData(new ImageData(image.frames[0].data, image.width, image.height), 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('PNG encoding failed.'))),
          'image/png',
        ),
      );
      const url = URL.createObjectURL(blob);
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.(?:svg|svgz)$/iu, '')}.png`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Rasterized ${file.name} to ${image.width}×${image.height} PNG locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to rasterize this SVG.';
    }
  }
</script>

<svelte:head>
  <title>SVG to PNG — Image Compliant Tools</title>
  <meta
    name="description"
    content="Rasterize a self-contained SVG to PNG locally in your browser."
  />
  <link rel="canonical" href="https://image.complianttools.com/svg-to-png" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>SVG to PNG</h1>
  <p>
    Rasterize a self-contained SVG locally. External references and active SVG content are refused.
  </p>
  <label>Output width (optional) <input type="number" min="1" bind:value={width} /></label>
  <label
    >Choose an SVG <input
      type="file"
      accept="image/svg+xml,.svg"
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
