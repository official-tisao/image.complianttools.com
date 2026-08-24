<script lang="ts">
  import ToolWorkspace from '$lib/ToolWorkspace.svelte';
  import ImageInspector from '$lib/ImageInspector.svelte';
  import MetadataRemover from '$lib/MetadataRemover.svelte';
  import MetadataViewer from '$lib/MetadataViewer.svelte';
  import Base64ImageTool from '$lib/Base64ImageTool.svelte';
  import FaviconGenerator from '$lib/FaviconGenerator.svelte';
  import SvgRasterizer from '$lib/SvgRasterizer.svelte';
  import Vectorizer from '$lib/Vectorizer.svelte';
  import PdfToImage from '$lib/PdfToImage.svelte';
  import { toolCopy } from '$lib/i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const phaseOneTool = $derived(
    data.tool === 'convert' || data.tool === 'compress' || data.tool === 'resize'
      ? data.tool
      : null,
  );
  const copy = $derived(phaseOneTool ? toolCopy(data.locale, phaseOneTool) : null);
</script>

{#if phaseOneTool && copy}
  <ToolWorkspace
    kind={phaseOneTool}
    locale={data.locale}
    title={copy.title}
    description={copy.description}
  />
{:else if data.tool === 'image-info'}
  <ImageInspector locale={data.locale} />
{:else if data.tool === 'remove-exif'}
  <MetadataRemover locale={data.locale} />
{:else if data.tool === 'exif-viewer'}
  <MetadataViewer locale={data.locale} />
{:else if data.tool === 'base64-image'}
  <Base64ImageTool locale={data.locale} />
{:else if data.tool === 'svg-to-png'}
  <SvgRasterizer locale={data.locale} />
{:else if data.tool === 'image-to-svg'}
  <Vectorizer locale={data.locale} />
{:else if data.tool === 'pdf-to-image'}
  <PdfToImage locale={data.locale} />
{:else}
  <FaviconGenerator locale={data.locale} />
{/if}
