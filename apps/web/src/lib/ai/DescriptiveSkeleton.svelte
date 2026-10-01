<!--
  P5-15 — T71's local descriptive skeleton (README §4.9, "Without a key").

  This is the whole point of the "Without a key" column: a user with no provider account, no key,
  no consent, and no network still leaves this page with the literal facts of their image and a
  head start on the alt text.

  Design rules this component holds to, each mirroring the engine module:

  - It computes from the chosen `File` alone. It never fetches, and it never hands the engine a
    detector or an OCR worker that might fetch weights on its own.
  - Each row renders its own `status`. `measured` rows are facts; `uncertain` rows say so in the
    row; `unavailable` and `unsupported` rows explain themselves. There is no code path that
    renders a missing field as zero, an empty string, or a blank cell.
  - The headline disclaimer is always visible. A reader must not be able to mistake this for
    AI-generated alt text.

  OCR is deliberately *not* run here. Only one language model ships with the app, and pulling any
  other down mid-report would make a "local" action reach the network. The row says so and links
  to /ocr instead.
-->
<script lang="ts">
  import {
    buildDescriptiveSkeleton,
    DESCRIPTIVE_SKELETON_DISCLAIMER,
    DESCRIPTIVE_SKELETON_SCOPE,
    SKELETON_FIELD_ORDER,
    skeletonHedgedFields,
    type DescriptiveSkeleton,
    type SkeletonField,
  } from '@complianttools/image-engine/ai/describe-skeleton';
  import type { RasterImage } from '@complianttools/image-engine/types';
  import { translate, type Locale } from '../i18n';

  let { file, locale = 'en' }: { file: File; locale?: Locale } = $props();

  /** Refuse absurd inputs before allocating. Mirrors the other tools' pixel ceilings. */
  const MAX_PIXELS = 24_000_000;

  type State =
    | { readonly status: 'idle' }
    | { readonly status: 'working' }
    | { readonly status: 'ready'; readonly skeleton: DescriptiveSkeleton }
    | { readonly status: 'failed'; readonly message: string };

  let state = $state<State>({ status: 'idle' });

  function t(key: string, fallback: string) {
    return translate(locale, key, fallback);
  }

  /**
   * Decode to RGBA for the palette. Bounded by `MAX_PIXELS`, and a decode failure is reported as a
   * row-level fact rather than a page error — the header-only rows (dimensions, orientation, EXIF)
   * do not need pixels at all.
   */
  async function decodeRaster(bitmapSource: Blob): Promise<RasterImage | undefined> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(bitmapSource);
    } catch {
      return undefined;
    }
    try {
      if (bitmap.width * bitmap.height > MAX_PIXELS) return undefined;
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) return undefined;
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
      return {
        width: bitmap.width,
        height: bitmap.height,
        colorSpace: 'srgb',
        bitDepth: 8,
        premultipliedAlpha: false,
        frames: [{ data: data.data, durationMs: 0 }],
      };
    } catch {
      return undefined;
    } finally {
      bitmap.close();
    }
  }

  async function build(fileToRead: File) {
    state = { status: 'working' };
    try {
      const bytes = new Uint8Array(await fileToRead.arrayBuffer());
      // Decode is best-effort: without pixels the palette and transparency rows report honestly
      // and every other row still computes.
      const raster = await decodeRaster(fileToRead);
      state = {
        status: 'ready',
        skeleton: buildDescriptiveSkeleton({ bytes, ...(raster ? { raster } : {}) }),
      };
    } catch (cause) {
      state = {
        status: 'failed',
        message:
          cause instanceof Error
            ? cause.message
            : 'This file could not be read. Try a PNG, JPEG, GIF, or WebP.',
      };
    }
  }

  // Rebuild whenever the chosen file changes. `$effect` rather than a button, because there is
  // nothing to decide: the local report has no preconditions, so it runs as soon as a file exists.
  $effect(() => {
    void build(file);
  });

  const rows = $derived.by(() => {
    if (state.status !== 'ready') return [];
    const { skeleton } = state;
    return SKELETON_FIELD_ORDER.map((key) => [key, skeleton[key]] as const);
  });
  const hedged = $derived(state.status === 'ready' ? skeletonHedgedFields(state.skeleton) : []);

  /** A short status word shown as a badge on every row. */
  function statusWord(field: SkeletonField<unknown>): string {
    switch (field.status) {
      case 'measured':
        return t('skeleton.status.measured', 'Measured');
      case 'uncertain':
        return t('skeleton.status.uncertain', 'Approximate');
      case 'unsupported':
        return t('skeleton.status.unsupported', 'Not supported');
      default:
        return t('skeleton.status.unavailable', 'Unavailable');
    }
  }

  /**
   * The dimensions value, narrowed.
   *
   * `SkeletonField<T>` is generic, but the discriminated union `rows` produces widens each field to
   * `SkeletonField<unknown>` — its default type parameter. Narrowing by key is not enough for
   * TypeScript here, so this asserts the shape it is only reached when `key === 'dimensions'`.
   */
  function dimensionText(value: unknown): string {
    if (typeof value === 'object' && value !== null && 'width' in value && 'height' in value) {
      const dims = value as { width: number; height: number };
      return `${dims.width} × ${dims.height}`;
    }
    return '';
  }

  /** Render a field's value as text. Swatches and EXIF lists get their own markup below. */
  function valueText(field: SkeletonField<unknown>): string {
    if (field.value === undefined) return '';
    if (typeof field.value === 'string') return field.value;
    if (typeof field.value === 'number') return String(field.value);
    if (Array.isArray(field.value))
      return field.value.length === 0 ? '' : `${field.value.length} entries`;
    return JSON.stringify(field.value);
  }
</script>

<section class="skeleton" data-testid="describe-skeleton" aria-labelledby="skeleton-heading">
  <h2 id="skeleton-heading" data-testid="skeleton-heading">
    {t('skeleton.heading', 'Local descriptive skeleton')}
  </h2>

  <p class="disclaimer" data-testid="skeleton-disclaimer">
    {translate(locale, 'skeleton.disclaimer', DESCRIPTIVE_SKELETON_DISCLAIMER)}
  </p>
  <p class="scope">{translate(locale, 'skeleton.scope', DESCRIPTIVE_SKELETON_SCOPE)}</p>

  {#if state.status === 'working'}
    <p role="status" data-testid="skeleton-status">
      {t('skeleton.working', 'Reading this image locally…')}
    </p>
  {:else if state.status === 'failed'}
    <p role="alert" data-testid="skeleton-error">
      {t('skeleton.failed', 'This file could not be read locally.')}
      {state.message}
    </p>
  {:else if state.status === 'ready'}
    <p data-testid="skeleton-summary">
      {#if hedged.length === 0}
        {t('skeleton.allMeasured', 'Every row below is a measured fact about this file.')}
      {:else}
        {t('skeleton.hedged', 'Hedged rows:')}
        {hedged.join(', ')}
        {t('skeleton.hedgedWhy', '— each says why below.')}
      {/if}
    </p>

    <dl class="fields">
      {#each rows as [key, field] (key)}
        <div class="field" data-testid={`skeleton-field-${key}`} data-status={field.status}>
          <dt>
            <span class="label">{translate(locale, `skeleton.field.${key}`, field.label)}</span>
            <span class="badge" data-status={field.status}>{statusWord(field)}</span>
          </dt>
          <dd>
            {#if key === 'dominantPalette' && Array.isArray(field.value) && field.value.length > 0}
              <ul class="swatches">
                <!--
                  Keyed by index, not by hex: k-means forces exactly `count` clusters, so a
                  near-uniform image legitimately yields the same hex more than once. Keying by hex
                  raises Svelte's duplicate-key error and takes the whole report down.
                -->
                {#each field.value as swatch, index (index)}
                  <li
                    title={`${swatch.hex} · ${(swatch.share * 100).toFixed(1)}% of sampled pixels`}
                  >
                    <span class="chip" style={`background:${swatch.hex}`}></span>
                    <code>{swatch.hex}</code>
                    <span class="share">{(swatch.share * 100).toFixed(1)}%</span>
                  </li>
                {/each}
              </ul>
            {:else if key === 'exifSubjectFields' && Array.isArray(field.value)}
              {#if field.value.length === 0}
                <p class="value empty">{t('skeleton.noExif', 'This file declares none.')}</p>
              {:else}
                <ul class="exif">
                  {#each field.value as entry (entry.name)}
                    <li><strong>{entry.name}</strong>: {entry.value}</li>
                  {/each}
                </ul>
              {/if}
            {:else if field.value !== undefined}
              <p class="value">
                {#if key === 'dimensions'}
                  {dimensionText(field.value)}
                {:else}
                  {valueText(field)}
                {/if}
              </p>
            {/if}
            <p class="note">{translate(locale, `skeleton.note.${key}`, field.note)}</p>
          </dd>
        </div>
      {/each}
    </dl>

    <p class="followup">
      {t('skeleton.ocrLink', 'Want the text read out?')}
      <a href="/ocr">{t('skeleton.ocrLinkLabel', 'Open the OCR tool')}</a>
      {t('skeleton.ocrLinkWhy', '— it runs entirely on your device.')}
      <a href="/alt-text">{t('skeleton.altLinkLabel', 'Or write the alt text here')}</a>
    </p>
  {/if}
</section>

<style>
  .skeleton {
    max-width: 48rem;
    margin: 2.5rem 0;
    padding: 1.25rem;
    border: 1px solid #c8d0dd;
    border-radius: 0.5rem;
    background: #f8fafc;
  }
  h2 {
    margin-top: 0;
    font-size: 1.15rem;
  }
  .disclaimer {
    margin: 0 0 0.5rem;
    padding: 0.6rem 0.75rem;
    border-left: 3px solid #a26a00;
    background: #fff8e8;
    font-size: 0.9rem;
  }
  .scope,
  .followup {
    color: #52627a;
    font-size: 0.9rem;
  }
  .fields {
    display: grid;
    gap: 0.9rem;
    margin: 1.2rem 0;
  }
  .field {
    padding-top: 0.6rem;
    border-top: 1px solid #dde3ec;
  }
  dt {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-weight: 700;
  }
  .badge {
    padding: 0.1rem 0.45rem;
    border-radius: 0.75rem;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .badge[data-status='measured'] {
    background: #dcf5e5;
    color: #075e31;
  }
  .badge[data-status='uncertain'] {
    background: #fdf0d5;
    color: #7a5200;
  }
  .badge[data-status='unsupported'] {
    background: #e6e9ef;
    color: #4a5464;
  }
  .badge[data-status='unavailable'] {
    background: #f3e2e2;
    color: #8a2020;
  }
  dd {
    margin: 0.35rem 0 0;
  }
  .value {
    margin: 0;
    font-family: ui-monospace, 'SFMono-Regular', monospace;
    font-size: 0.92rem;
  }
  .value.empty {
    font-family: inherit;
    color: #52627a;
    font-style: italic;
  }
  .note {
    margin: 0.3rem 0 0;
    color: #52627a;
    font-size: 0.85rem;
  }
  .swatches,
  .exif {
    display: grid;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .swatches li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.88rem;
  }
  .chip {
    width: 1.1rem;
    height: 1.1rem;
    border: 1px solid #98a3b3;
    border-radius: 0.2rem;
    /* Swatches are decorative; the hex beside each one carries the same information as text. */
    flex: 0 0 auto;
  }
  .share {
    color: #52627a;
    font-size: 0.8rem;
  }
  .exif li {
    font-size: 0.9rem;
  }
</style>
