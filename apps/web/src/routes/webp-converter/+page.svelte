<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    WebpConverterToolOptionsSchema,
    createRaster,
    decodeGif,
    decodeWithTypedErrors,
    encodeAnimatedWebp,
    encodeRasterAsWebp,
    engineErrorMessage,
    isEngineError,
    prepareWebpSequence,
    webpConverterToolOptionDescriptions,
    type RasterImage,
    type FormatId,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  let options = $state(WebpConverterToolOptionsSchema.parse({}));
  let status = $state('');
  let error = $state('');
  let previewUrl = $state('');

  onDestroy(() => URL.revokeObjectURL(previewUrl));

  function updateOption(path: string, value: unknown) {
    const name = path.slice('webp.'.length);
    if (!(name in options)) return;
    const parsed = WebpConverterToolOptionsSchema.safeParse({ ...options, [name]: value });
    if (parsed.success) options = parsed.data;
  }

  async function decodeFile(file: File): Promise<RasterImage> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const format: FormatId =
      extension === 'gif'
        ? 'gif'
        : extension === 'png'
          ? 'png'
          : extension === 'webp'
            ? 'webp'
            : 'jpeg';
    return decodeWithTypedErrors(format, async () => {
      if (format === 'gif') return decodeGif(await file.arrayBuffer());
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Your browser cannot create a local canvas.');
        context.drawImage(bitmap, 0, 0);
        return createRaster(
          bitmap.width,
          bitmap.height,
          new Uint8ClampedArray(context.getImageData(0, 0, bitmap.width, bitmap.height).data),
        );
      } finally {
        bitmap.close();
      }
    });
  }

  async function convert(fileList: globalThis.FileList | null) {
    status = '';
    error = '';
    const files = [...(fileList ?? [])];
    if (files.length === 0) return;
    try {
      const decoded = await Promise.all(files.map(decodeFile));
      const prepared = prepareWebpSequence(decoded, options);
      let output: Uint8Array;
      let frameCount = 1;
      if (options.animated) {
        output = await encodeAnimatedWebp(prepared, {
          quality: options.quality,
          lossless: options.lossless,
          loopCount: options.loopCount,
        });
        frameCount = prepared.frames.length;
      } else {
        output = new Uint8Array(
          await encodeRasterAsWebp(prepared, {
            quality: options.quality,
            lossless: options.lossless ? 1 : 0,
          }),
        );
      }
      URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([output], { type: 'image/webp' }));
      const download = document.createElement('a');
      download.href = previewUrl;
      download.download = `${files[0]!.name.replace(/\.[^.]+$/u, '')}.webp`;
      download.click();
      status = `Created ${options.lossless ? 'lossless' : `lossy quality ${options.quality}`} WebP locally (${frameCount} frame${frameCount === 1 ? '' : 's'}, ${output.byteLength.toLocaleString()} bytes).`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${reason.remedy}`
        : engineErrorMessage(reason);
    }
  }
</script>

<svelte:head>
  <title>WebP Converter — Image Compliant Tools</title>
  <meta
    name="description"
    content="Create lossy, lossless, or animated WebP images locally in your browser."
  />
  <link rel="canonical" href="https://image.complianttools.com/webp-converter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>WebP Converter</h1>
  <p>Create lossy, lossless, or animated WebP files on your device. Nothing is uploaded.</p>
  <GeneratedControls
    descriptions={webpConverterToolOptionDescriptions}
    values={Object.fromEntries(
      Object.entries(options).map(([name, value]) => [`webp.${name}`, value]),
    )}
    onChange={updateOption}
  />
  <label>
    Choose image files
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
      multiple={options.animated}
      onchange={(event) => void convert(event.currentTarget.files)}
    />
  </label>
  {#if previewUrl}<figure>
      <img src={previewUrl} alt="Encoded WebP preview" />
      <figcaption>Preview of the exact downloaded WebP bytes.</figcaption>
    </figure>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
