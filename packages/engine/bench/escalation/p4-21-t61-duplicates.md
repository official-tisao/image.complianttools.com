# P4-21 benchmark: T61 duplicate retrieval

**Status:** Initial thresholded pairwise retrieval was measured on 24 controlled images derived from four individually registered CC0 sources. A separate route-shaped supplement measures the current product hash rule on 12 controlled images derived from two additional CC0 sources. The initial set still exposes a substantial recall shortfall at the preselected 5% Hamming threshold; visually near-identical negatives, held-out thresholding, and route-level STCC remain open.

## Corpus and labels

[`t60-t61/prepare-fixtures.mjs`](t60-t61/prepare-fixtures.mjs) verifies each CC0 source hash, takes a centered square crop, and resizes it with the engine's Lanczos3 resizer to 128×128. For each source it stores a reference, an exact pixel copy, JPEG quality 90 and quality 45 re-encodes, a centered 90% crop restored to 128×128, and an RGB brightness +12 variant. Every derived PNG is registered in [`t60-t61/fixtures/manifest.json`](t60-t61/fixtures/manifest.json) with its source ID/hash, transformation parameters, dimensions, byte count, PNG SHA-256, and decoded RGBA SHA-256.

Pairs with the same `sourceAssetId` are labeled positive; pairs from different source IDs are negative. The 24 images produce 552 directed query-to-candidate comparisons: 120 positives and 432 negatives. This label answers whether two files derive from the same source scene under the listed transforms. It does not encode a user's broader notion of duplicates.

The runner compares the engine's `perceptualHash` (the current per-pixel average-hash implementation) and `differenceHash`, normalizing Hamming distance by bit count. It uses a fixed `distanceFraction ≤ 0.05` threshold chosen before these measurements and also records a threshold sweep. The best-F1 threshold is reported only as a post-hoc description of this corpus. These primitive scores hash the 128×128 fixtures directly; they do not use the `/find-duplicates` page's 8×8 Canvas preprocessing or its active dual-hash gate, which are measured separately below.

## Results

| Hash                            | Fixed threshold | Precision | Recall |  TP |  FP |  FN |  TN |
| ------------------------------- | --------------: | --------: | -----: | --: | --: | --: | --: |
| `perceptualHash` / average hash |              5% |    1.0000 | 0.5500 |  66 |   0 |  54 | 432 |
| `differenceHash`                |              5% |    1.0000 | 0.2000 |  24 |   0 |  96 | 432 |

The fixed threshold produced no false positives among these easy cross-source negatives, but missed 45% of positive pairs with average hash and 80% with difference hash. A post-hoc sweep on this same corpus found average-hash F1 0.9565 at a 22.5% threshold (precision 1.0000, recall 0.9167), and difference-hash F1 0.7500 at 29.5% (precision 1.0000, recall 0.6000). Those thresholds are not held-out results and are not deployment recommendations.

## Route-shaped topic-matched supplement

[`t60-t61/prepare-topic-negatives.mjs`](t60-t61/prepare-topic-negatives.mjs) registers two Wikimedia Commons CC0 photos and creates six reproducible variants per item. The 12 PNG fixtures are 128×128; [`t60-t61/run-topic-negatives.mjs`](t60-t61/run-topic-negatives.mjs) verifies their byte and decoded-pixel hashes, then uses Chromium to decode each fixture and draw it into the same 8×8 canvas used by `/find-duplicates` before calling the production hash functions. The runner checks the page's canvas size and thresholds to flag benchmark drift.

The 12 fixtures produce 132 directed pairs: 60 same-source positives and 72 topic-matched cross-source negatives. The live product rule groups exact SHA-256 duplicates and, for byte-distinct files, requires average-hash distance ≤6/64, difference-hash distance ≤6/49, and an aspect-ratio difference ≤10%. Combined, it yielded 34 true positives, 0 false positives, 26 false negatives, and 72 true negatives (precision 1.0000, recall 0.5667, F1 0.7234). Four directed pairs were detected by exact SHA-256; among non-identical pairs the visual rule found 30/56 positives (recall 0.5357), with 0 false positives among 72 topic-matched negatives. The two photos share an autumn-leaf subject but visibly differ in composition and texture; they are not near-identical visual hard negatives. This small sample does not support a broad precision claim or replace route-level STCC.

The exact sources, item-level CC0 metadata snapshots, thumbnail bytes, derived fixture bytes, and all directed scores are recorded in [`t60-t61/fixtures/topic-negatives/source-manifest.json`](t60-t61/fixtures/topic-negatives/source-manifest.json), [`t60-t61/fixtures/topic-negatives/manifest.json`](t60-t61/fixtures/topic-negatives/manifest.json), and [`t60-t61/t61-topic-negatives-results.json`](t60-t61/t61-topic-negatives-results.json). The benchmark measures the current Chromium preprocessing path; other browsers and real user libraries remain outside this corpus.

## Reproduction and limits

From the repository root:

```powershell
pnpm --filter @complianttools/image-engine build
node scripts/verify-p4-21-cc0-fixtures.mjs
node packages/engine/bench/escalation/t60-t61/prepare-fixtures.mjs
node packages/engine/bench/escalation/t60-t61/prepare-fixtures.mjs --verify
node packages/engine/bench/escalation/t60-t61/run.mjs
pnpm exec playwright install chromium
node packages/engine/bench/escalation/t60-t61/prepare-topic-negatives.mjs
node packages/engine/bench/escalation/t60-t61/prepare-topic-negatives.mjs --verify
node packages/engine/bench/escalation/t60-t61/run-topic-negatives.mjs
```

The original negatives are six pairs among only four quite different source images. The supplement adds two topic-matched autumn-leaf scenes, but not visually near-identical negatives or same-object/different-photo cases. The same-source positives are deterministic edits, not a representative collection of real user duplicates. No threshold should be selected from these results alone. Next evidence should add individually cleared, visually near-identical negative scenes and real re-encodes/resizes/crops with reviewed duplicate labels, then measure precision/recall on held-out source groups.

## Route verification

The focused T61 production-preview route suite passes 27/27 checks across Chromium, Firefox, and WebKit. It covers prerendered default/Arabic pages, local processing, exact/near-match review and CSV export, keyboard cancellation, Axe, no off-origin requests, and all seven typed route error kinds with remedies: too-many files, per-file/batch bytes, unsupported MIME, decode, pixel ceiling, hashing, and cancellation. This verifies route handling but does not add duplicate-quality evidence or establish a latency budget. The absent Zod-generated controls, complete SEO/i18n coverage, offline operation, visually near-identical negatives, held-out thresholds, and full STCC remain open.
