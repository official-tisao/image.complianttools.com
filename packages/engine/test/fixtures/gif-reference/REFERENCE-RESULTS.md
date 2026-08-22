# GIF reference results

Verified on 2026-08-22 with the committed corpus, engine commit `ba5c685` plus the non-dithered
palette-index cache in the same working change, and Gifsicle 1.95 for Windows used only as an external
oracle.

- All 20 files passed the per-file `<= 1.10` ratio.
- Worst case: `windows95.gif`, 23,428 bytes versus 21,950 bytes (`1.067`).
- Aggregate: 6,066,977 bytes versus 5,988,284 bytes (`1.013`).

The authoritative evidence is the output of `node scripts/verify-gif-reference.mjs`; this file is a
human-readable record, not a replacement for rerunning the verifier.
