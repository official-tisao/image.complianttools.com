export function probeLocalFonts(): Promise<string[]> {
  return Promise.resolve([]);
}

export function isSupportedFontType(file: File): boolean {
  return file.type === 'font/ttf' || file.type === 'font/otf' || file.type === 'font/woff' || file.type === 'font/woff2' || file.name.endsWith('.ttf') || file.name.endsWith('.otf');
}
