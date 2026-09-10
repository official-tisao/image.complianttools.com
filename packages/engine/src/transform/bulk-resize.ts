/**
 * P3-06 T25 Bulk resize preset packs.
 * Reuses existing resizeRaster / ResizeOptions infrastructure.
 */
export interface ResizePreset {
  readonly label: string;
  readonly width?: number;
  readonly height?: number;
  readonly fitMode?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside' | 'pad';
  readonly formatHint?: string;
  readonly quality?: number;
}

export const RESIZE_PRESETS: readonly ResizePreset[] = [
  { label: 'Instagram Post', width: 1080, height: 1080, fitMode: 'contain' },
  { label: 'Instagram Portrait', width: 1080, height: 1350, fitMode: 'contain' },
  { label: 'Instagram Story/Reel', width: 1080, height: 1920, fitMode: 'contain' },
  { label: 'Facebook Post', width: 1200, height: 630, fitMode: 'contain' },
  { label: 'Facebook Cover', width: 820, height: 312, fitMode: 'contain' },
  { label: 'X Post', width: 1600, height: 900, fitMode: 'contain' },
  { label: 'LinkedIn Post', width: 1200, height: 627, fitMode: 'contain' },
  { label: 'YouTube Thumbnail', width: 1280, height: 720, fitMode: 'contain' },
  { label: 'Print A4', width: 2480, height: 3508, fitMode: 'contain' },
  { label: 'Web 1920px', width: 1920, height: 1080, fitMode: 'contain' },
];
