<script lang="ts">
  import {
    decodeWithTypedErrors,
    encodeGif,
    engineErrorMessage,
    extractContainerVideoFrame,
  } from '@complianttools/image-engine';

  let timestamp = $state(0);
  let status = $state('');
  let error = $state('');

  async function extract(file: File | undefined) {
    status = '';
    error = '';
    if (!file) return;
    try {
      const format = /\.webm$/iu.test(file.name) ? 'webm' : 'mp4';
      const frame = await decodeWithTypedErrors(format, () =>
        extractContainerVideoFrame(file, timestamp),
      );
      const output = encodeGif(frame);
      const url = URL.createObjectURL(new Blob([output], { type: 'image/gif' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.name.replace(/\.[^.]+$/u, '')}-frame.gif`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Extracted the frame at ${timestamp.toFixed(2)} seconds locally.`;
    } catch (reason) {
      error = engineErrorMessage(reason);
    }
  }
</script>

<svelte:head>
  <title>Video Frame to GIF — Image Compliant Tools</title>
  <meta
    name="description"
    content="Extract an MP4 or WebM video frame and save it as a GIF locally with WebCodecs."
  />
  <link rel="canonical" href="https://image.complianttools.com/video-to-gif" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Video Frame to GIF</h1>
  <p>
    Extract one frame from MP4 or WebM locally. Availability depends on your browser’s WebCodecs
    support for the video stream; no video codec is downloaded.
  </p>
  <label>
    Timestamp in seconds
    <input type="number" min="0" step="0.01" bind:value={timestamp} />
  </label>
  <label>
    Choose an MP4 or WebM video
    <input
      type="file"
      accept="video/mp4,video/webm,.m4v,.mov"
      onchange={(event) => void extract(event.currentTarget.files?.[0])}
    />
  </label>
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
