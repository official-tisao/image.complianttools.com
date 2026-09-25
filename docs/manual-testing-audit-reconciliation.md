# Manual testing report reconciliation

**Report date:** 2026-09-23  
**Source:** the manual testing report attached to the long-horizon feature-audit task  
**Register:** [`feature-audit.csv`](../feature-audit.csv)

## Reconciliation rule

The attached report is a black-box observation from an earlier build. A line is not a new bug when
the same route or feature already has a `FEATURE` row in `feature-audit.csv`. Such lines are recorded
below as **duplicate/stale**, with the existing audit row remaining the single status owner. A report
line becomes a new bug only after it reproduces against the current branch and is not already covered
by an open `BUG` row or an explicit exclusion.

## Findings mapped to the register

| Report observation                                                                  | Register owner                              | Classification and follow-up                                                                                                                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/convert` JPEG→WebP/PNG preview and download failed with an HTML-as-WASM error     | T01; shared runtime only after reproduction | Duplicate route observation. The error signature means a WASM URL returned HTML. Re-run the current production build and asset gate before opening a new bug; do not create a second T01 row.  |
| `/resize` preview/download failed with the same WASM error                          | T24; shared runtime only after reproduction | Duplicate route observation. Verify the shared codec delivery path once; track any confirmed shared defect once, not per route.                                                                |
| OCR called “not implemented” and returned HTTP 500                                  | T62                                         | Stale/contradicted by the current route, worker, catalog, and OCR E2E. Re-run the current route smoke; retain T62’s documented Hausa exclusion and CDN/local model behavior.                   |
| `/adaptive-resize` called “not implemented” and returned HTTP 500                   | T81                                         | Stale/contradicted by the current route and focused T81 suite. Reproduce against the current build before changing the register.                                                               |
| `/compress` preview/download failed with the same WASM error                        | T20; BUG-1                                  | Duplicate route observation. BUG-1 already owns the measured size/latency problem; the WASM delivery signature is a shared-runtime investigation, not a second compressor bug.                 |
| `/lossless-optimizer` passed                                                        | T23 (`/lossless-optimize`)                  | Route spelling differs; this is a pass observation for the audited route.                                                                                                                      |
| `/upscale` called “not implemented”                                                 | T32                                         | Stale/contradicted by Tier 1 and user-started Tier 2 implementation. Remaining exclusions and STCC gaps stay in the T32 row.                                                                   |
| `/pixel-art-upscale` called “not implemented”                                       | T70 (`/pixel-art-upscaler`)                 | Route spelling differs; the current route is implemented and audited.                                                                                                                          |
| `/smart-crop` called “not implemented”                                              | T27                                         | Stale/contradicted by the current local heuristic route. The audit correctly keeps broader quality/STCC evidence open.                                                                         |
| `/blur-face` only accepted PNG                                                      | T57                                         | Partially actionable limitation already owned by T57. Keep manual-region support and the cleared YuNet path; add broader input conversion only with an engine test and measured STCC evidence. |
| Color Match called “not implemented”                                                | T80                                         | Stale/contradicted by the current route, worker, schema, and focused E2E.                                                                                                                      |
| `/compare` passed                                                                   | T60                                         | Pass observation; no new bug.                                                                                                                                                                  |
| `/find-duplicates` called “not implemented”                                         | T61                                         | Stale/contradicted by the current route, worker, schema, and focused E2E.                                                                                                                      |
| `/image-info`, `/exif-viewer`, `/remove-exif` passed                                | T59, T54, T55                               | Pass observations; no new bugs.                                                                                                                                                                |
| `/alt-text` called “not implemented”                                                | T63                                         | Stale/contradicted by the current manual-writing-aid route. It must not be reported as a separate bug.                                                                                         |
| HEIC and RAW routes passed, with RAW described as DNG-only                          | T02, T03                                    | Existing partial scope. The register already records platform/legacy-extension exclusions; no duplicate bug.                                                                                   |
| AVIF, WebP, and JPEG XL failed with WASM initialization errors                      | T04, T05, T06                               | Duplicate shared-codec delivery observation. Reproduce once against the current build and update the existing format/STCC rows or open one shared asset-delivery bug.                          |
| GIF converter, SVG rasterizer, vectorizer, Base64, embedded, CBZ, PDF routes passed | T14, T07, T08, T17, T16, T19, T09, T10      | Pass observations; no new bugs.                                                                                                                                                                |
| `/gif-maker` called “not implemented”                                               | T12                                         | Stale/contradicted by the current route implementation.                                                                                                                                        |
| Video frame to GIF passed                                                           | T13/FMT-VID                                 | Pass observation; existing WebKit/MP4 findings remain owned by BUG-2 and BUG-3.                                                                                                                |
| Favicon generation failed with the same WASM error                                  | T11                                         | Duplicate shared-codec delivery observation; do not create a favicon-specific duplicate until current-build reproduction.                                                                      |
| `/editor` only had a shell                                                          | T48                                         | Accurate partial finding already represented by the register. It is an implementation wave, not a duplicate bug.                                                                               |
| `/generate` called “not implemented”                                                | T79                                         | Stale/contradicted by the current procedural generator route; its audit row correctly keeps route STCC/quality evidence open.                                                                  |
| `/connect-ai` passed                                                                | P5-01 / AI registry                         | Pass observation; no new bug.                                                                                                                                                                  |

## Result

The report creates **no additional bug rows** at this stage. It contributes three verification
actions to the existing register:

1. Re-run a current-build shared WASM asset-delivery smoke for T01/T04/T05/T06/T11/T20/T24.
2. Re-run current route entry/error smoke for the report’s “not implemented” claims and retain the
   existing T27/T32/T62/T63/T70/T79/T80/T81 ownership.
3. Extend T57 input normalization only after the engine path and its licence/STCC evidence are ready.

Until those checks reproduce on this branch, the attached report is historical evidence and must not
be used to downgrade already verified rows or to create duplicate bugs.

## Open questions and defaults

| Question                                                                             | Default if unanswered after the review window                                                                                                             |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Was the manual report run against the current `master` build or an older deployment? | Treat it as an older deployment because the error signatures conflict with current route E2E and the audit dates.                                         |
| Should non-PNG T57 inputs be accepted?                                               | Yes, decode locally through the existing raster path, then keep the blur operation/export PNG-only; add this only as a scoped T57 enhancement with tests. |
| Should AI-only routes ship without a provider key?                                   | Keep BYOK/provider-gated behavior and a typed, useful local explanation; do not invent a hosted model or embed credentials.                               |
