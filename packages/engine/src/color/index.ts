// P3-05 colour tools barrel. Re-exports the four new tools (T40
// colour space & depth, T41 threshold reused from ops/enhance/, T45
// palette, T46 recolour) so the schema and pipeline can import them
// from one place.
export { convertColorSpace, to16Bit, type ColorSpaceTarget } from './convert.js';
export {
  extractPalette,
  exportPalette,
  exportPaletteCss,
  exportPaletteJson,
  exportPaletteGpl,
  type Palette,
  type PaletteEntry,
  type PaletteFormat,
  type PaletteMethod,
} from './palette.js';
export { applyRecolour, type RecolourSettings } from './recolour.js';
export { exportPaletteAse } from './palette.js';
export { reinhardTransfer, histogramMatch } from './transfer.js';
export type { ColourTransferOptions, HistogramMatchOptions } from './transfer.js';
