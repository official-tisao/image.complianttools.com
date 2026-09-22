# P4-21 benchmark: T81 Adaptive Resize

**Status:** The initial comparison exposed that protected rows and columns were under-sampled. The implementation now reserves one output sample for each protected source row and column, and all four masked synthetic subjects retain their exact input pixel count and bounding-box dimensions on the tested feasible resize. Position can still shift as unprotected content is compressed. The wider evidence remains synthetic and route-level STCC is open.

## Reproduce

From the repository root:

    pnpm --filter @complianttools/image-engine build
    node packages/engine/bench/escalation/t81/generate-fixtures.mjs --verify
    node packages/engine/bench/escalation/t81/run.mjs

The runner, generated PNGs and masks, annotations, input/output hashes, and per-subject data are in t81/.

## Measurements

| Method | Subjects detected | Mean subject-area ratio | Mean absolute bbox aspect change | Mean absolute centroid offset |
| --- | ---: | ---: | ---: | ---: |
| Lanczos3 resize | 4/4 | 0.6647× | 33.53% | 0.21 px |
| Center crop | 4/4 | 0.6800× | 32.00% | 7.17 px |
| Saliency retarget, no mask | 4/4 | 1.4720× | 19.29% | 7.67 px |
| Saliency retarget, protect mask | 4/4 | 1.0000× | 0.00% | 8.08 px |

Before the fix, the protected-mask run retained 0.5232× subject area and had 40.27% mean aspect change. The preserved baseline JSON and protected-mask PNGs are in t81/results-before-protection-fix.json and t81/artifacts-before-protection-fix/. After the fix, masked subjects preserve their measured shape and pixel area, with an 8.08 px average horizontal centroid shift. These geometric diagnostics are not learned or human preference scores.

## Limits and remaining work

The benchmark does not establish quality on natural photographs, people, text, irregular masks, larger images, or human judgments. There is no exact reference image for an ideal retargeted scene. This result verifies feasible protected-mask sampling on three generated scenes; expand the corpus and complete route-level STCC before claiming broader retarget quality.