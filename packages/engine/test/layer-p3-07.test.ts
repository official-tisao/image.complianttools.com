import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import {
  createLayerState,
  addLayer,
  setLayerOpacity,
  setLayerBlendMode,
  reorderLayers,
  addGroup,
  setLayerVisibility,
} from '../src/layer/model.js';
import { createEditorShell } from '../src/layer/editor-shell.js';

describe('P3-07 T48 Layer model', () => {
  it('creates initial layer state from raster', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(100));
    const state = createLayerState(img);
    expect(state.layers.length).toBe(1);
    expect(state.layers[0]!.blendMode).toBe('normal');
  });

  it('adds and manages multiple layers', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(100));
    let state = createLayerState(img);
    state = addLayer(state, { id: 'l2', image: img, opacity: 0.5 });
    expect(state.layers.length).toBe(2);
  });

  it('reorders layers', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(100));
    let state = createLayerState(img);
    state = addLayer(state, { id: 'l2', image: img });
    state = reorderLayers(state, ['l2', 'layer-0']);
    expect(state.layers[0]!.id).toBe('l2');
  });

  it('per-layer opacity', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(100));
    const state = setLayerOpacity(createLayerState(img), 'layer-0', 0.5);
    expect(state.layers[0]!.opacity).toBe(0.5);
  });

  it('blend modes', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(100));
    const state = setLayerBlendMode(createLayerState(img), 'layer-0', 'multiply');
    expect(state.layers[0]!.blendMode).toBe('multiply');
  });

  it('groups', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(100));
    let state = createLayerState(img);
    state = addGroup(state, 'g1', 'Group 1');
    expect(state.groups.length).toBe(1);
  });

  it('visibility', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(100));
    const state = setLayerVisibility(createLayerState(img), 'layer-0', false);
    expect(state.layers[0]!.visible).toBe(false);
  });
});

describe('P3-07 T48 Editor shell — zero network requests', () => {
  it('editor shell issues zero network requests', () => {
    const shell = createEditorShell();
    expect(shell.networkRequests).toBe(0);
  });
});
