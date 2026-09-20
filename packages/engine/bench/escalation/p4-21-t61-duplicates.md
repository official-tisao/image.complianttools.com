# P4-21 benchmark: T61 duplicate retrieval

**Status:** Initial thresholded pairwise retrieval was measured on 24 controlled images derived from four individually registered CC0 sources. It exposes a substantial recall shortfall at the preselected 5% Hamming threshold. The cross-source negatives are easy; a hard-negative corpus and route-level STCC remain open.

## Corpus and labels

[`t60-t61/prepare-fixtures.mjs`](t60-t61/prepare-fixtures.mjs) verifies each CC0 source hash, takes a centered square crop, and resizes it with the engine's Lanczos3 resizer to 128×128. For each source it stores a reference, an exact pixel copy, JPEG quality 90 and quality 45 re-encodes, a centered 90% crop restored to 128×128, and an RGB brightness +12 variant. Every derived PNG is registered in [`t60-t61/fixtures/manifest.json`](t60-t61/fixtures/manifest.json) with its source ID/hash, transformation parameters, dimensions, byte count, PNG SHA-256, and decoded RGBA SHA-256.

Pairs with the same `sourceAssetId` are labeled positive; pairs from different source IDs are negative. The 24 images produce 552 directed query-to-candidate comparisons: 120 positives and 432 negatives. This label answers whether two files derive from the same source scene under the listed transforms. It does not encode a user's broader notion of duplicates.

The runner compares the engine's `perceptualHash` (the current per-pixel average-hash implementation) and `differenceHash`, normalizing Hamming distance by bit count. It uses a fixed `distanceFraction ≤ 0.05` threshold chosen before these measurements and also records a threshold sweep. The best-F1 threshold is reported only as a post-hoc description of this corpus.

## Results

| Hash                            | Fixed threshold | Precision | Recall |  TP |  FP |  FN |  TN |
| ------------------------------- | --------------: | --------: | -----: | --: | --: | --: | --: |
| `perceptualHash` / average hash |              5% |    1.0000 | 0.5500 |  66 |   0 |  54 | 432 |
| `differenceHash`                |              5% |    1.0000 | 0.2000 |  24 |   0 |  96 | 432 |

The fixed threshold produced no false positives among these easy cross-source negatives, but missed 45% of positive pairs with average hash and 80% with difference hash. A post-hoc sweep on this same corpus found average-hash F1 0.9565 at a 22.5% threshold (precision 1.0000, recall 0.9167), and difference-hash F1 0.7500 at 29.5% (precision 1.0000, recall 0.6000). Those thresholds are not held-out results and are not deployment recommendations.

## Reproduction and limits

From the repository root:

```powershell
pnpm --filter @complianttools/image-engine build
node scripts/verify-p4-21-cc0-fixtures.mjs
node packages/engine/bench/escalation/t60-t61/prepare-fixtures.mjs
node packages/engine/bench/escalation/t60-t61/prepare-fixtures.mjs --verify
node packages/engine/bench/escalation/t60-t61/run.mjs
```

The negatives are six pairs among only four quite different source images; there are no visually similar scenes, same-object/different-photo negatives, or manually curated hard negatives. The same-source positives are deterministic edits of each source, not a representative collection of real user duplicates. No threshold should be selected from this result alone. Next evidence should add individually cleared, visually similar negative scenes and real re-encodes/resizes/crops with reviewed duplicate labels, then measure precision/recall on held-out source groups. The `/find-duplicates` route and route-level STCC remain unverified.
