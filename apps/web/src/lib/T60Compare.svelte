<script lang="ts">
  import { onDestroy } from 'svelte';
  import CompareCanvas from './CompareCanvas.svelte';

  const MAX_FILE_BYTES = 32 * 1024 * 1024;
  const MAX_SOURCE_PIXELS = 20_000_000;
  const METRIC_LONG_EDGE = 256;

  type Side = 'before' | 'after';
  type Source = { file: File; url: string; width: number; height: number };
  type HashMetric = { distance: number; bits: number };
  type ComparisonMetrics = {
    ssim: number;
    psnr: number | null;
    verdict: string;
    averageHash: HashMetric;
    differenceHash: HashMetric;
    pHash: HashMetric;
  };

  let before = $state<Source | undefined>();
  let after = $state<Source | undefined>();
  let metrics = $state<ComparisonMetrics | undefined>();
  let metricsDimensions = $state<{ width: number; height: number } | undefined>();
  let busy = $state(false);
  let error = $state('');
  let activeWorker: Worker | undefined;
  let rejectActiveWorker: ((cause: Error) => void) | undefined;
  let taskNumber = 0;

  const currentSources = $derived(before && after ? [before, after] as const : undefined);

  function errorText(cause: unknown) {
    return cause instanceof Error ? cause.message : String(cause);
  }

  function replaceSource(side: Side, file: File) {
    activeWorker?.terminate();
    rejectActiveWorker?.(new Error('Comparison cancelled because an image changed.'));
    activeWorker = undefined;
    rejectActiveWorker = undefined;
    const current = side === 'before' ? before : after;
    if (current) URL.revokeObjectURL(current.url);
    const source: Source = { file, url: URL.createObjectURL(file), width: 0, height: 0 };
    if (side === 'before') before = source;
    else after = source;
    metrics = undefined;
    metricsDimensions = undefined;
    error = '';
  }

  async function choose(side: Side, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      error = 'Choose a PNG, JPEG, or WebP image.';
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      error = 'Each image must be smaller than 32 MiB.';
      return;
    }
    replaceSource(side, file);
    const task = ++taskNumber;
    if (before && after) await compareSources(task);
  }

  async function decodeMetricProxy(source: Source) {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(source.file);
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) {
        throw new Error('Choose images no larger than 20 megapixels.');
      }
      source.width = bitmap.width;
      source.height = bitmap.height;
      const scale = Math.min(1, METRIC_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('This browser could not create a comparison canvas.');
      context.drawImage(bitmap, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      return { width, height, data: pixels.slice() };
    } catch (cause) {
      throw new Error(`Could not read ${source.file.name}: ${errorText(cause)}`);
    } finally {
      bitmap?.close();
    }
  }

  function runComparisonWorker(
    width: number,
    height: number,
    beforePixels: Uint8ClampedArray,
    afterPixels: Uint8ClampedArray,
  ): Promise<{ metrics: ComparisonMetrics }> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../workers/compare-worker.ts', import.meta.url), {
        type: 'module',
      });
      activeWorker = worker;
      const stop = () => {
        worker.terminate();
        if (activeWorker === worker) activeWorker = undefined;
        if (activeWorker === undefined) rejectActiveWorker = undefined;
      };
      rejectActiveWorker = (cause) => {
        stop();
        reject(cause);
      };
      worker.onmessage = (event: MessageEvent<{ metrics?: ComparisonMetrics; error?: string }>) => {
        stop();
        if (event.data.error) reject(new Error(event.data.error));
        else if (event.data.metrics) resolve({ metrics: event.data.metrics });
        else reject(new Error('The comparison worker returned no metrics.'));
      };
      worker.onerror = (event) => {
        stop();
        reject(new Error(event.message || 'The comparison worker stopped unexpectedly.'));
      };
      worker.postMessage(
        {
          width,
          height,
          before: beforePixels.buffer,
          after: afterPixels.buffer,
        },
        [beforePixels.buffer, afterPixels.buffer],
      );
    });
  }

  async function compareSources(task: number) {
    if (!before || !after) return;
    busy = true;
    metrics = undefined;
    metricsDimensions = undefined;
    error = '';
    try {
      const [beforeProxy, afterProxy] = await Promise.all([
        decodeMetricProxy(before),
        decodeMetricProxy(after),
      ]);
      if (beforeProxy.width !== afterProxy.width || beforeProxy.height !== afterProxy.height) {
        throw new Error(
          `The images have different dimensions (${before.width} × ${before.height} and ${after.width} × ${after.height}). Metrics require matching dimensions; both images are still available in the visual comparison.`,
        );
      }
      const result = await runComparisonWorker(
        beforeProxy.width,
        beforeProxy.height,
        beforeProxy.data,
        afterProxy.data,
      );
      if (task !== taskNumber) return;
      metrics = result.metrics;
      metricsDimensions = { width: beforeProxy.width, height: beforeProxy.height };
    } catch (cause) {
      if (task === taskNumber) error = errorText(cause);
    } finally {
      if (task === taskNumber) busy = false;
    }
  }

  function percent(metric: HashMetric) {
    return metric.bits ? `${((1 - metric.distance / metric.bits) * 100).toFixed(1)}%` : '—';
  }

  onDestroy(() => {
    taskNumber += 1;
    activeWorker?.terminate();
    rejectActiveWorker?.(new Error('Comparison page closed.'));
    if (before) URL.revokeObjectURL(before.url);
    if (after) URL.revokeObjectURL(after.url);
  });
</script>

<svelte:head>
  <title>Compare Images — ctimg</title>
  <meta
    name="description"
    content="Compare two images locally with a before-and-after viewer and transparent image metrics."
  />
  <link rel="canonical" href="https://image.complianttools.com/compare" />
  <meta property="og:title" content="Compare Images — ctimg" />
  <meta
    property="og:description"
    content="Inspect two local images side by side and compare approximate similarity metrics."
  />
</svelte:head>

<header class="tool-header t60-header">
  <a class="logo" href="/">ctimg</a>
  <nav aria-label="Main navigation">
    <a href="/convert">Convert</a>
    <a href="/compress">Compress</a>
    <a href="/resize">Resize</a>
    <a aria-current="page" href="/compare">Compare</a>
  </nav>
  <span class="privacy">Local only</span>
</header>

<main class="tool-page t60-page">
  <section class="tool-intro">
    <p class="eyebrow">P4-20 · T60</p>
    <h1>Compare Images</h1>
    <p>Inspect two images visually and compare approximate pixel and hash metrics.</p>
    <p class="privacy-copy">Files stay on your device. Images are not uploaded.</p>
    <div class="t60-inputs">
      <label class="file-entry">
        <span>Before image {#if before}<small>{before.file.name}</small>{/if}</span>
        <input
          data-testid="t60-before-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Choose before image"
          onchange={(event) => void choose('before', event)}
        />
      </label>
      <label class="file-entry">
        <span>After image {#if after}<small>{after.file.name}</small>{/if}</span>
        <input
          data-testid="t60-after-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Choose after image"
          onchange={(event) => void choose('after', event)}
        />
      </label>
    </div>
  </section>

  <section class="t60-workspace" aria-busy={busy}>
    <div class="t60-preview">
      {#if currentSources}
        <CompareCanvas
          beforeUrl={currentSources[0].url}
          afterUrl={currentSources[1].url}
          alt="Before and after image comparison"
        />
      {:else}
        <div class="empty-canvas">
          <p>Choose a before and an after image to start comparing.</p>
        </div>
      {/if}
    </div>

    <aside class="t60-metrics" aria-labelledby="t60-metrics-heading">
      <h2 id="t60-metrics-heading">Comparison metrics</h2>
      <p class="t60-disclosure">
        Engine approximations, not human quality judgments. Metrics use a local proxy with a longest
        edge of at most 256 pixels; source dimensions must match. Hash matches indicate similarity,
        not identity.
      </p>
      {#if busy}
        <p data-testid="t60-status" aria-live="polite">Comparing locally…</p>
      {:else if error}
        <p class="error" data-testid="t60-error" role="alert">{error}</p>
      {:else if metrics && metricsDimensions}
        <p class="t60-verdict" data-testid="t60-verdict">{metrics.verdict}</p>
        <p data-testid="t60-proxy-size">
          Metrics proxy: {metricsDimensions.width} × {metricsDimensions.height}
        </p>
        <dl class="t60-results" data-testid="t60-results">
          <div><dt>Approximate SSIM</dt><dd>{metrics.ssim.toFixed(4)}</dd></div>
          <div><dt>PSNR</dt><dd>{metrics.psnr === null ? '∞ (identical)' : `${metrics.psnr.toFixed(2)} dB`}</dd></div>
          <div>
            <dt>Average hash agreement</dt>
            <dd>{percent(metrics.averageHash)} ({metrics.averageHash.distance}/{metrics.averageHash.bits} differing)</dd>
          </div>
          <div>
            <dt>Difference hash agreement</dt>
            <dd>{percent(metrics.differenceHash)} ({metrics.differenceHash.distance}/{metrics.differenceHash.bits} differing)</dd>
          </div>
          <div>
            <dt>pHash agreement</dt>
            <dd>{percent(metrics.pHash)} ({metrics.pHash.distance}/{metrics.pHash.bits} differing)</dd>
          </div>
        </dl>
      {:else}
        <p data-testid="t60-status" aria-live="polite">Choose both images to calculate metrics.</p>
      {/if}
    </aside>
  </section>

  <section class="faq t60-faq">
    <h2>About these scores</h2>
    <details>
      <summary>Do matching scores prove the images are identical?</summary>
      <p>
        No. Similarity scores summarize selected pixel and hash features. Inspect the visual
        comparison and keep the original files when exact identity matters.
      </p>
    </details>
    <details>
      <summary>Why must the source dimensions match?</summary>
      <p>
        The engine compares corresponding pixels and does not align, crop, or warp images. Different
        dimensions remain viewable, but pixel metrics are withheld to avoid misleading scores.
      </p>
    </details>
  </section>
</main>

<style>
  .t60-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 68px;
  }

  .t60-header nav {
    display: flex;
    gap: 20px;
  }

  .t60-header nav a[aria-current='page'] {
    font-weight: 700;
    text-decoration-thickness: 2px;
  }

  .t60-inputs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 24px;
  }

  .t60-inputs .file-entry {
    margin: 0;
    max-width: none;
    align-items: flex-start;
    flex-direction: column;
  }

  .t60-inputs small {
    display: block;
    margin-top: 4px;
    overflow-wrap: anywhere;
    color: #5c5a56;
  }

  .t60-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 24px;
    align-items: start;
    padding: 28px clamp(16px, 4vw, 56px);
    border-block: 1px solid #1c1a171a;
    background: #ebe6de;
  }

  .t60-preview {
    min-width: 0;
  }

  .t60-preview .empty-canvas {
    min-height: 460px;
    width: 100%;
  }

  .t60-metrics {
    padding: 22px;
    border: 1px solid #1c1a171a;
    border-radius: 8px;
    background: white;
  }

  .t60-metrics h2 {
    margin: 0 0 12px;
    font-size: 20px;
  }

  .t60-disclosure {
    color: #5c5a56;
    font-size: 13px;
    line-height: 1.5;
  }

  .t60-verdict {
    font-size: 20px;
    font-weight: 650;
  }

  .t60-results {
    margin: 16px 0 0;
  }

  .t60-results > div {
    padding: 10px 0;
    border-top: 1px solid #1c1a171a;
  }

  .t60-results dt {
    font-size: 12px;
    color: #5c5a56;
  }

  .t60-results dd {
    margin: 3px 0 0;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }

  .t60-faq {
    margin-top: 64px;
  }

  @media (max-width: 900px) {
    .t60-workspace {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 767px) {
    .t60-header nav {
      display: none;
    }

    .t60-inputs {
      grid-template-columns: 1fr;
    }
  }
</style>
