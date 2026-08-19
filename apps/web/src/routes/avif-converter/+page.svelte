<script lang="ts">
  import { getCodec } from '@complianttools/image-engine';

  const reason = getCodec('avif').unavailableReason;
</script>

<svelte:head>
  <title>AVIF Converter — Image Compliant Tools</title>
  <meta
    name="description"
    content="AVIF conversion availability and local browser support status."
  />
  <link rel="canonical" href="https://image.complianttools.com/avif-converter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>AVIF Converter</h1>
  <p>This converter is not available in this build.</p>
  <p role="status">{reason}</p>
  <p>
    No file is uploaded or sent to a fallback service. When the local, Vite-compatible decoder is
    available, this route will expose its download cost before loading it.
  </p>
</main>
