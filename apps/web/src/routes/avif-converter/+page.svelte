<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    AvifConverterToolOptionsSchema,
    avifConverterToolOptionDescriptions,
    createRaster,
    decodeAvifToRaster,
    decodeWithTypedErrors,
    engineErrorMessage,
    getCodec,
    isEngineError,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  const lazyBytes = getCodec('avif').lazyBytes;
  let options = $state(AvifConverterToolOptionsSchema.parse({}));
  let status = $state('');
  let error = $state('');
  let previewUrl = $state('');

  onDestroy(() => URL.revokeObjectURL(previewUrl));

  function updateOption(path: string, value: unknown) {
    const name = path.slice('avif.'.length);
    if (!(name in options)) return;
    const parsed = AvifConverterToolOptionsSchema.safeParse({ ...options, [name]: value });
    if (parsed.success) options = parsed.data;
  }

  async function rasterFromBrowserImage(file: File) {
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
  }

  async function convert(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      let blob: Blob;
      let extension: 'avif' | 'png';
      if (options.direction === 'encode') {
        const sourceExtension = file.name.split('.').pop()?.toLowerCase();
        const sourceFormat =
          sourceExtension === 'webp'
            ? 'webp'
            : /jpe?g|jfif/u.test(sourceExtension ?? '')
              ? 'jpeg'
              : 'png';
        const raster = await decodeWithTypedErrors(sourceFormat, () =>
          rasterFromBrowserImage(file),
        );
        const { encodeRasterAsAvif } =
          await import('@complianttools/image-engine/codecs/avif-encode');
        const bytes = await encodeRasterAsAvif(raster, {
          quality: options.quality,
          lossless: options.lossless,
        });
        blob = new Blob([bytes], { type: 'image/avif' });
        extension = 'avif';
        status = `Created ${options.lossless ? 'lossless' : `lossy quality ${options.quality}`} ${raster.width}×${raster.height} AVIF locally.`;
      } else {
        const image = await decodeWithTypedErrors('avif', async () =>
          decodeAvifToRaster(await file.arrayBuffer()),
        );
        const frame = image.frames[0];
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Your browser cannot create a local canvas.');
        const imageData = context.createImageData(image.width, image.height);
        imageData.data.set(frame.data);
        context.putImageData(imageData, 0, 0);
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value ? resolve(value) : reject(new Error('Unable to encode PNG locally.')),
            'image/png',
          ),
        );
        extension = 'png';
        status = `Converted ${image.width}×${image.height} AVIF image to PNG locally.`;
      }
      URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      const download = document.createElement('a');
      download.href = previewUrl;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}.${extension}`;
      download.click();
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${reason.remedy}`
        : engineErrorMessage(reason);
    }
  }
</script>

<svelte:head>
  <title>AVIF Converter — Image Compliant Tools</title>
  <meta name="description" content="Encode images as AVIF or decode AVIF to PNG locally." />
  <link rel="canonical" href="https://image.complianttools.com/avif-converter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>AVIF Converter</h1>
  <p>
    Encode PNG, JPEG, or WebP as AVIF, or decode AVIF to PNG locally. Nothing is uploaded. The local
    codec downloads only after you choose a file and is about {Math.round(
      (lazyBytes / 1_000_000) * 10,
    ) / 10}
    MB.
  </p>
  <GeneratedControls
    descriptions={avifConverterToolOptionDescriptions}
    values={Object.fromEntries(
      Object.entries(options).map(([name, value]) => [`avif.${name}`, value]),
    )}
    onChange={updateOption}
  />
  <label>
    {options.direction === 'encode' ? 'Choose a PNG, JPEG, or WebP image' : 'Choose an AVIF image'}
    <input
      type="file"
      accept={options.direction === 'encode'
        ? 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'
        : 'image/avif,.avif'}
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    />
  </label>
  {#if previewUrl}<figure>
      <img src={previewUrl} alt="Exact converted output preview" />
      <figcaption>Preview of the exact downloaded bytes.</figcaption>
    </figure>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
