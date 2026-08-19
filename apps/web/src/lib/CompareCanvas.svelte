<script lang="ts">
  import { translate, type Locale } from './i18n';
  let {
    beforeUrl,
    afterUrl,
    alt = 'Image comparison',
    locale = 'en',
  } = $props<{ beforeUrl: string; afterUrl: string; alt?: string; locale?: Locale }>();
  let mode = $state<'split' | 'side' | 'onion' | 'difference' | 'output'>('split');
  let split = $state(50);
  let opacity = $state(50);
  let gain = $state(4);
  let zoom = $state(0);
  let panX = $state(0);
  let panY = $state(0);
  const zoomScale = $derived(zoom === 0 ? 1 : zoom);
  const pan = (x: number, y: number) => {
    panX += x;
    panY += y;
  };
</script>

<section
  class="compare"
  data-testid="compare-canvas"
  style={`--split:${split}%;--opacity:${opacity / 100};--gain:${gain};--zoom:${zoomScale};--pan-x:${panX}px;--pan-y:${panY}px`}
>
  <div class="compare-modes" aria-label={translate(locale, 'compare.mode', 'Comparison mode')}>
    {#each ['split', 'side', 'onion', 'difference', 'output'] as value (value)}<button
        type="button"
        aria-pressed={mode === value}
        onclick={() => (mode = value as typeof mode)}
        >{translate(locale, `compare.${value}`, value)}</button
      >{/each}
  </div>
  <div class:pixelated={zoom >= 4} class="compare-stage" data-mode={mode}>
    {#if mode === 'side'}<img src={beforeUrl} {alt} /><img src={afterUrl} {alt} />
    {:else}<img class="before" src={beforeUrl} {alt} /><img
        class="after"
        src={afterUrl}
        {alt}
      />{/if}
    {#if mode === 'split'}<div class="split-line"></div>
      <!-- svelte-ignore a11y_no_redundant_roles --><input
        class="split-control"
        aria-label={translate(locale, 'compare.split', 'Before and after split')}
        aria-valuetext={`${split}% after`}
        role="slider"
        type="range"
        min="0"
        max="100"
        bind:value={split}
      />{/if}
  </div>
  <div class="canvas-tools">
    <button type="button" onclick={() => (zoom = 0)}
      >0 {translate(locale, 'compare.fit', 'Fit')}</button
    ><button type="button" onclick={() => (zoom = 1)}>1 100%</button><button
      type="button"
      onclick={() => (zoom = Math.min(8, Math.max(1, zoom + 1)))}
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
    >{#if mode === 'onion'}<label
        >Opacity <input type="range" min="0" max="100" bind:value={opacity} /></label
      >{/if}{#if mode === 'difference'}<label
        >Gain <input type="range" min="1" max="20" bind:value={gain} /></label
      >{/if}
  </div>
</section>
