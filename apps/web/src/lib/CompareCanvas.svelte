<script lang="ts">
  import type { OptionDescription } from '@complianttools/image-engine/schemas/options';
  import {
    T60CompareOptionsSchema,
    t60CompareOptionDescriptions,
    type T60CompareOptions,
  } from '@complianttools/image-engine/schemas/t60-compare-options';
  import GeneratedControls from './GeneratedControls.svelte';
  import { translate, type Locale } from './i18n';
  let {
    beforeUrl,
    afterUrl,
    alt = 'Image comparison',
    locale = 'en',
  } = $props<{ beforeUrl: string; afterUrl: string; alt?: string; locale?: Locale }>();
  let options = $state<T60CompareOptions>(T60CompareOptionsSchema.parse({}));
  let zoom = $state(0);
  let panX = $state(0);
  let panY = $state(0);
  const zoomScale = $derived(zoom === 0 ? 1 : zoom);
  const localizedDescriptions = $derived.by(() => {
    const labelKeys: Record<string, string> = {
      mode: 'compare.mode',
      split: 'compare.splitPosition',
      opacity: 'compare.opacity',
      gain: 'compare.gain',
    };
    const descriptions: Record<string, OptionDescription> = {};
    for (const [path, description] of Object.entries(t60CompareOptionDescriptions)) {
      const localized: OptionDescription = {
        ...description,
        label: translate(locale, labelKeys[path] ?? path, description.label),
        help: translate(locale, `${labelKeys[path] ?? path}.help`, description.help ?? ''),
      };
      if (description.optionLabels) {
        localized.optionLabels = Object.fromEntries(
          Object.entries(description.optionLabels).map(([value, fallback]) => [
            value,
            translate(locale, `compare.${value}`, fallback),
          ]),
        );
      }
      descriptions[path] = localized;
    }
    return descriptions;
  });
  const visibleDescriptions = $derived.by(() => {
    const paths =
      options.mode === 'split'
        ? ['mode', 'split']
        : options.mode === 'onion'
          ? ['mode', 'opacity']
          : options.mode === 'difference'
            ? ['mode', 'gain']
            : ['mode'];
    return Object.fromEntries(paths.map((path) => [path, localizedDescriptions[path]!])) as Record<
      string,
      OptionDescription
    >;
  });
  const optionValues = $derived({ ...options });
  function updateOption(path: string, value: unknown) {
    const parsed = T60CompareOptionsSchema.safeParse({ ...options, [path]: value });
    if (parsed.success) options = parsed.data;
  }
  const pan = (x: number, y: number) => {
    panX += x;
    panY += y;
  };
</script>

<section
  class="compare"
  data-testid="compare-canvas"
  style={`--split:${options.split}%;--opacity:${options.opacity / 100};--gain:${options.gain};--zoom:${zoomScale};--pan-x:${panX}px;--pan-y:${panY}px`}
>
  <div class="compare-options">
    <GeneratedControls
      descriptions={visibleDescriptions}
      values={optionValues}
      onChange={updateOption}
      {locale}
    />
  </div>
  <div class:pixelated={zoom >= 4} class="compare-stage" data-mode={options.mode}>
    {#if options.mode === 'side'}<img src={beforeUrl} {alt} /><img src={afterUrl} {alt} />
    {:else}<img class="before" src={beforeUrl} {alt} /><img
        class="after"
        src={afterUrl}
        {alt}
      />{/if}
    {#if options.mode === 'split'}<div class="split-line"></div>{/if}
  </div>
  <div class="canvas-tools">
    <button type="button" onclick={() => (zoom = 0)}
      >0 {translate(locale, 'compare.fit', 'Fit')}</button
    ><button type="button" onclick={() => (zoom = 1)}
      >1 {translate(locale, 'compare.percent', '100%')}</button
    ><button type="button" onclick={() => (zoom = Math.min(8, Math.max(1, zoom + 1)))}
      >{translate(locale, 'compare.zoom', 'Zoom')} +</button
    ><button
      type="button"
      aria-label={translate(locale, 'compare.panLeft', 'Pan image left')}
      onclick={() => pan(-32, 0)}>←</button
    ><button
      type="button"
      aria-label={translate(locale, 'compare.panUp', 'Pan image up')}
      onclick={() => pan(0, -32)}>↑</button
    ><button
      type="button"
      aria-label={translate(locale, 'compare.panDown', 'Pan image down')}
      onclick={() => pan(0, 32)}>↓</button
    ><button
      type="button"
      aria-label={translate(locale, 'compare.panRight', 'Pan image right')}
      onclick={() => pan(32, 0)}>→</button
    >
  </div>
</section>
