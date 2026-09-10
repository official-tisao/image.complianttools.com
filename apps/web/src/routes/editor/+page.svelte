<script lang="ts">
  import { createLayerState, addLayer, setLayerOpacity, setLayerBlendMode, reorderLayers, addGroup, setLayerVisibility, type LayerState } from '@complianttools/image-engine/layer';
  let layerState: LayerState = createLayerState({ width: 400, height: 300, colorSpace: 'srgb', bitDepth: 8, premultipliedAlpha: false, frames: [{ data: new Uint8ClampedArray(400 * 300 * 4).fill(128), durationMs: 0 }] } as any);
  let selectedLayerId = $state('layer-0');
</script>

<svelte:head><title>Image editor — ctimg</title></svelte:head>
<main class="reference">
  <h1>Image editor (layered)</h1>
  <section aria-label="Layers">
    <h2>Layers</h2>
    <ul>
      {#each layerState.layers as layer}
        <li>
          <button onclick={() => selectedLayerId = layer.id}>{layer.id}</button>
          <label>Opacity <input type="range" min="0" max="1" step="0.1" value={layer.opacity} oninput={(e) => layerState = setLayerOpacity(layerState, layer.id, Number((e.target as HTMLInputElement).value))} /></label>
          <label>Blend <select value={layer.blendMode} onchange={(e) => layerState = setLayerBlendMode(layerState, layer.id, (e.target as HTMLSelectElement).value as any)}>
            <option>normal</option><option>multiply</option><option>screen</option><option>overlay</option><option>soft-light</option><option>difference</option>
          </select></label>
          <button onclick={() => layerState = setLayerVisibility(layerState, layer.id, !layer.visible)}>{layer.visible ? 'Hide' : 'Show'}</button>
        </li>
      {/each}
    </ul>
    <button onclick={() => layerState = addLayer(layerState, { id: 'layer-' + (layerState.layers.length + 1), image: layerState.layers[0]!.image, opacity: 1 })}>Add layer</button>
    <button onclick={() => layerState = addGroup(layerState, 'group-' + Date.now(), 'New group')}>Add group</button>
  </section>
  <p>Host-only editor shell — no network requests.</p>
</main>
