/**
 * T74 Folder Watcher engine tests — PLAN.md P6-01 / P6-02, README §7.2.
 *
 * The File System Access API exposes no change event for a directory, so "watching" is a timed
 * re-read diffed against the previous scan. These tests drive that diff with in-memory directory
 * handles, which is the only way to assert the property that matters: a file that appears, is
 * edited in place, and disappears is classified correctly, without a browser.
 */

import { describe, expect, it } from 'vitest';

import {
  DIRECTORY_UNAVAILABLE_REASON,
  FALLBACK_ACCEPT,
  batchEntries,
  diffSnapshots,
  fileExtension,
  isProcessableImage,
  outputFileName,
  scanFolder,
  supportsDirectoryAccess,
  type WatchedDirectoryHandle,
  type WatchedEntry,
} from '../src/ops/folder-watch.js';
import type { EngineError } from '../src/types.js';

/** A file that reports a fixed size and modified time, so a diff can be reasoned about exactly. */
interface FakeFile {
  name: string;
  size: number;
  lastModified: number;
}

/** Builds an async-iterable directory handle from a plain map of path → fake file. */
function folder(name: string, files: readonly FakeFile[]): WatchedDirectoryHandle {
  return {
    kind: 'directory',
    name,
    async *values(): AsyncIterableIterator<WatchedEntry> {
      for (const file of files)
        yield {
          kind: 'file',
          handle: {
            kind: 'file',
            name: file.name,
            getFile: async () => ({
              size: file.size,
              type: 'image/png',
              lastModified: file.lastModified,
            }),
          },
        };
    },
  };
}

function file(name: string, size = 100, lastModified = 1): FakeFile {
  return { name, size, lastModified };
}

describe('fileExtension and isProcessableImage', () => {
  it('reads an extension case-insensitively', () => {
    expect(fileExtension('Photo.PNG')).toBe('png');
    expect(fileExtension('archive.tar.gz')).toBe('gz');
    expect(fileExtension('noextension')).toBe('');
  });

  it('accepts the formats this tool can decode', () => {
    for (const name of ['a.png', 'b.JPG', 'c.jpeg', 'd.webp', 'e.gif', 'f.avif', 'g.jxl'])
      expect(isProcessableImage(name), name).toBe(true);
  });

  it('refuses formats the browser cannot decode as an image', () => {
    for (const name of ['notes.txt', 'clip.mp4', 'data.json', 'archive.zip', 'sheet.xls'])
      expect(isProcessableImage(name), name).toBe(false);
  });
});

describe('scanFolder', () => {
  it('lists every file in a folder', async () => {
    const snapshot = await scanFolder(folder('root', [file('a.png'), file('b.jpg')]));
    expect([...snapshot.entries.keys()].sort()).toEqual(['a.png', 'b.jpg']);
    expect(snapshot.scanned).toBe(2);
  });

  it('records size and modified time for the diff to compare', async () => {
    const snapshot = await scanFolder(folder('root', [file('a.png', 512, 99)]));
    expect(snapshot.entries.get('a.png')).toMatchObject({ size: 512, lastModified: 99 });
  });

  it('returns an empty snapshot for an empty folder', async () => {
    const snapshot = await scanFolder(folder('empty', []));
    expect(snapshot.entries.size).toBe(0);
    expect(snapshot.scanned).toBe(0);
  });

  it('skips a file that disappears mid-scan instead of failing the sweep', async () => {
    const handle: WatchedDirectoryHandle = {
      kind: 'directory',
      name: 'churn',
      async *values(): AsyncIterableIterator<WatchedEntry> {
        yield {
          kind: 'file',
          handle: {
            kind: 'file',
            name: 'vanishing.png',
            getFile: async () => {
              throw new DOMException('The file was removed during the scan.');
            },
          },
        };
        yield {
          kind: 'file',
          handle: {
            kind: 'file',
            name: 'stable.png',
            getFile: async () => ({ size: 10, type: 'image/png', lastModified: 1 }),
          },
        };
      },
    };
    const snapshot = await scanFolder(handle);
    expect([...snapshot.entries.keys()]).toEqual(['stable.png']);
  });
});

describe('diffSnapshots', () => {
  it('reports a newly added file', async () => {
    const before = await scanFolder(folder('root', [file('a.png')]));
    const after = await scanFolder(folder('root', [file('a.png'), file('b.png')]));
    const diff = diffSnapshots(before, after);
    expect(diff.added.map((entry) => entry.path)).toEqual(['b.png']);
    expect(diff.unchanged).toBe(1);
  });

  it('treats a file re-saved in place as new', async () => {
    // This is the case that matters: someone fixes a photo and saves it over the original. The
    // path is unchanged, so only a size or timestamp comparison catches the edit.
    const before = await scanFolder(folder('root', [file('a.png', 100, 1)]));
    const after = await scanFolder(folder('root', [file('a.png', 250, 5)]));
    const diff = diffSnapshots(before, after);
    expect(diff.added.map((entry) => entry.path)).toEqual(['a.png']);
    expect(diff.unchanged).toBe(0);
  });

  it('reports an untouched folder as fully unchanged', async () => {
    const before = await scanFolder(folder('root', [file('a.png', 100, 1), file('b.png', 50, 2)]));
    const after = await scanFolder(folder('root', [file('a.png', 100, 1), file('b.png', 50, 2)]));
    const diff = diffSnapshots(before, after);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toBe(2);
  });

  it('reports a deleted file without treating it as added', async () => {
    const before = await scanFolder(folder('root', [file('a.png'), file('b.png')]));
    const after = await scanFolder(folder('root', [file('a.png')]));
    const diff = diffSnapshots(before, after);
    expect(diff.removed).toEqual(['b.png']);
    expect(diff.added).toHaveLength(0);
  });

  it('handles a rename as one removal plus one addition', async () => {
    const before = await scanFolder(folder('root', [file('old.png')]));
    const after = await scanFolder(folder('root', [file('new.png')]));
    const diff = diffSnapshots(before, after);
    expect(diff.added.map((entry) => entry.path)).toEqual(['new.png']);
    expect(diff.removed).toEqual(['old.png']);
  });
});

describe('outputFileName', () => {
  it('replaces the extension with the output one', () => {
    expect(outputFileName('photo.png', 'webp')).toBe('photo.webp');
    expect(outputFileName('nested/photo.jpeg', 'jpg')).toBe('photo.jpg');
  });

  it('strips path separators so a name cannot escape the output folder', () => {
    expect(outputFileName('a/b/c.png', 'webp')).toBe('c.webp');
    expect(outputFileName('../escape.png', 'webp')).toBe('escape.webp');
  });

  it('removes characters the host filesystem rejects', () => {
    expect(outputFileName('a:b*c?.png', 'webp')).toBe('a_b_c_.webp');
  });

  it('keeps non-ASCII names intact', () => {
    expect(outputFileName('صورة.png', 'webp')).toBe('صورة.webp');
  });

  it('falls back to a usable name rather than an empty one', () => {
    expect(outputFileName('...', 'webp')).toBe('image.webp');
    expect(outputFileName('', 'jpg')).toBe('image.jpg');
  });
});

describe('batchEntries', () => {
  it('splits a large batch into bounded groups', () => {
    const batches = batchEntries([1, 2, 3, 4, 5], 2);
    expect(batches).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns no batches for an empty input', () => {
    expect(batchEntries([], 4)).toEqual([]);
  });

  it('rejects a non-positive batch size with a remedy', () => {
    let thrown: unknown;
    try {
      batchEntries([1], 0);
    } catch (cause) {
      thrown = cause;
    }
    const error = thrown as EngineError;
    expect(error.kind).toBe('unsupported-format');
    expect(error.remedy).toMatch(/at least 1/iu);
  });
});

describe('capability probing', () => {
  it('reports no directory access in a plain Node environment', () => {
    expect(supportsDirectoryAccess()).toBe(false);
    expect(DIRECTORY_UNAVAILABLE_REASON).toMatch(/does not implement/iu);
    expect(DIRECTORY_UNAVAILABLE_REASON).toMatch(/Pick the images directly/iu);
  });

  it('requires the picker and both constructors to be present', () => {
    const scope = globalThis as unknown as Record<string, unknown>;
    const saved = {
      picker: scope['showDirectoryPicker'],
      directory: scope['FileSystemDirectoryHandle'],
      writable: scope['FileSystemWritableFileStream'],
    };
    try {
      // Only the picker: still unsupported, because writing needs the other two.
      scope['showDirectoryPicker'] = () => undefined;
      expect(supportsDirectoryAccess()).toBe(false);

      scope['FileSystemDirectoryHandle'] = function FileSystemDirectoryHandle() {};
      expect(supportsDirectoryAccess()).toBe(false);

      scope['FileSystemWritableFileStream'] = function FileSystemWritableFileStream() {};
      expect(supportsDirectoryAccess()).toBe(true);
    } finally {
      for (const [key, value] of [
        ['showDirectoryPicker', saved.picker],
        ['FileSystemDirectoryHandle', saved.directory],
        ['FileSystemWritableFileStream', saved.writable],
      ] as const)
        if (value === undefined) delete scope[key];
        else scope[key] = value;
    }
  });

  it('offers the fallback picker every format it accepts', () => {
    expect(FALLBACK_ACCEPT).toContain('.png');
    expect(FALLBACK_ACCEPT).toContain('.webp');
    expect(FALLBACK_ACCEPT.split(',')).toHaveLength(10);
  });
});
