import { unzipSync, zipSync } from 'fflate';

export interface ComicPage {
  readonly name: string;
  readonly bytes: Uint8Array;
}

const imageExtension = /\.(?:avif|gif|jpe?g|jxl|png|webp)$/iu;
const unsafePath = /(?:^|\/)\.\.(?:\/|$)|^\/|^[a-z]:/iu;

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

/** Reads image pages from a bounded ZIP/CBZ archive without writing to the filesystem. */
export function decodeCbz(input: ArrayBuffer | Uint8Array): readonly ComicPage[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error('CBZ file does not contain a ZIP signature.');
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes, { filter: (entry) => !entry.name.endsWith('/') });
  } catch (cause) {
    throw new Error(`CBZ ZIP data is malformed: ${cause instanceof Error ? cause.message : cause}`);
  }
  const names = Object.keys(archive);
  if (names.length > 10_000) throw new Error('CBZ archive exceeds the 10,000-entry safety limit.');
  if (names.some((name) => unsafePath.test(name.replaceAll('\\', '/'))))
    throw new Error('CBZ archive contains an unsafe traversal path.');
  const pages = names
    .filter((name) => imageExtension.test(name))
    .sort(naturalCompare)
    .map((name) => ({ name, bytes: archive[name]! }));
  if (pages.length === 0) throw new Error('CBZ archive contains no supported image pages.');
  const total = pages.reduce((sum, page) => sum + page.bytes.byteLength, 0);
  if (total > 1_000_000_000)
    throw new Error('CBZ expanded image data exceeds the 1 GB safety limit.');
  return pages;
}

/** Creates a deterministic CBZ archive from image pages. */
export function encodeCbz(pages: readonly ComicPage[]): ArrayBuffer {
  if (pages.length === 0 || pages.length > 10_000)
    throw new Error('CBZ export requires between 1 and 10,000 image pages.');
  const archive: Record<string, Uint8Array> = {};
  for (const page of pages) {
    const name = page.name.replaceAll('\\', '/');
    if (!imageExtension.test(name) || unsafePath.test(name) || archive[name])
      throw new Error(
        `CBZ page name is unsafe, duplicated, or not a supported image: ${page.name}`,
      );
    archive[name] = page.bytes;
  }
  // ZIP timestamps default to "now", which makes identical local exports byte-different.
  // A local-time constructor keeps the encoded DOS date stable across host time zones.
  const output = zipSync(archive, { level: 0, mtime: new Date(1980, 0, 1) });
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
}
