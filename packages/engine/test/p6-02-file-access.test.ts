/**
 * P6-02 File System Access engine tests — README §7.2, PLAN.md P6-02.
 *
 * These cover the two decisions the browser cannot be asked about in a unit test: what an output
 * is called, and what the fallback archive contains. Both matter more than they look — a wrong
 * name in an overlapping folder is an endless reprocessing loop, and a wrong ZIP is an archive
 * that silently drops an image.
 *
 * The archive is verified by unzipping it with `fflate` and comparing bytes, so "the ZIP
 * contains the images" means their exact contents, not just that a file was produced.
 */

import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { buildZipArchive, planOutputNames, zipEntryNames } from '../src/ops/file-access.js';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('planOutputNames', () => {
  it('leaves distinct names untouched', () => {
    expect(planOutputNames(['a.webp', 'b.jpg'])).toEqual([{ name: 'a.webp' }, { name: 'b.jpg' }]);
  });

  it('keeps two inputs that share a basename, instead of overwriting one with the other', () => {
    // The recursive-watch case: `a/shot.png` and `b/shot.png` both produce `shot.webp`. In the
    // output folder the second write would replace the first and one image would be lost. The
    // first occurrence keeps the plain name so the common case is unchanged.
    const planned = planOutputNames(['shot.webp', 'shot.webp', 'shot.webp']);
    expect(planned.map((entry) => entry.name)).toEqual(['shot.webp', 'shot-2.webp', 'shot-3.webp']);
    expect(planned.map((entry) => entry.suffix)).toEqual([undefined, 'collision', 'collision']);
  });

  it('renames an output that would collide with a file already in the destination', () => {
    // The overlap case: `shot.png` has already been processed once and `shot.webp` sits in the
    // watched folder. Writing `shot.webp` again makes the next sweep process the write itself.
    const planned = planOutputNames(['shot.webp'], new Set(['shot.webp']));
    expect(planned).toEqual([{ name: 'shot-2.webp', suffix: 'collision' }]);
  });

  it('lets a name be reused once it is free again', () => {
    // The caller passes only the names in scope for this operation — the current sweep, plus the
    // destination set when the folders overlap. Nothing is remembered between calls, so a source
    // re-processed later keeps its plain name instead of accumulating -2, -3 copies forever.
    expect(planOutputNames(['shot.webp'], new Set())).toEqual([{ name: 'shot.webp' }]);
  });

  it('dedupes a batch while leaving a name free for the next batch', () => {
    // Two sources in one sweep must not overwrite each other...
    expect(planOutputNames(['shot.webp', 'shot.webp']).map((entry) => entry.name)).toEqual([
      'shot.webp',
      'shot-2.webp',
    ]);
    // ...but the next sweep starts from scratch, so the same source is not numbered twice.
    expect(planOutputNames(['shot.webp']).map((entry) => entry.name)).toEqual(['shot.webp']);
  });

  it('skips past every occupied name rather than reusing one', () => {
    const planned = planOutputNames(
      ['shot.webp'],
      new Set(['shot.webp', 'shot-2.webp', 'shot-3.webp']),
    );
    expect(planned[0]!.name).toBe('shot-4.webp');
  });

  it('compares names case-insensitively, as the host filesystems it targets do', () => {
    expect(planOutputNames(['Shot.webp'], new Set(['shot.WEBP']))[0]!.name).toBe('Shot-2.webp');
  });

  it('keeps a name that has no extension usable', () => {
    expect(planOutputNames(['README', 'README'])[1]!.name).toBe('README-2');
  });

  it('is deterministic for a given input order', () => {
    expect(planOutputNames(['a.webp', 'a.webp', 'b.webp']).map((entry) => entry.name)).toEqual(
      planOutputNames(['a.webp', 'a.webp', 'b.webp']).map((entry) => entry.name),
    );
  });
});

describe('buildZipArchive', () => {
  it('round-trips the exact bytes of every entry', () => {
    const archive = buildZipArchive([
      { name: 'one.webp', bytes: bytes(1, 2, 3, 250) },
      { name: 'two.jpg', bytes: bytes(9, 8, 7) },
    ]);
    const unpacked = unzipSync(archive);
    expect([...unpacked['one.webp']!]).toEqual([1, 2, 3, 250]);
    expect([...unpacked['two.jpg']!]).toEqual([9, 8, 7]);
  });

  it('holds every file when two share a basename', () => {
    // A ZIP silently drops an entry written to an existing name, so the disambiguation has to
    // happen here too, not only for the folder write.
    const archive = buildZipArchive([
      { name: 'shot.webp', bytes: bytes(1) },
      { name: 'shot.webp', bytes: bytes(2) },
    ]);
    const unpacked = unzipSync(archive);
    expect(Object.keys(unpacked).sort()).toEqual(['shot-2.webp', 'shot.webp']);
    expect([...unpacked['shot.webp']!]).toEqual([1]);
    expect([...unpacked['shot-2.webp']!]).toEqual([2]);
  });

  it('produces the same bytes for the same input', () => {
    const files = [
      { name: 'a.webp', bytes: bytes(1, 2, 3) },
      { name: 'b.webp', bytes: bytes(4, 5, 6) },
    ];
    expect([...buildZipArchive(files)]).toEqual([...buildZipArchive(files)]);
  });

  it('produces an empty archive for no files rather than throwing', () => {
    expect(zipEntryNames([])).toEqual([]);
    expect(unzipSync(buildZipArchive([]))).toEqual({});
  });

  it('reports the names it will use before the archive is built', () => {
    expect(zipEntryNames([{ name: 'a.webp' }, { name: 'a.webp' }])).toEqual(['a.webp', 'a-2.webp']);
  });
});
