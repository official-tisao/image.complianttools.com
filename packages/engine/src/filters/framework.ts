import type { RasterImage } from '../types.js';

export interface FilterOptions {
  readonly method?: string;
  readonly threshold?: number;
  readonly dither?: string;
  readonly intensity?: number;
  readonly tone?: string;
  readonly shadowColor?: string;
  readonly highlightColor?: string;
  readonly midpoint?: number;
  readonly stops?: readonly { stop: number; color: string }[];
  readonly levels?: number;
  readonly amount?: number;
  readonly size?: number;
  readonly roughness?: number;
  readonly monochromatic?: boolean;
  readonly strength?: number;
  readonly channels?: string;
}

export interface FilterDescriptor {
  readonly name: string;
  readonly apply: (image: RasterImage, options: Record<string, unknown>) => RasterImage;
  readonly defaultOptions: Record<string, unknown>;
}

const filterRegistry = new Map<string, FilterDescriptor>();

export function registerFilter(descriptor: FilterDescriptor): void {
  filterRegistry.set(descriptor.name, descriptor);
}

export function getFilter(name: string): FilterDescriptor | undefined {
  return filterRegistry.get(name);
}

export function getRegisteredFilters(): readonly string[] {
  return Array.from(filterRegistry.keys());
}

export function clampByte(value: number): number {
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
