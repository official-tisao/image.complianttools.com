import { describe, expect, it } from 'vitest';
import { createLayerState, createEditorShell } from '../src/index.js';

describe('P3-07 T48 Editor integration', () => {
  it('editor page does not issue network requests', () => {
    const shell = createEditorShell();
    expect(shell.networkRequests).toBe(0);
  });

  it('layer model is exported', () => {
    const state = createLayerState({ width: 10, height: 10, colorSpace: 'srgb', bitDepth: 8, premultipliedAlpha: false, frames: [{ data: new Uint8ClampedArray(400).fill(128), durationMs: 0 }] } as any);
    expect(state.layers.length).toBeGreaterThanOrEqual(1);
  });
});
