/**
 * P6-02 File System Access integration — engine half. README §7.2, PLAN.md P6-02.
 *
 * README §7.2 requires two platform APIs and names their fallbacks: the File System Access API
 * (T74 folder input and folder output) degrades to "hidden; `<input type=file>` + ZIP download", and
 * `showSaveFilePicker` degrades to "anchor download". The browser-facing halves of those two
 * statements — the picker objects, the blob writes, the anchor click — cannot be unit tested, so
 * everything that decides *what* is written and *where* lives here instead:
 *
 * - `planOutputNames` resolves the collisions that appear the moment the output folder is the
 *   watched folder, which is the configuration that otherwise reprocesses its own output forever.
 * - `buildZipArchive` produces the single archive the fallback downloads instead of N downloads.
 *
 * Both are pure and synchronous: the tests drive them with plain byte arrays and path strings.
 */

import { zipSync } from 'fflate';

export interface PlannedOutputName {
  /** Name written to disk or stored in the archive, unique within one batch. */
  readonly name: string;
  /** Set when the plain name had to change, so the UI can say why. */
  readonly suffix?: 'collision';
}

/** Splits `photo.webp` into `photo` and `.webp`; a name with no dot keeps its whole stem. */
function splitExtension(name: string): { stem: string; extension: string } {
  const dot = name.lastIndexOf('.');
  return dot > 0
    ? { stem: name.slice(0, dot), extension: name.slice(dot) }
    : { stem: name, extension: '' };
}

/**
 * Assigns a unique name to every output in a batch.
 *
 * Two separate hazards need handling, and conflating them is how the watcher ends up re-reading
 * its own work:
 *
 * 1. **Distinct inputs, one name.** A recursive watch of `a/shot.png` and `b/shot.png` produces
 *    two files both called `shot.webp`. In the output folder that is not cosmetic — the second
 *    write overwrites the first and one image is silently lost. Numbered suffixes keep both,
 *    deterministically, in the order the entries are given.
 * 2. **An output name already present in the source.** Writing `shot.webp` back into the watched
 *    folder makes the next sweep see a new file and process it again, forever. Such a name is
 *    disambiguated *before* it is written, so the generated file is never a candidate for its own
 *    next sweep.
 *
 * `existing` is the case-folded set of names already present in the destination, which is what
 * makes hazard 2 detectable.
 */
export function planOutputNames(
  names: readonly string[],
  existing: ReadonlySet<string> = new Set(),
): PlannedOutputName[] {
  const normalized = new Set([...existing].map((name) => name.toLowerCase()));
  const taken = new Set<string>();
  const planned: PlannedOutputName[] = [];
  for (const name of names) {
    const plain = name.toLowerCase();
    if (!taken.has(plain) && !normalized.has(plain)) {
      taken.add(plain);
      planned.push({ name });
      continue;
    }
    const { stem, extension } = splitExtension(name);
    let counter = 2;
    let candidate = `${stem}-${counter}${extension}`;
    while (
      (taken.has(candidate.toLowerCase()) || normalized.has(candidate.toLowerCase())) &&
      counter < 10_000
    ) {
      candidate = `${stem}-${++counter}${extension}`;
    }
    taken.add(candidate.toLowerCase());
    planned.push({ name: candidate, suffix: 'collision' });
  }
  return planned;
}

/**
 * Builds the ZIP the README §7.2 fallback requires.
 *
 * `fflate` is already an approved dependency (README §7.3) and already used by the favicon and
 * CBZ exporters, so this adds no new package. Images are already compressed — WebP and JPEG have
 * no useful DEFLATE mode — so level 0 stores them, which is both faster and smaller than
 * re-compressing them. `mtime` is pinned to the ZIP epoch so the same inputs produce the same
 * bytes, matching `createFaviconPackage`. Duplicate names are disambiguated rather than silently
 * overwriting an earlier entry.
 */
export function buildZipArchive(files: readonly { name: string; bytes: Uint8Array }[]): Uint8Array {
  const planned = planOutputNames(files.map((file) => file.name));
  const entries: Record<string, Uint8Array> = {};
  files.forEach((file, index) => {
    entries[planned[index]!.name] = file.bytes;
  });
  return zipSync(entries, { level: 0, mtime: new Date(1980, 0, 1) });
}

/** The ZIP file names, in the order they appear in the archive. */
export function zipEntryNames(files: readonly { name: string }[]): string[] {
  return planOutputNames(files.map((file) => file.name)).map((entry) => entry.name);
}
