<script lang="ts">
  import {
    inspectImageContainer,
    engineErrorMessage,
    isEngineError,
    readContainerMetadata,
    withTypedEngineErrors,
    type ImageInspection,
    type MetadataTag,
  } from '@complianttools/image-engine';

  let details = $state<{
    name: string;
    type: string;
    bytes: number;
    inspection: ImageInspection;
  }>();
  let tags = $state<readonly MetadataTag[]>([]);
  let error = $state('');

  async function inspect(file: File | undefined) {
    details = undefined;
    tags = [];
    error = '';
    if (!file) return;
    try {
      const input = await file.arrayBuffer();
      const inspection = withTypedEngineErrors(
        'Image inspection failed',
        'Choose a valid PNG, JPEG, GIF, or WebP image and try again.',
        () => inspectImageContainer(input),
      );
      details = {
        bytes: file.size,
        inspection,
        name: file.name,
        type: file.type,
      };
      try {
        tags = readContainerMetadata(input).tags;
      } catch {
        // Pixel dimensions remain useful for formats without a currently supported metadata reader.
      }
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} Remedy: ${reason.remedy}`
        : 'Unable to inspect this image.';
    }
  }
</script>

<svelte:head>
  <title>Image Inspector — Image Compliant Tools</title>
  <meta
    name="description"
    content="Inspect image dimensions, colour, depth, alpha, animation, structure, and metadata locally."
  />
  <link rel="canonical" href="https://image.complianttools.com/image-info" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>Image Inspector</h1>
  <p>
    Inspect dimensions, colour, depth, alpha, animation, container structure, and supported metadata
    locally. Your file is never uploaded.
  </p>
  <label
    >Choose an image <input
      type="file"
      accept="image/*"
      onchange={(event) => void inspect(event.currentTarget.files?.[0])}
    /></label
  >
  {#if details}
    <dl>
      <dt>Name</dt>
      <dd>{details.name}</dd>
      <dt>Type</dt>
      <dd>{details.type || 'unknown'}</dd>
      <dt>Size</dt>
      <dd>{details.bytes} bytes</dd>
      <dt>Dimensions</dt>
      <dd>{details.inspection.width} × {details.inspection.height} px</dd>
      <dt>Aspect ratio</dt>
      <dd>{details.inspection.width}:{details.inspection.height}</dd>
      <dt>DPI</dt>
      <dd>
        {details.inspection.dpi
          ? `${details.inspection.dpi.x} × ${details.inspection.dpi.y}`
          : 'Not declared'}
      </dd>
      <dt>Colour space</dt>
      <dd>{details.inspection.colorSpace}</dd>
      <dt>Bit depth</dt>
      <dd>{details.inspection.bitDepth ?? 'Unknown'}</dd>
      <dt>Channels</dt>
      <dd>{details.inspection.channels ?? 'Unknown'}</dd>
      <dt>Alpha</dt>
      <dd>
        {details.inspection.hasAlpha === null
          ? 'Unknown'
          : details.inspection.hasAlpha
            ? 'Yes'
            : 'No'}
      </dd>
      <dt>Animation</dt>
      <dd>
        {details.inspection.animated ? `Yes (${details.inspection.frameCount} frames)` : 'No'}
      </dd>
      <dt>Byte entropy</dt>
      <dd>{details.inspection.entropyBitsPerByte.toFixed(3)} bits/byte (estimate)</dd>
      <dt>JPEG quality</dt>
      <dd>
        {details.inspection.estimatedQuality === null
          ? 'Not applicable or unavailable'
          : `${details.inspection.estimatedQuality}% (estimate)`}
      </dd>
    </dl>
    <h2>Chunk / segment dump</h2>
    <ol>
      {#each details.inspection.structures as structure, index (`${index}:${structure}`)}<li>
          {structure}
        </li>{/each}
    </ol>
    {#if tags.length}
      <h2>Supported metadata</h2>
      <ul>
        {#each tags as tag (`${tag.namespace}:${tag.name}:${tag.value}`)}<li>
            {tag.namespace}: {tag.name} — {tag.value}
          </li>{/each}
      </ul>
    {/if}
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
