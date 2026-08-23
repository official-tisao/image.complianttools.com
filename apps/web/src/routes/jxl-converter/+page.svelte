<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    JxlConverterToolOptionsSchema,
    createRaster,
    decodeJxlToRaster,
    decodeWithTypedErrors,
    engineErrorMessage,
    getCodec,
    isEngineError,
    jxlConverterToolOptionDescriptions,
    loadEncoder,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  const lazyBytes = getCodec('jxl').lazyBytes;
  let options = $state(JxlConverterToolOptionsSchema.parse({}));
  let status = $state('');
  let error = $state('');
  let previewUrl = $state('');

  onDestroy(() => URL.revokeObjectURL(previewUrl));

  function updateOption(path: string, value: unknown) {
    const name = path.slice('jxl.'.length);
    if (!(name in options)) return;
    const parsed = JxlConverterToolOptionsSchema.safeParse({ ...options, [name]: value });
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
      let extension: 'jxl' | 'png';
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
        const { encodeRasterAsJxl } = (await loadEncoder(
          'jxl',
        )) as typeof import('@complianttools/image-engine/codecs/jxl-encode');
        const bytes = await encodeRasterAsJxl(raster, {
          quality: options.quality,
          lossless: options.lossless,
        });
        blob = new Blob([bytes], { type: 'image/jxl' });
        extension = 'jxl';
        status = `Created ${options.lossless ? 'lossless raster' : `lossy quality ${options.quality}`} ${raster.width}×${raster.height} JPEG XL locally.`;
      } else {
        const image = await decodeWithTypedErrors('jxl', async () =>
          decodeJxlToRaster(await file.arrayBuffer()),
        );
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Your browser cannot create a local canvas.');
        const imageData = context.createImageData(image.width, image.height);
        imageData.data.set(image.frames[0].data);
        context.putImageData(imageData, 0, 0);
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value ? resolve(value) : reject(new Error('Unable to encode PNG locally.')),
            'image/png',
          ),
        );
        extension = 'png';
        status = `Converted ${image.width}×${image.height} JPEG XL image to PNG locally.`;
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
  <title>JPEG XL Converter — Image Compliant Tools</title>
  <meta name="description" content="Encode images as JPEG XL or decode JPEG XL to PNG locally." />
  <link rel="canonical" href="https://image.complianttools.com/jxl-converter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>JPEG XL Converter</h1>
  <p>
    Encode PNG, JPEG, or WebP pixels as JPEG XL, or decode JPEG XL to PNG locally. Nothing is
    uploaded. The local codec downloads only after you choose a file and is about {Math.round(
      (lazyBytes / 1_000_000) * 10,
    ) / 10} MB.
  </p>
  <p>
    Lossless raster mode preserves decoded pixels. Reconstructible JPEG recompression is not exposed
    by the pinned browser codec and is not claimed here.
  </p>
  <GeneratedControls
    descriptions={jxlConverterToolOptionDescriptions}
    values={Object.fromEntries(
      Object.entries(options).map(([name, value]) => [`jxl.${name}`, value]),
    )}
    onChange={updateOption}
  />
  <label>
    {options.direction === 'encode'
      ? 'Choose a PNG, JPEG, or WebP image'
      : 'Choose a JPEG XL image'}
    <input
      type="file"
      accept={options.direction === 'encode'
        ? 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'
        : 'image/jxl,.jxl'}
      onchange={(event) => void convert(event.currentTarget.files?.[0])}
    />
  </label>
  {#if previewUrl}<figure>
      {#if options.direction === 'decode'}<img
          src={previewUrl}
          alt="Exact converted output preview"
        />
      {:else}<p>
          JPEG XL preview requires decoding; the downloaded bytes are retained locally.
        </p>{/if}
      <figcaption>Output created entirely in this browser.</figcaption>
    </figure>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
