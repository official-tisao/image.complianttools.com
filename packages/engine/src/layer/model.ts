/**
 * P3-07 T48 Layered Editor — layer model.
 * Minimal, host-only, no network requests.
 */
import type { RasterImage } from '../types.js';

export interface Layer {
  readonly id: string;
  readonly image: RasterImage;
  readonly blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'difference';
  readonly opacity: number; // 0..1
  readonly visible: boolean;
  readonly order: number;
  readonly groupId?: string;
}

export interface LayerGroup {
  readonly id: string;
  readonly name: string;
  readonly layers: Layer[];
}

export interface LayerState {
  readonly layers: Layer[];
  readonly groups: LayerGroup[];
}

export function createLayerState(image: RasterImage): LayerState {
  return {
    layers: [{
      id: 'layer-0',
      image,
      blendMode: 'normal',
      opacity: 1,
      visible: true,
      order: 0,
    }],
    groups: [],
  };
}

export function addLayer(state: LayerState, layer: Partial<Layer> & { image: RasterImage; id: string }): LayerState {
  const newLayer: Layer = {
    id: layer.id,
    image: layer.image,
    blendMode: layer.blendMode ?? 'normal',
    opacity: layer.opacity ?? 1,
    visible: layer.visible ?? true,
    order: layer.order ?? state.layers.length,
    groupId: layer.groupId,
  };
  return { ...state, layers: [...state.layers, newLayer] };
}

export function setLayerOpacity(state: LayerState, id: string, opacity: number): LayerState {
  return {
    ...state,
    layers: state.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
  };
}

export function setLayerBlendMode(state: LayerState, id: string, blendMode: Layer['blendMode']): LayerState {
  return {
    ...state,
    layers: state.layers.map((l) => (l.id === id ? { ...l, blendMode } : l)),
  };
}

export function reorderLayers(state: LayerState, layerIds: string[]): LayerState {
  const ordered = layerIds.map((id) => state.layers.find((l) => l.id === id)).filter((l): l is Layer => !!l);
  return { ...state, layers: ordered.map((l, i) => ({ ...l, order: i })) };
}

export function addGroup(state: LayerState, groupId: string, name: string): LayerState {
  return {
    ...state,
    groups: [...state.groups, { id: groupId, name, layers: [] }],
  };
}

export function setLayerVisibility(state: LayerState, id: string, visible: boolean): LayerState {
  return {
    ...state,
    layers: state.layers.map((l) => (l.id === id ? { ...l, visible } : l)),
  };
}
