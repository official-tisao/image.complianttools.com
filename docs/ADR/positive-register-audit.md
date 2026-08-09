# Positive-register audit

- **Date:** 2026-08-09
- **P0-08 status:** Blocked

The currently installed 219-package graph is pinned and verified by
`docs/THIRD-PARTY-LICENSES.md`. The broader README §25.3.4 product register cannot yet be verified at
“the pinned version” because most product dependencies and all listed model/data assets do not yet
have versions or hashes in `pnpm-lock.yaml` / `docs/static-assets.json`.

No unpinned package or asset is approved to ship. `docs/ADR/ip-clearance.md` records exclusion as the
fallback for every unverified row. P0-08 can complete only after those exact versions/hashes are added;
verification based on a floating latest release would not satisfy the task.

Verified additions on 2026-08-09: Svelte 5.56.8 (MIT), Tailwind CSS 4.3.3 (MIT), Playwright
1.62.1 (Apache-2.0), Vitest 4.1.10 (MIT), and the pinned jSquash JPEG 1.6.0, PNG 3.1.1, oxipng
2.3.0, and WebP 1.5.0 wrappers and bundled codec licence files. MozJPEG's IJG, BSD-3, and Zlib
licences apply by portion rather than election; mandatory IJG product attribution is build-enforced.
