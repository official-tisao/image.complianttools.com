<script lang="ts">
  import {
    GifConverterToolOptionsSchema,
    decodeGif,
    decodeWithTypedErrors,
    encodeAnimatedWebp,
    encodeAnimationVideo,
    encodeApng,
    engineErrorMessage,
    gifConverterToolOptionDescriptions,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  let status = $state('');
  let error = $state('');
  let options = $state(GifConverterToolOptionsSchema.parse({}));

  function updateOption(path: string, value: unknown) {
    if (path !== 'gif.output') return;
    const parsed = GifConverterToolOptionsSchema.safeParse({ output: value });
    if (parsed.success) options = parsed.data;
  }

  async function split(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const bytes = await file.arrayBuffer();
      const image = await decodeWithTypedErrors('gif', () => decodeGif(bytes));
      if (options.output === 'webp') {
        const webpBytes = await encodeAnimatedWebp(image);
        const url = URL.createObjectURL(new Blob([webpBytes], { type: 'image/webp' }));
        const download = document.createElement('a');
        download.href = url;
        download.download = `${file.name.replace(/\.gif$/iu, '')}.webp`;
        download.click();
        URL.revokeObjectURL(url);
        status = `Converted ${image.frames.length} GIF frame${image.frames.length === 1 ? '' : 's'} to animated WebP locally.`;
        return;
      }
      if (options.output === 'mp4' || options.output === 'webm') {
        const canvas = document.createElement('canvas');
        const videoBytes = await encodeAnimationVideo(image, options.output, canvas);
        const mimeType = options.output === 'mp4' ? 'video/mp4' : 'video/webm';
        const url = URL.createObjectURL(new Blob([videoBytes], { type: mimeType }));
        const download = document.createElement('a');
        download.href = url;
        download.download = `${file.name.replace(/\.gif$/iu, '')}.${options.output}`;
        download.click();
        URL.revokeObjectURL(url);
        status = `Converted ${image.frames.length} GIF frame${image.frames.length === 1 ? '' : 's'} to ${options.output.toUpperCase()} locally.`;
        return;
      }
      if (options.output === 'apng') {
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
  <meta
    name="description"
    content="Export GIF frames as PNGs or convert animations to APNG, animated WebP, MP4, or WebM locally."
  />
  <link rel="canonical" href="https://image.complianttools.com/gif-converter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>GIF Splitter</h1>
  <p>
    Export animated GIF frames as PNG files, APNG, MP4, or WebM locally. Video availability depends
    on your browser’s WebCodecs encoders. Nothing is uploaded.
  </p>
  <GeneratedControls
    descriptions={gifConverterToolOptionDescriptions}
    values={{ 'gif.output': options.output }}
    onChange={updateOption}
  />
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
