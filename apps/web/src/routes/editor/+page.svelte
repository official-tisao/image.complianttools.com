<script lang="ts">
  import {
    addGroup,
    addLayer,
    createLayerState,
    setLayerBlendMode,
    setLayerOpacity,
    setLayerVisibility,
    type LayerState,
  } from '@complianttools/image-engine/layer';
  import T44T48T66LocalTool from '$lib/T44T48T66LocalTool.svelte';

  let layerState: LayerState = $state(
    createLayerState({
      width: 400,
      height: 300,
      colorSpace: 'srgb',
      bitDepth: 8,
      premultipliedAlpha: false,
      frames: [{ data: new Uint8ClampedArray(400 * 300 * 4).fill(128), durationMs: 0 }],
    }),
  );
  let _selectedLayerId = $state('layer-0');
</script>

<T44T48T66LocalTool kind="editor" locale="en" />

<section class="reference" aria-label="Layers">
  <h2>Layers</h2>
  <ul>
    {#each layerState.layers as layer (layer.id)}
      <li>
        <button onclick={() => (_selectedLayerId = layer.id)}>{layer.id}</button>
        <label
          >Opacity <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={layer.opacity}
            oninput={(event) =>
              (layerState = setLayerOpacity(
                layerState,
                layer.id,
                Number((event.target as HTMLInputElement).value),
              ))}
          /></label
        >
        <label
          >Blend <select
            value={layer.blendMode}
            onchange={(event) =>
              (layerState = setLayerBlendMode(
                layerState,
                layer.id,
                (event.target as HTMLSelectElement)
                  .value as LayerState['layers'][number]['blendMode'],
              ))}
          >
            <option>normal</option><option>multiply</option><option>screen</option><option
              >overlay</option
            ><option>soft-light</option><option>difference</option>
          </select></label
        >
        <button
          onclick={() => (layerState = setLayerVisibility(layerState, layer.id, !layer.visible))}
          >{layer.visible ? 'Hide' : 'Show'}</button
        >
      </li>
    {/each}
  </ul>
  <button
    onclick={() =>
      (layerState = addLayer(layerState, {
        id: `layer-${layerState.layers.length + 1}`,
        image: layerState.layers[0]!.image,
        opacity: 1,
      }))}>Add layer</button
  >
  <button onclick={() => (layerState = addGroup(layerState, `group-${Date.now()}`, 'New group'))}
    >Add group</button
  >
  <p>Host-only editor shell — no network requests.</p>
</section>
