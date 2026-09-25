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
  import ImageToPdf from '$lib/ImageToPdf.svelte';
  import CbzConverter from '$lib/CbzConverter.svelte';
  import GifConverter from '$lib/GifConverter.svelte';
  import AvifConverter from '$lib/AvifConverter.svelte';
  import WebpConverter from '$lib/WebpConverter.svelte';
  import JxlConverter from '$lib/JxlConverter.svelte';
  import HeicConverter from '$lib/HeicConverter.svelte';
  import RawConverter from '$lib/RawConverter.svelte';
  import EmbeddedConverter from '$lib/EmbeddedConverter.svelte';
  import LosslessOptimizer from '$lib/LosslessOptimizer.svelte';
  import PixelArtUpscaler from '$lib/PixelArtUpscaler.svelte';
  import T32Upscale from '$lib/T32Upscale.svelte';
  import OcrTool from '$lib/OcrTool.svelte';
  import P3ColourTool from '$lib/P3ColourTool.svelte';
  import TransformTool from '$lib/TransformTool.svelte';
  import FormatToolCompletion from '$lib/FormatToolCompletion.svelte';
  import { toolCopy } from '$lib/i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const phaseOneTool = $derived(
    data.tool === 'convert' || data.tool === 'compress' || data.tool === 'resize'
      ? data.tool
      : null,
  );
  const copy = $derived(phaseOneTool ? toolCopy(data.locale, phaseOneTool) : null);
  const formatCompletionTool = $derived(
    [
      'heic-converter',
      'raw-converter',
      'avif-converter',
      'webp-converter',
      'jxl-converter',
      'svg-to-png',
      'image-to-svg',
      'pdf-to-image',
      'image-to-pdf',
      'favicon-generator',
      'gif-converter',
      'embedded-converter',
      'base64-image',
      'cbz-converter',
    ].find((tool) => tool === data.tool),
  );
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
{:else if data.tool === 'image-to-pdf'}
  <ImageToPdf locale={data.locale} />
{:else if data.tool === 'cbz-converter'}
  <CbzConverter locale={data.locale} />
{:else if data.tool === 'gif-converter'}
  <GifConverter locale={data.locale} />
{:else if data.tool === 'avif-converter'}
  <AvifConverter locale={data.locale} />
{:else if data.tool === 'webp-converter'}
  <WebpConverter locale={data.locale} />
{:else if data.tool === 'jxl-converter'}
  <JxlConverter locale={data.locale} />
{:else if data.tool === 'heic-converter'}
  <HeicConverter locale={data.locale} />
{:else if data.tool === 'raw-converter'}
  <RawConverter locale={data.locale} />
{:else if data.tool === 'embedded-converter'}
  <EmbeddedConverter locale={data.locale} />
{:else if data.tool === 'lossless-optimize'}
  <LosslessOptimizer locale={data.locale} />
{:else if data.tool === 'ocr'}
  <OcrTool locale={data.locale} />
{:else if data.tool === 'pixel-art-upscaler'}
  <PixelArtUpscaler locale={data.locale} />
{:else if data.tool === 'upscale'}
  <T32Upscale locale={data.locale} />
{:else if data.tool === 'crop'}
  <TransformTool kind="crop" locale={data.locale} />
{:else if data.tool === 'rotate'}
  <TransformTool kind="rotate" locale={data.locale} />
{:else if data.tool === 'flip'}
  <TransformTool kind="flip" locale={data.locale} />
{:else if data.tool === 'add-border'}
  <TransformTool kind="border" locale={data.locale} />
{:else if data.tool === 'threshold'}
  <P3ColourTool kind="threshold" locale={data.locale} />
{:else if data.tool === 'sharpen'}
  <P3ColourTool kind="sharpen" locale={data.locale} />
{:else if data.tool === 'duotone'}
  <P3ColourTool kind="duotone" locale={data.locale} />
{:else}
  <FaviconGenerator locale={data.locale} />
{/if}
{#if formatCompletionTool}
  <FormatToolCompletion route={formatCompletionTool} locale={data.locale} />
{/if}
