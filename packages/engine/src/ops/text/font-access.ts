export async function probeLocalFonts(): Promise<string[]> {
  const env = globalThis as Record<string, unknown>;
  if (typeof env.queryLocalFonts === 'function') {
    try {
      const fonts = await (env.queryLocalFonts as () => Promise<Array<{ family: string }>>)();
      return fonts.map((font: { family: string }) => font.family);
    } catch {
      return [...FALLBACK_FONTS];
    }
  }
  return [...FALLBACK_FONTS];
}

export const FALLBACK_FONTS: readonly string[] = [
  'Impact',
  'Arial',
  'Arial Black',
  'Comic Sans MS',
  'Montserrat',
  'Roboto',
  'Open Sans',
  'sans-serif',
];

export type FontFamily = (typeof FALLBACK_FONTS)[number] | string;

export function isSupportedFontType(file: File): boolean {
  return (
    file.type === 'font/ttf' ||
    file.type === 'font/otf' ||
    file.type === 'font/woff' ||
    file.type === 'font/woff2' ||
    file.name.endsWith('.ttf') ||
    file.name.endsWith('.otf')
  );
}
