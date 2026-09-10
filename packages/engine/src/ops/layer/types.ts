export const BlendModes = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'difference',
] as const;

export type BlendMode = (typeof BlendModes)[number];

export interface Layer {
  readonly id: string;
  readonly image: string | ArrayBuffer; // source reference or inline data
  readonly blendMode: BlendMode;
  readonly opacity: number; // 0..1
  readonly visible: boolean;
  readonly order: number;
  readonly groupId?: string;
}

export interface LayerGroup {
  readonly id: string;
  readonly name: string;
  readonly layerIds: readonly string[];
  readonly visible: boolean;
}
