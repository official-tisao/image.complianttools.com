# Positive-register audit

- **Date:** 2026-08-09
- **P0-08 status:** Blocked

The currently installed 174-package toolchain graph is pinned and verified by
`docs/THIRD-PARTY-LICENSES.md`. The broader README §25.3.4 product register cannot yet be verified at
“the pinned version” because most product dependencies and all listed model/data assets do not yet
have versions or hashes in `pnpm-lock.yaml` / `docs/static-assets.json`.

No unpinned package or asset is approved to ship. `docs/ADR/ip-clearance.md` records exclusion as the
fallback for every unverified row. P0-08 can complete only after those exact versions/hashes are added;
verification based on a floating latest release would not satisfy the task.
