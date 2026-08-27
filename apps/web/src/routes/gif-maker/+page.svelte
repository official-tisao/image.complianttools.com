<script lang="ts">
  import {
    createRaster,
    encodeGif,
    generateGifFrames,
    type GifFrameGenerator,
  } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');
  let optimizeLevel = $state<0 | 1 | 2 | 3>(2);
  let lossy = $state(0);
  let quantizer = $state<'fixed-332' | 'median-cut' | 'octree' | 'wu' | 'neural'>('median-cut');
  let paletteSize = $state(256);
  let paletteMode = $state<'global' | 'per-frame' | 'adaptive'>('adaptive');
  let transparencyIndex = $state(0);
  let dither = $state<'none' | 'ordered' | 'floyd-steinberg' | 'atkinson' | 'sierra'>(
    'floyd-steinberg',
  );
  let ditherAmount = $state(100);
  let disposal = $state<'auto' | 'unspecified' | 'none' | 'background' | 'previous'>('auto');
  let interlace = $state(false);
  let delayMs = $state(100);
  let loopCount = $state(0);
  let frameGenerator = $state<GifFrameGenerator>('forward');
  let crossfadeFrames = $state(2);

  async function convert(fileList: FileList | null) {
    status = '';
    error = '';
    const files = [...(fileList ?? [])];
    if (files.length === 0) return;
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Your browser cannot create a local canvas.');
      const frames = [];
      for (const [index, file] of files.entries()) {
        const bitmap = await createImageBitmap(file);
        if (index === 0) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
        }
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        frames.push({
          data: new Uint8ClampedArray(context.getImageData(0, 0, canvas.width, canvas.height).data),
          durationMs: delayMs,
        });
      }
      const base = createRaster(canvas.width, canvas.height, frames[0]!.data);
      const image = generateGifFrames(
        { ...base, frames: frames as unknown as typeof base.frames },
        frameGenerator,
        crossfadeFrames,
      );
      const bytes = encodeGif(image, loopCount, {
        optimizeLevel,
        lossy,
        quantizer,
        paletteSize,
        paletteMode,
        transparencyIndex,
        dither,
        ditherAmount,
        disposal,
        interlace,
      });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${files[0]!.name.replace(/\.[^.]+$/u, '')}.gif`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Created a ${canvas.width}×${canvas.height} GIF with ${image.frames.length} frame(s) locally (${bytes.byteLength.toLocaleString()} bytes; loop ${loopCount}, ${frameGenerator}, ${quantizer}, ${paletteMode} palette up to ${paletteSize} entries, transparency index ${transparencyIndex}, ${dither} dithering at ${ditherAmount}%, ${disposal} disposal, ${interlace ? 'interlaced' : 'sequential'}, optimization ${optimizeLevel}, palette reduction ${lossy}).`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to create a GIF.';
    }
  }
</script>

<svelte:head>
  <title>GIF Maker — Image Compliant Tools</title>
  <meta name="description" content="Create a GIF from an image locally in your browser." />
  <link rel="canonical" href="https://image.complianttools.com/gif-maker" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>GIF Maker</h1>
  <p>Create an animated GIF locally from one or more images. Nothing is uploaded.</p>
  <label>
    Frame delay (ms)
    <input type="number" min="10" max="60000" step="10" bind:value={delayMs} />
  </label>
  <label>
    Loop count (0 = infinite)
    <input type="number" min="0" max="65535" step="1" bind:value={loopCount} />
  </label>
  <label>
    Frame generator
    <select bind:value={frameGenerator}>
      <option value="forward">Forward</option>
      <option value="reverse">Reverse</option>
      <option value="bounce">Bounce</option>
      <option value="crossfade">Crossfade</option>
    </select>
  </label>
  {#if frameGenerator === 'crossfade'}
    <label>
      Crossfade frames
      <input type="number" min="1" max="30" step="1" bind:value={crossfadeFrames} />
    </label>
  {/if}
  <label>
    Optimization level
    <select bind:value={optimizeLevel}>
      <option value={0}>0 — retain every frame</option>
      <option value={1}>1 — merge duplicate frames</option>
      <option value={2}>2 — transparent unchanged pixels</option>
      <option value={3}>3 — maximum local frame optimization</option>
    </select>
  </label>
  <label>
    Palette mode
    <select bind:value={paletteMode}>
      <option value="adaptive">Adaptive</option>
      <option value="global">Global</option>
      <option value="per-frame">Per frame</option>
    </select>
  </label>
  <label>
    Palette size (2–256)
    <input type="number" min="2" max="256" step="1" bind:value={paletteSize} />
  </label>
  <label>
    Transparency index (0–255)
    <input type="number" min="0" max="255" step="1" bind:value={transparencyIndex} />
  </label>
  <label>
    Dithering
    <select bind:value={dither}>
      <option value="floyd-steinberg">Floyd–Steinberg</option>
      <option value="ordered">Ordered Bayer 4×4</option>
      <option value="atkinson">Atkinson</option>
      <option value="sierra">Sierra</option>
      <option value="none">None</option>
    </select>
  </label>
  <label>
    Dither amount (0–100)
    <input type="range" min="0" max="100" step="1" bind:value={ditherAmount} />
    {ditherAmount}
  </label>
  <label>
    Frame disposal
    <select bind:value={disposal}>
      <option value="auto">Automatic</option>
      <option value="unspecified">Unspecified</option>
      <option value="none">Do not dispose</option>
      <option value="background">Restore background</option>
      <option value="previous">Restore previous canvas</option>
    </select>
  </label>
  <label><input type="checkbox" bind:checked={interlace} /> Interlace rows</label>
  <label>
    Quantizer
    <select bind:value={quantizer}>
      <option value="median-cut">Weighted median cut</option>
      <option value="octree">Weighted octree</option>
      <option value="wu">Wu variance</option>
      <option value="neural">Neural SOM (NeuQuant-equivalent)</option>
      <option value="fixed-332">Fixed RGB 3:3:2</option>
    </select>
  </label>
  <label>
    Palette reduction (0–200)
    <input type="range" min="0" max="200" step="1" bind:value={lossy} />
    {lossy}
  </label>
  <label
    >Choose images <input
      type="file"
      accept="image/*"
      multiple
      onchange={(event) => void convert(event.currentTarget.files)}
    /></label
  >
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
