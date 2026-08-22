# PLAN.md — Execution plan for image.complianttools.com

> **Companion to [README.md](README.md).** The README is the **specification** (what to build and why).
> This file is the **execution ledger** (in what order, and what is done).
> Neither supersedes the other. If they disagree, stop and reconcile them in the same commit.

---

## 0. How to use this plan

### 0.1 Rules for the implementing agent

1. **Work top to bottom.** Phases are ordered by dependency, not preference. Do not start a phase until
   the previous phase's **Gate** passes in CI.
2. **Check a box only when its `Done when` is objectively true** — a passing test, a green CI check, a
   measured number. Never on "looks right". If you cannot verify it, it is not done.
3. **One task, one commit** (or one PR). The commit message references the task ID: `feat(P2-07): …`.
4. **Never check a parent box** until all its children are checked.
5. **Read the linked README section before starting a task.** The `Spec` line is not decoration; the
   task text here is a summary, and the README is authoritative.
6. **If a task turns out to be wrong, blocked, or unnecessary**, do not silently skip it. Mark it
   `[~]` with a one-line reason and add a line to §14 Change Log. An unexplained skip is a defect.
7. **Do not add scope that is not in this file.** If the work is needed, add it to the README first,
   then add the PLAN entry (§0.3), then do it.

### 0.2 Status legend

| Mark | Meaning |
| :-: | --- |
| `[ ]` | Not started |
| `[/]` | In progress |
| `[x]` | Done — `Done when` verified |
| `[~]` | Deferred or dropped — **reason required inline**, and a §14 Change Log entry |
| `[!]` | Blocked — blocker named inline |

### 0.3 Change-control protocol (README ↔ PLAN)

**Any change to README.md must produce a corresponding entry in this file, in the same commit.**
This is the rule that keeps the spec and the build from drifting.

| README change | Required PLAN action |
| --- | --- |
| New feature, tool, or option | Add a task in the correct phase **and** a row in Appendix A/B/C. Add a §14 Change Log entry |
| Changed requirement on unbuilt work | Amend the task text; note in §14 |
| Changed requirement on **already-checked** work | **Uncheck the box**, add a `-R` revision task (e.g. `P2-07-R1`), note in §14. A completed task whose spec moved is no longer complete |
| Removed feature | Mark the task `[~]`, note why, note in §14 |
| New dependency or algorithm | Add to Appendix D (clearance) before any implementation task references it |
| New AI capability | Add an AI Justification Register row in README §13.1.3 **first**, then the task here |
| Clarification with no behavioural change | §14 entry only, no task |

CI enforces the spirit of this: `scripts/check-plan-sync.ts` (task **P0-16**) fails the build when
`README.md` changes in a commit that does not also touch `PLAN.md`.

### 0.4 Definitions used throughout

**STCC — Standard Tool Completion Checklist.** A tool in Appendix A is checked only when all twelve
hold. Do not restate these per tool; they are assumed.

1. Engine op(s) implemented in `packages/engine`, no DOM dependency
2. Zod schema + UI metadata; controls generated, not hand-written (README §10.2, §11.7)
3. All option defaults are no-ops (P9)
4. Unit tests: happy path + every error branch
5. At least one adversarial-input test producing a typed error with a useful `remedy` (P8)
6. Prerendered standalone HTML page meeting all ten §7.6 rules
7. Page passes the SEO checklist (Appendix E)
8. Live preview path exists and is proven faithful to export (README §8.5)
9. Meets its §19 latency budget, measured
10. `axe` zero violations; keyboard-operable end to end
11. All strings are i18n messages with translator comments; survives `en-XA` and `ar`
12. Works offline (or states its reason honestly if it cannot)

**SPCC — Standard Page Completion Checklist.** Every prerendered page (Appendix E).

**Gate.** A phase-ending set of conditions, all verified in CI. A red gate stops the next phase.

---

## 1. Progress dashboard

Update these counts as you go. They are the honest status of the project at a glance.

| Phase | Focus | Tasks | Done | Gate |
| --- | --- | :-: | :-: | :-: |
| 0 | Foundation, toolchain, IP clearance | 17 | 13 | ⬜ |
| 1 | Core loop — 3 tools end to end | 15 | 15 | ✅ |
| 2 | Format breadth + our own codecs | 18 | 0 | ⬜ |
| 3 | Editing, batch, recipes | 15 | 0 | ⬜ |
| 4 | Local intelligence (Tier 1 & 2) | 22 | 0 | ⬜ |
| 5 | BYOK AI escalation | 17 | 0 | ⬜ |
| 6 | Long tail, PWA, CLI, extension | 16 | 0 | ⬜ |
| 7 | Pages, i18n, launch | 14 | 0 | ⬜ |
| — | **Total** | **134** | **28** | |

| Artefact | Target | Done |
| --- | :-: | :-: |
| Tools (Appendix A) | 81 | 3 |
| Formats (Appendix B) | 74 | 0 |
| AI adapters (Appendix C) | 10 | 0 |
| Clearance items (Appendix D) | 31 | 0 |
| Prerendered pages | ~680 | 0 |

---

## 2. Phase 0 — Foundation, toolchain, and IP clearance

**Goal:** a repo that builds, tests, lints, and *refuses to accept an unlicensed dependency* — before
any feature code exists. **Spec:** README §9, §23, §25.

### Setup

#### P0-01 · Monorepo scaffold
- [x] pnpm workspace (`pnpm-workspace.yaml`), Node 22 pinned in `.nvmrc` + `engines`
- [x] `turbo.json` with `build`, `test`, `lint`, `typecheck` task graph
- [x] `tsconfig.base.json`, strict mode, `noUncheckedIndexedAccess`
- [x] Packages created empty: `engine`, `ui`, `cli`, `extension`; apps: `web`, `relay`
- [x] `.editorconfig`, `.gitattributes`, `.gitignore`
- **Spec:** README §9 · **Done when:** `pnpm install && pnpm build` exits 0 on a clean clone

#### P0-02 · Lint, format, commit hygiene
- [x] ESLint 9 flat config + `eslint-plugin-svelte`
- [x] Prettier + svelte + tailwind plugins
- [x] Commitlint (Conventional Commits) + husky/lefthook pre-commit
- [x] **Custom rule:** no `eval`, `new Function`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `{@html}`
- [x] **Custom rule:** no `window`/`document`/`navigator` in `packages/engine` outside a guarded probe
- [x] **Custom rule:** no direct `fetch` in `packages/engine` outside `ai/transport.ts`
- **Spec:** README §16.6, §9 · **Done when:** each rule has a fixture that fails lint

#### P0-03 · CI skeleton
- [x] `.github/workflows/ci.yml`: install (cached, frozen lockfile) → lint · typecheck · test → build
- [~] Branch protection: all checks required to merge — workflow is ready and green; enforcement **deferred to P7-15** because repository settings access is unavailable. Solo-developer risk only: CI still runs and still reports on every push
- **Spec:** README §23.6 · **Done when:** a PR shows all checks and cannot merge while red

### IP clearance — before feature code

#### P0-04 · Licence gate (`verify:licenses`)
- [x] Resolve full dependency graph from lockfile incl. transitive + optional, at **pinned** versions
- [x] Allowlist: MIT, Apache-2.0, BSD-2, BSD-3, ISC, Zlib, IJG, IJG-short, 0BSD, MPL-2.0, Unlicense, CC0
- [x] **Deny** on: GPL/LGPL/AGPL/SSPL/BUSL/CC-BY-NC/CC-BY-SA/research-only/non-commercial/unknown/missing
- [x] Dual licences pass if **any** option is allowlisted; `SEE LICENSE IN …` fails
- [x] Generate `docs/THIRD-PARTY-LICENSES.md`; fail if it differs from the committed copy
- **Spec:** README §25.2, §25.6 · **Done when:** adding `gifsicle` to a branch fails CI with a named reason

#### P0-05 · Static-asset register + gate
- [x] Walk `apps/web/static/**`; every asset needs a register row: source URL, licence, licence URL, sha256, date checked
- [x] **Fail on unregistered asset**, not merely on a bad licence
- [x] Covers `.onnx`, `.task`, `tessdata`, fonts, LUTs, ICC profiles, emoji, images
- **Spec:** README §25.5, §25.3.4 · **Done when:** dropping an unregistered `.onnx` into `static/` fails CI

#### P0-06 · Trademark grep gate
- [x] Fail the build on denied strings in source: Instagram filter names (Clarendon, Gingham, Juno, Lo-Fi, 1977, X-Pro II, Valencia, Nashville, Toaster, Walden, Amaro, Mayfair, Rise, Hudson, Willow, Inkwell, Ludwig, Aden, Perpetua, Crema, Slumber, Reyes, Lark, Moon), `Polaroid`, `Impact` (as a font family), `Magic Eraser`, `Magic Edit`, `Magic Expand`, `Magic Wand`, `Content-Aware`
- **Spec:** README §25.3.3, §25.6 · **Done when:** adding `Clarendon` to a preset file fails CI

#### P0-07 · Clearance ADR seeded
- [x] `docs/ADR/ip-clearance.md` created, seeded from README §25.3 with every item resolved or explicitly excluded pending verification
- [x] Rule recorded: an item with no decision is treated as **excluded**
- [~] Send the four ⚠ items to counsel: GrabCut, Poisson blending, closed-form matting, NLM — recipient set to Festus Ogun / FOLEGAL; packet finalised at `docs/legal/counsel-questions.md` with cover email at `docs/legal/cover-email-draft.md`; awaiting send by the client
- [~] Send the social-platform preset-name question (§25.3.3) — packet §3.5; same recipient, awaiting send
- [ ] Record each response in the packet §6 table and mirror into `docs/ADR/ip-clearance.md`; a row with no recorded decision stays **excluded** and its fallback stays mandatory
- [x] Resolve the six open items in README §25.3.5 (DjVu, Twemoji, libarchive RAR path, and the above) — explicit fallbacks recorded for every item
- **Spec:** README §25.3, §25.3.5 · **Done when:** every §25.3 row has a decision or an explicit "awaiting counsel, fallback shipping"

#### P0-08 · Verify the positive register
- [x] Split README §25.3.4 into a **shipping register** (installed, licence read from the installed package) and a **candidate register** (not installed, licence unverifiable, not enforced, does not gate any phase)
- [x] Confirm the **actual** licence at the pinned version for every dependency in the shipping register — all 22 direct dependencies across the 219-package graph verified 2026-08-09
- [x] Enforce the split in `scripts/verify-licenses.ts`: any direct dependency absent from the shipping register fails the build, with a distinct message when it is merely misfiled as a candidate
- [x] Model/data assets recorded as candidates; enforcement carried by `verify:assets`, which fails on **any** asset in `static/` lacking a register row (source URL, licence, licence URL, sha256, date) — an unverified asset cannot ship regardless of this table
- [ ] Move each candidate row into the shipping register at the phase that installs it (recurring; not a Phase 0 obligation)
- **Spec:** README §25.3.4 · **Done when:** every direct dependency appears in the shipping register with a verified date, and adding one that does not fails CI

### Engine foundations

#### P0-09 · Core types and error model
- [x] `RasterImage`, `Frame`, `FormatId`, `ColorSpaceId` (README §10.1)
- [x] `EngineError` union, **every variant carrying `remedy`** (README §8.7)
- [x] `Recipe`, `Step`, `ExportOptions` types (README §8.2)
- [x] Type test asserting no `EngineError` variant lacks `remedy`
- **Spec:** README §8.2, §8.7, §10.1 · **Done when:** adding a variant without `remedy` fails typecheck

#### P0-10 · Worker pool + scheduler
- [x] Module workers, `N = clamp(hardwareConcurrency − 1, 1, 16)`, lazily created
- [x] Transferables for all buffers; ownership transferred, never retained
- [x] `AbortSignal` throughout; cancellation observed within 50 ms
- [x] Affinity scheduling (reuse a worker that already instantiated a given module)
- [x] `pool.pressure` 0..1 exposed for UI backpressure
- **Spec:** README §8.4, §10.6 · **Done when:** a test cancels a 5 s job and asserts abort < 50 ms and buffers freed

#### P0-11 · Capability probing
- [x] `probeCapabilities()` returning `FormatCapability[]`
- [x] Detect WASM SIMD, threads/`crossOriginIsolated`, WebGPU, WebGL2, OffscreenCanvas, FSA, OPFS, WebCodecs
- [x] **Probe, never UA-sniff**
- [x] Browser-matrix acceptance verified on the runnable `/debug/capabilities` route in Chromium, Firefox, and WebKit
- **Spec:** README §5.7, §7.2 · **Done when:** probe results render on a debug route and are correct in all 3 browsers

#### P0-12 · WASM asset pipeline
- [x] `scripts/fetch-wasm.ts`: download from pinned URLs, verify sha256 against `wasm-lock.json`
- [x] Emit to `apps/web/static/wasm/<name>.<hash>.wasm`
- [x] Build fails on hash mismatch; runtime re-verifies where SRI is unavailable
- **Spec:** README §23.5 · **Done when:** flipping one byte in a wasm file fails the build

#### P0-13-R1 · IJG allowlist amendment
- [x] Add IJG and IJG-short to README §25.2 and the enforced allowlist; record portion-based MozJPEG licensing in §25.3.4
- [x] Ship the mandatory “Independent JPEG Group” product attribution in `docs/THIRD-PARTY-LICENSES.md` and rendered `/licenses`
- [x] Fail the build if either attribution disappears; inspect bundled `LICENSE*` files in every installed package that ships WASM
- **Spec:** README §25.2, §25.3.4 · **Done when:** removing the attribution from the register or rendered page fails the build

#### P0-13 · First three codecs
- [x] JPEG (MozJPEG), PNG (+oxipng), WebP via pinned `@jsquash/*`, running **in a worker**
- [x] Decode → `RasterImage` → encode round-trip
- **Spec:** README §7.3 · **Done when:** Vitest decodes a JPEG in a worker and re-encodes as WebP, byte-stable

#### P0-14 · Design tokens + first UI primitives
- [x] `packages/ui/src/tokens.css` exactly as README §12.2, light + dark
- [x] Tailwind 4 `@theme` consuming the tokens
- [x] Button, Slider, FileDrop with tests
- [x] Zero-flash theme script; `prefers-reduced-motion` zeroes durations
- **Spec:** README §12 · **Done when:** a visual test passes in both themes with no flash on load

#### P0-15 · The two load-bearing test harnesses
- [x] `no-network` Playwright harness (README §22.6) — scaffold, passing on a trivial flow
- [x] `credential-leak` test harness (README §16.6) — asserts no credential value can reach a log, error, or diagnostic bundle
- [~] Both exist as named CI jobs and pass; **required-check status deferred to P7-15** with P0-03
- **Spec:** README §22.6, §22.7 · **Done when:** both are required checks and pass

#### P0-16 · Plan-sync gate
- [x] `scripts/check-plan-sync.ts`: fail CI when a commit/PR touches `README.md` without touching `PLAN.md`
- [x] Escape hatch: `[plan-exempt]` in the commit body, which the script logs into the PR comment
- **Spec:** this file §0.3 · **Done when:** a README-only PR fails, and the same PR passes once PLAN.md is updated

### 🚦 Gate 0 — do not start Phase 1 until all are true

- [x] `pnpm build && pnpm test && pnpm lint && pnpm typecheck` all green
- [x] `verify:licenses` runs on every CI run and **no copyleft dependency exists in the lockfile** (verified, not assumed) — *required*-check status deferred with the waiver below
- [x] Static-asset gate and trademark gate run on every CI run — same deferral
- [x] `docs/ADR/ip-clearance.md` has a decision or an explicit fallback for every §25.3 item
- [x] Every row in the README §25.3.4 **shipping register** says "verified"; candidates are explicitly marked unverified, are not installed, and are gate-blocked from installation by `verify:licenses`
- [x] A worker decodes a JPEG and re-encodes it as WebP byte-stably in a Vitest test
- [~] `no-network`, `credential-leak`, and `plan-sync` exist as named CI jobs and pass on every run. **Enforcement waived for Phase 1** — making them *required* needs repository settings access that is unavailable, and the harnesses' substance is satisfied. Re-entry trigger: **P7-15**, mandatory before the first external contributor or public launch

---

## 3. Phase 1 — The core loop

**Goal:** three tools working end to end on their own prerendered pages, proving the pipeline, the
preview architecture, and the page-delivery model before breadth is added.
**Spec:** README §7.6, §8, §10, §11, §26 Phase 1.

#### P1-01 · Pipeline: compile → execute
- [x] `compile(recipe, inputMeta) → Plan` — tier selection, lazy-load costing, peak-memory projection
- [x] `run(recipe, inputs, opts)` with progress, cancellation, per-item results
- [x] `preview(recipe, proxy, opts)`
- **Spec:** README §8.3, §10.3 · **Done when:** a 3-step recipe runs in a worker with typed progress events

#### P1-02 · Step fusion
- [x] Adjacent pixel-local ops fuse into one pass
- [x] Property test: fused output is byte-identical to unfused
- **Spec:** README §8.2 rule 3, §22.4 · **Done when:** the property test passes over 1000 generated recipes

#### P1-03 · Memory governor
- [x] Peak-byte projection; budget from device memory hints
- [x] Degrade in order: reduce concurrency → tile (512×512 + halo) → OPFS spill → **refuse with a specific message naming the largest workable dimension**
- [x] **Never silently downsample** (P9)
- **Spec:** README §8.6, §19.4 · **Done when:** a 24 MP op stays under 400 MB peak, and a 200 MP input refuses with a useful message

#### P1-04 · Tiled execution
- [x] Tiling for kernel ops with halo sized to the largest kernel radius
- [x] Property test: tiled output equals whole-image output
- **Spec:** README §8.6, §22.4 · **Done when:** the property test passes for every kernel op

#### P1-05 · Proxy / preview split
- [x] Proxy generation (longest edge ≤ 2048, ≤ 1024 on low-memory), cached per input
- [x] Live preview path; committed preview debounced 120 ms; export at full resolution
- [x] Property test: full result downscaled to proxy size has SSIM ≥ 0.99 vs the proxy preview
- **Spec:** README §8.5, §22.4 · **Done when:** the fidelity property test passes — **the preview must not lie**

#### P1-06 · Resize op (all five modes)
- [x] `pixels`, `percent`, `reduceBy`, `targetBytes`, `fit` (6 fit modes)
- [x] 9 algorithms; `sharpenAfterResize`, `allowUpscale`, `roundTo`, `maxPixels`
- [x] Property test: resize to own dimensions is byte-identical no-op
- **Spec:** README §6.2 · **Done when:** every mode + fit mode has a test and the identity property holds

#### P1-07 · Crop, rotate, flip ops
- [x] Crop by rect **and** by edge offsets (the online-convert control); aspect presets; `autoTrim`
- [x] Rotate arbitrary + snap90 + `expandCanvas` + `applyExifOrientation`; flip H/V
- [x] Property tests: 4×90° = identity; double flip = identity; crop composition
- **Spec:** README §6.3, §6.4 · **Done when:** all three property tests pass

#### P1-08 · Export options surface
- [x] Every option in README §6.1 implemented and schema-validated
- [x] **All defaults are no-ops** — property test on a lossless format asserts byte-identical output
- [x] `filenameTemplate` tokens
- **Spec:** README §6.1, P9 · **Done when:** the all-defaults no-op property test passes

#### P1-09 · Target-size search
- [x] Binary search on quality, ≤ 8 iterations, ±2 % tolerance
- [x] Optional dimension scaling (≤ 3 outer iterations)
- [x] **On failure, return closest + a warning stating actual size and why the target was impossible**
- [x] Live per-iteration progress in the UI ("trying quality 64 → 210 KB…")
- **Spec:** README §10.5 · **Done when:** hits a 200 KB target within tolerance on 20 fixtures; impossible targets report honestly

#### P1-10 · Recipe serialization + migration
- [x] `serializeRecipe` / `parseRecipe` — URL-fragment, deflate, base64url, `r1.` version prefix
- [x] `migrateRecipe`; assets referenced by hash, **never inlined** (sharing a recipe must never share an image)
- [x] Property test: round-trip deep-equals for arbitrary valid recipes
- **Spec:** README §18.2, §22.4 · **Done when:** round-trip property passes and an >8 kB recipe offers a file download instead

#### P1-11 · Page delivery architecture
- [x] `adapter-static`, `prerender = true` on all indexable routes
- [x] Route-level code splitting; engine core as a shared long-cached chunk
- [x] Per-route `size-limit` entries **per archetype**, not averaged
- [x] Tool page useful before JS: H1, description, FAQ, links are static HTML
- [x] Real `<input type="file">` in served HTML; drag/paste layered on at hydration
- [x] Reference-page archetype ships **zero JS**
- **Spec:** README §7.6 (all ten rules) · **Done when:** a JS-disabled browser can read the page and pick a file; each archetype has its own budget check

#### P1-12 · Canvas + compare component
- [x] Split slider (real `role=slider`, `aria-valuetext`), side-by-side, onion skin, difference w/ gain, output-only
- [x] Checkerboard for transparency (never white); 1 px bounds outline
- [x] Pan, zoom, `0` = fit, `1` = 100 %, nearest-neighbour + pixel grid at high zoom
- [x] **No layout animation on option change** — pixel content only
- **Spec:** README §11.6, §12.4 · **Done when:** dragging the quality slider produces no layout shift (CLS 0)

#### P1-13 · Generated option controls
- [x] Generator implementing every rule in README §11.7
- [x] `advanced` options behind a collapsed disclosure
- [x] Reset-to-default affordance when value ≠ default; `data-testid` from schema path
- **Spec:** README §10.2, §11.7 · **Done when:** all Phase-1 options render with zero hand-written controls

#### P1-14 · Live predicted output size
- [x] Proxy-encode + extrapolate within 250 ms of any change; corrected by a background full encode
- [x] Displayed as `1.2 MB → 310 KB (−74%)`
- **Spec:** README §11.5, §19.2 · **Done when:** measured update latency ≤ 250 ms on a 12 MP input

#### P1-15 · First three tools shipped
- [x] **T01** Image Converter `/convert` — STCC
- [x] **T20** Image Compressor `/compress` — STCC, incl. the quality-slider visual-diff view
- [x] **T24** Image Resizer `/resize` — STCC
- **Spec:** README §4 · **Done when:** all three pass STCC and Appendix A rows are checked

### 🚦 Gate 1

- [x] A user converts, compresses, and resizes with live preview and predicted size — no page navigation
- [x] `no-network` test passes on a **real** conversion flow (README §22.6)
- [x] Lighthouse mobile ≥ 95 on all three routes
- [x] Golden files established for all three tools
- [x] Preview-fidelity, fusion, tiling, and all-defaults-no-op property tests pass
- [x] Each route independently loadable on a cold cache with JS disabled (content readable, file input works)

---

## 4. Phase 2 — Format breadth and our own codecs

**Goal:** every format in README §5 either works or is honestly reported unavailable — with no copyleft
dependency anywhere. This phase is larger than a naive plan would suggest, because one LGPL
mega-dependency was replaced by a framework of our own (README §25.3.1).
**Spec:** README §5, §7.3, §25.4.

#### P2-01 · Codec registry + lazy loading
- [x] Registry with per-format decode/encode capability and lazy loaders
- [x] **Download cost disclosed before any lazy fetch**; consent step for anything > 5 MB
- **Spec:** README §5.7, §7.3 · **Done when:** the UI never offers an `unavailable` encode target, and always shows `lazyBytes` first

#### P2-02 · Simple-format codec framework (**ours**)
- [x] `codecs/simple/framework.ts`: `BitReader`, `BitWriter`, header-descriptor DSL, shared RLE
- [x] Fixture + adversarial test harness reused by every format built on it
- **Spec:** README §25.4 · **Done when:** two formats are implemented on it and share ≥ 60 % of their test scaffolding

#### P2-03 · Simple formats (**ours**) — 16 formats
- [x] BMP/DIB · TGA · PCX · PPM/PGM/PBM/PNM · PAM · WBMP · XBM/XPM · ICO · CUR · DDS (BCn) · QOI · SGI/RGB · Sun Raster · Radiance HDR · PFM · FITS · APNG muxer
- **Spec:** README §5.2, §25.4 · **Done when:** each has a fixture round-trip test and an adversarial test

#### P2-04 · Permissive third-party codecs
- [x] Clearance unblocked: `utif` 3.1.0 (MIT), `gifuct-js` 2.1.2 (MIT), `@jsquash/avif` 2.1.1, `@jsquash/jxl` 1.3.0 (both Apache-2.0 wrapper) pinned, licence-verified, graduated into the README §25.3.4 shipping register and recorded in the clearance ADR
- [x] TIFF (`utif`) decode/encode wired into the codec registry with fixture round-trip
- [x] GIF decode (`gifuct-js`) wired in with fixture round-trip
- [x] AVIF, JPEG XL via `@jsquash/*` wired in with fixture round-trip
- [x] OpenEXR and JPEG 2000 **moved to P2-04a** — no permissively-distributable package exists; not a clearance failure
- **Spec:** README §5.2, §25.3.4 · **Done when:** each of the four passes fixture round-trip and appears in `THIRD-PARTY-LICENSES.md`

#### P2-04a · OpenEXR + JPEG 2000 — vendored WASM builds
Neither format has a usable published package. `tinyexr` is a C++ single-header library with no npm
distribution; npm `openjpeg` 0.2.3 ships **no licence field** and is an unaffiliated fork. Both
upstreams are permissive (BSD-3, BSD-2), so the obstacle is a build we do not own yet, not licensing.
- [x] Decide: vendor + build WASM ourselves, or report both formats unsupported for v1 — **v1 unsupported chosen; see `docs/ADR/ip-clearance.md`**
- [x] If vendoring: pin upstream by commit sha, record the licence file, add to the WASM asset lock, and treat the build as a first-class CI artefact — **not applicable to the v1-unsupported decision**
- [x] Until then, both formats report unsupported with the specific reason (README §11.8), never a generic failure
- **Spec:** README §5.2, §25.3.4, §25.5 · **Done when:** either both decode from fixtures, or both are documented as v1-unsupported with a stated reason

#### P2-05 · GIF encoder + optimizer (**ours**)
- [x] LZW encode; quantizers (Wu, median-cut, octree, neuquant-equivalent); dithers
- [x] Frame differencing, transparency optimization, dispose-method selection
- [x] `optimizeLevel` 1–3 and `lossy` 0–200 equivalents — **our own implementation, not gifsicle**
- **Spec:** README §6.10, §25.4 · **Done when:** output size is within 10 % of the GPL reference on a 20-file corpus, with zero GPL code

#### P2-06 · RAW pipeline Stage 1 (**ours**)
- [x] Embedded full-size JPEG preview extraction via IFD walk, reusing the EXIF parser
- [x] Labelled **"camera preview"** in the UI — never passed off as a raw develop
- [ ] Covers every vendor in README §5.3
- **Spec:** README §5.3, §25.4 · **Done when:** preview extracts from ≥ 15 real camera files across ≥ 8 vendors

#### P2-07 · RAW pipeline Stage 2 (**ours**) — DNG first
- [x] Demosaic (bilinear, VNG, AHD), black/white levels, WB, colour matrix, tone curve
- [x] Full option surface from README §5.3
- [x] Formats without Stage 2 say so plainly rather than silently using Stage 1
- **Spec:** README §5.3 · **Done when:** DNG develops correctly vs a reference; unsupported formats report honestly

#### P2-08 · HEIC via platform decoder
- [x] `ImageDecoder` (WebCodecs) wrapper; capability-probed
- [x] **Encode permanently excluded** — UI states this as a decision, not a missing feature
- [x] Unsupported platforms get the specific message from README §11.8
- [ ] Record real-device decode evidence on macOS/iOS Safari and recent Windows Chrome
- **Spec:** README §5.2, §25.3.2 · **Done when:** decodes on macOS/iOS Safari + recent Windows Chrome; degrades with a named reason elsewhere

#### P2-09 · Vector and document formats
- [x] SVG rasterize (`@resvg/resvg-wasm`, **unmodified** — wrap, never patch, per MPL note)
- [x] Vectorize (`imagetracerjs`)
- [x] PDF read (`pdfjs-dist`), PDF write (`pdf-lib`), PSD (`ag-psd`)
- [x] EPS preview extractor + PS operator subset (**ours**); outside the subset → unsupported, never partially rendered
- [x] WMF/EMF parser (**ours**), best-effort with warnings; DXF (`dxf-parser`)
- [x] XCF composite reader (**ours**)
- **Spec:** README §5.4, §25.4 · **Done when:** each has a fixture test; CDR/DWG/DjVu/PICT/MNG/FLIF show their specific "not supported and why" page

#### P2-10 · Video → frames via WebCodecs
- [ ] `VideoDecoder` + `mp4box.js` / `jswebm` demux — **no bundled codec**
- [ ] Container/codec support capability-probed and reported honestly
- **Spec:** README §5.6, §25.3.1 · **Done when:** frame extraction works from MP4/WebM with zero added download

#### P2-11 · Embedded / LVGL exporter (T16)
- [ ] LVGL v9 (5 colour formats) + v8 (13 formats), C array + binary
- [ ] Generic raw, Adafruit GFX, ESP-IDF/TFT_eSPI targets
- [ ] `Output name` validation, `Alpha byte`, `Chroma keyed`, `Dithering`, `Big-endian`, `const`/`static`/`PROGMEM`, line width
- [ ] Live byte-size + flash-footprint readout, `LV_IMG_DECLARE` snippet
- **Spec:** README §5.5 · **Done when:** output compiles in a real LVGL v8 and v9 project

#### P2-12 · Metadata subsystem
- [x] Read: EXIF (all IFDs + MakerNotes), IPTC, XMP, ICC, JFIF, PNG text chunks, GIF comment, WebP/AVIF/HEIF boxes, C2PA
- [x] Write/strip presets + per-field editing (README §6.9)
- [x] GPS shown as decimal + DMS + `geo:` URI — **no map tiles** (P5)
- [ ] Property test: `stripMetadata: 'none'` preserves every readable tag through a re-encode
- **Spec:** README §6.9 · **Done when:** the preservation property test passes across all metadata-carrying formats

#### P2-13 · ICC profile synthesis (**ours**)
- [x] Generate v2/v4 matrix+TRC profiles from primaries/white point/TRC
- [x] sRGB, Display P3, "Adobe RGB compatible", Gray
- [x] User's embedded profile always preserved verbatim unless explicitly converted
- **Spec:** README §7.3, §25.3.3 · **Done when:** synthesized profiles validate and round-trip correctly; no vendor profile is redistributed

#### P2-14 · Adversarial corpus
- [x] Build the full corpus from README §22.2 (truncated, wrong magic, 1×1, 30000×1, 0-byte, 4 GB declared dims, decompression bomb, nested SVG, **SVG with an external reference — must be refused**, invalid EXIF offsets, 12 000 EXIF entries, mismatched extension)
- [x] `fixtures/PROVENANCE.md` for every file
- **Spec:** README §22.2 · **Done when:** **zero crashes, zero hangs** — every input yields a typed error with a useful `remedy`

#### P2-15 · Format tools shipped
- [ ] T02 HEIC · T03 RAW · T04 AVIF · T05 WebP · T06 JXL · T07 SVG rasterize · T08 Vectorize
- [ ] T09 PDF→Image · T10 Image→PDF · T11 Favicon · T14 GIF splitter · T16 Embedded · T17 Base64 · T19 CBZ
- [ ] Each — STCC
- **Spec:** README §4.1 · **Done when:** Appendix A rows checked

#### P2-16 · Metadata + inspector tools shipped
- [ ] T54 Metadata Viewer · T55 Metadata Remover · T59 Image Inspector — STCC
- **Spec:** README §4.6, §4.7 · **Done when:** Appendix A rows checked

#### P2-17 · Fixture + golden coverage
- [ ] Every row in README §5 has a fixture test **or** is honestly marked unavailable with a reason
- [ ] Golden files recorded for every encode path
- **Spec:** README §22.2, §22.5 · **Done when:** Appendix B is fully checked

#### P2-18 · Lossless optimizer (T23)
- [ ] `oxipng`, `mozjpeg -copy none`, our own GIF optimizer — pixel-identical output
- **Spec:** README §4.2 · **Done when:** output is byte-smaller and pixel-identical across a 50-file corpus

### 🚦 Gate 2

- [ ] Every §5 row: passing fixture test, or unavailable with a specific reason surfaced in the UI
- [x] Adversarial corpus: zero crashes, zero hangs, every error typed with a `remedy`
- [x] `verify:licenses` still green — **no copyleft dependency was introduced during this phase**
- [ ] Appendix B fully checked

---

## 5. Phase 3 — Editing, batch, and recipes

**Goal:** the full editing surface and the sharing loop that drives growth.
**Spec:** README §6.5–6.8, §4.4, §4.5, §4.9.

#### P3-01 · GPU pipeline (WebGPU → WebGL2 → WASM)
- [ ] Three tiers, probed; identical results within tolerance
- [ ] **Export always uses the CPU/WASM tier** unless explicitly opted in (determinism, README §10.4)
- **Spec:** README §7.2, §10.4 · **Done when:** live adjustment ≤ 16 ms/frame on GPU, ≤ 50 ms on WASM

#### P3-02 · Adjustments (T37)
- [ ] All 16 scalar adjustments + curves (RGB + per-channel) + levels + histogram
- **Spec:** README §6.7 · **Done when:** all render live within budget; defaults are no-ops

#### P3-03 · Filter primitives + 24 presets (T38)
- [ ] Primitives: grayscale (6 methods), monochrome (5 dithers), negate, retro, sepia, duotone, gradient map, posterize, solarize, vignette, grain, LUT (`.cube`/`.3dl`)
- [ ] 24 presets **with our own names** (README §6.5), each declarative in `filters/presets.ts`
- [ ] No preset reproduces a specific commercial LUT
- **Spec:** README §6.5, §25.3.3 · **Done when:** trademark gate passes and every preset is a readable primitive stack

#### P3-04 · Enhancement toggles (T42–T44)
- [ ] enhance, sharpen, antialias, despeckle, equalize (CLAHE), normalize, deskew, `noMultilayer`, B/W threshold (incl. Otsu + Sauvola), denoise (median/bilateral/wavelet), blur (6 types)
- [ ] **NLM deferred** pending clearance (README §25.3.2)
- **Spec:** README §6.6 · **Done when:** each has a test; deskew reports its detected angle before applying

#### P3-05 · Colour tools
- [ ] T39 Curves · T40 Colour Space · T41 Threshold · T45 Colour Picker + palette (k-means/median-cut, CSS/JSON/ASE/GPL export) · T46 Recolour · T47 Duotone
- **Spec:** README §4.4 · **Done when:** STCC for each

#### P3-06 · Transform tools
- [ ] T25 Bulk Resize (all preset packs, README §6.2) · T26 Crop · T28 Rotate · T29 Flip · T30 Canvas Resize · T31 Enlarge · T33 Border · T34 Round Corners · T35 Collage · T36 Split/Tile
- **Spec:** README §4.3 · **Done when:** STCC for each

#### P3-07 · Layered editor (T48)
- [ ] Layer model, blend modes, per-layer alpha, ordering, groups
- [ ] Every other tool reachable from inside it
- [ ] **Host only** — issues no request of its own
- **Spec:** README §4.5 · **Done when:** STCC, and a test asserts zero network requests from the editor shell

#### P3-08 · Text and typography (T49)
- [ ] Self-hosted font set + user upload + Local Font Access API
- [ ] Stroke, shadow, curve, arc; **no `local()` lookups that could embed a licensed system font into an export**
- **Spec:** README §4.5, §25.3.4 · **Done when:** STCC, and an export never embeds a font we lack rights to

#### P3-09 · Watermark (T50)
- [ ] Full option surface (README §6.8) incl. tiled/diagonal modes, tokens, `scaleWithImage`
- **Spec:** README §6.8 · **Done when:** STCC; batch across mixed sizes keeps relative scale constant

#### P3-10 · Meme, draw, signature (T51–T53)
- [ ] T51 with **Anton** (OFL), **user-upload only, no bundled template gallery**
- [ ] T52 with Noto Emoji (OFL); our own or CC0 stickers
- [ ] T53 signature with local background removal → transparent PNG
- **Spec:** README §4.5, §25.3.3 · **Done when:** STCC; trademark/asset gates pass

#### P3-11 · Privacy tools (T56, T58)
- [ ] T56 Blur/Pixelate Region (rect, ellipse, freehand)
- [ ] T58 Redact — **irreversible: pixels replaced, not overlaid**, with a verification pass
- **Spec:** README §4.6 · **Done when:** a test proves redacted pixels are unrecoverable from the output file

#### P3-12 · Batch runner (T72)
- [ ] Concurrency (auto + override), `onError`, output modes (zip/individual/FSA folder), `preserveFolderStructure`, dedupe, sort, `memoryCeiling`
- [ ] Per-file status, retry, partial download; `_errors.txt` in the ZIP
- [ ] Governor reduces concurrency rather than crashing
- **Spec:** README §6.11 · **Done when:** 50 × 4 MP JPEG→WebP in ≤ 45 s on 4 cores, and a 200-file batch never OOMs

#### P3-13 · Recipe builder + sharing (T73)
- [ ] Visual pipeline editor; save to IndexedDB; export JSON; share via URL fragment
- [ ] **Plain-language description rendered before anything runs**
- [ ] AI steps flagged so a shared recipe never surprises the recipient with a cost
- **Spec:** README §18.2, §11.4 Flow D · **Done when:** a shared link reproduces a 4-step recipe exactly, with no server round-trip

#### P3-14 · Undo/redo + command palette
- [ ] ⌘Z/⌘⇧Z across every recipe mutation, unbounded in session, visible history
- [ ] ⌘K over tools, options, formats, recipes; `webp 80` jumps to a configured export
- **Spec:** README §11.5 · **Done when:** every recipe mutation is undoable and the palette resolves all four query types

#### P3-15 · Web optimizer + codegen (T22, T75)
- [ ] Responsive set + `<picture>`/`srcset` markup + Core Web Vitals notes
- [ ] CSS sprite sheet + classes, Tailwind config, LVGL snippet
- **Spec:** README §4.2, §4.10 · **Done when:** STCC; generated markup validates and renders correctly

### 🚦 Gate 3

- [ ] A 50-file batch with a 4-step recipe completes within budget
- [ ] A shared recipe URL round-trips exactly and shares no image data
- [ ] Undo/redo covers every recipe mutation
- [ ] Trademark, asset, and licence gates all green
- [ ] All Phase-3 tools pass STCC

---

## 6. Phase 4 — Local intelligence (Tier 1 and Tier 2)

**The most important phase in the plan, and the longest.** Everything competitors gate behind AI is
built here, classically, **before any adapter is written**. Doing this properly is what keeps the AI
Justification Register short.
**Spec:** README §13.1, §25.4, §26 Phase 4, §28.6.

> ⚠ **Build every ⚠-flagged item's fallback first, even where you expect clearance.** That ordering
> means a bad answer from counsel costs nothing. See README §28.6 "How to read the flags".

### Tier 1 — CV primitives (**ours**)

#### P4-01 · CV primitive library
- [ ] `cv/`: flood fill (tolerance in Lab), colour range, chroma key, Otsu, Sauvola, Canny, Sobel, Scharr, Hough, morphology, connected components, integral images
- **Spec:** README §7.3, §28.6 · **Done when:** each has a unit test against a known reference output

#### P4-02 · Saliency
- [ ] Spectral residual (Hou & Zhang 2007); fine-grained saliency (Montabone & Soto 2010)
- **Spec:** README §28.6 · **Done when:** saliency maps validated against a labelled corpus

#### P4-03 · Colour transfer + histogram matching
- [ ] Reinhard mean/σ transfer in Lαβ; histogram matching; per-channel alignment
- **Spec:** README §28.6, §25.4 · **Done when:** T80 Colour Match produces natural composites on a test set

#### P4-04 · Edge-directed interpolation
- [ ] DCCI and NEDI for photographic upscale — **instant, deterministic, no model**
- **Spec:** README §28.6 · **Done when:** measurably sharper than Lanczos on an edge corpus, within latency budget

#### P4-05 · Pixel-art scaler (**ours**)
- [ ] Our own 3×3-neighbourhood rule tables for ×2/×3/×4, our own edge-continuation and corner rules
- [ ] Tuned against a sprite corpus; nearest-neighbour integer scaling with grid preview
- [ ] **Zero code derived from xBRZ / HQx / Scale2x** (GPL/LGPL — README §25.3.1)
- **Spec:** README §25.4, §28.6 · **Done when:** visually competitive on a sprite corpus, and provenance is documented as clean-room

#### P4-06 · Saliency-weighted retargeting (**ours**)
- [ ] Non-uniform row/column scaling from a smoothed saliency profile; protect/remove masks
- [ ] **Not seam carving** — continuous warping, a different mechanism (patent-excluded, README §25.3.2)
- [ ] Falls back to standard resize with an explanation when saliency is too uniform
- **Spec:** README §25.4 · **Done when:** T81 changes aspect without visible subject distortion on a test set

#### P4-07 · Alpha matting
- [ ] Trimap brush (fg/bg/unknown)
- [ ] **Ship the cleared fallback first:** KNN matting or our own band-limited colour-unmixing solve
- [ ] Closed-form matting **only if cleared** (README §25.3.2)
- **Spec:** README §28.6 · **Done when:** production-quality mattes on a hair/fur corpus, with zero dependency on an uncleared algorithm

#### P4-08 · Edge-aware matte refinement (**ours**)
- [ ] Joint (cross) bilateral filter + our own alpha-band trimming + defringe
- [ ] **Guided filter excluded** (patent, README §25.3.2) — no code path may use it
- **Spec:** README §25.4, §28.6 · **Done when:** edge quality measured against a reference, with guided filter absent from the build

#### P4-09 · Segmentation (Tier 1)
- [ ] Watershed; **GrabCut only if cleared**, else colour-range + watershed + our own iterative colour-model refinement
- [ ] Quality difference stated in the UI if the fallback is in use
- **Spec:** README §28.6 · **Done when:** rectangle-hint selection works, whichever path shipped, and the UI is honest about which

#### P4-10 · Exemplar inpainting (**ours**)
- [ ] Efros–Leung sampling + image quilting + **our own** confidence-ordered fill priority
- [ ] Telea fast-marching and Navier–Stokes for thin defects (OpenCV `photo`)
- [ ] **No PatchMatch, no Criminisi implementation** — prior-art foundation by design (README §25.3.2)
- [ ] Per-algorithm preview so the user picks the best result
- **Spec:** README §25.4, §28.6 · **Done when:** removes blemishes, wires, and logos convincingly on a 30-image corpus

#### P4-11 · Compositing
- [ ] **Laplacian pyramid blending first** (unambiguously clear); Poisson only if cleared
- [ ] Blend modes, per-layer alpha, hard-edge re-composite for exact mask boundaries
- [ ] Shadow synthesis from the alpha matte
- **Spec:** README §28.6, §25.4 · **Done when:** T78 produces seamless composites with the cleared path only

#### P4-12 · Procedural synthesis (**ours**)
- [ ] QR (ISO/IEC 18004) + barcodes; **OpenSimplex2** (not Perlin simplex), Worley, value noise, fBm, domain warping
- [ ] Gradients (linear/radial/conic/mesh), patterns, identicons, initials avatars, placeholder frames, CSV charts
- [ ] **Generic device frames only** — no branded trade dress (README §25.3.3)
- **Spec:** README §25.4 · **Done when:** T79 ships; generated QR codes scan on 3 devices

#### P4-13 · Analysis primitives
- [ ] pHash/dHash/aHash + Hamming clustering; SSIM/MS-SSIM; PSNR; butteraugli
- [ ] Plain-language verdict derived from butteraugli thresholds
- **Spec:** README §11.6, §28.6 · **Done when:** T60 Compare shows metrics + verdict; T61 finds known duplicates

### Tier 2 — on-device models (each justified against Tier 1)

#### P4-14 · ONNX runtime integration
- [ ] `onnxruntime-web` with WebGPU → WASM fallback; tiled inference; progress; cancellation
- [ ] Model download consented, size-disclosed, cached, **and every Tier 2 path has a working Tier 1 path without it**
- **Spec:** README §7.2, §13.1.2 · **Done when:** a model downloads once, caches, and runs offline thereafter

#### P4-15 · Segmentation model
- [ ] U²-Net / ISNet / BiRefNet weights — **licence verified on the weights** (README §25.3.4)
- [ ] **Never RMBG-1.4** (non-commercial)
- **Spec:** README §25.5 · **Done when:** one-click background removal works offline; asset register row exists

#### P4-16 · Upscale model
- [ ] Real-ESRGAN-class ×2/×4, weights licence-verified (avoid non-commercial fine-tunes)
- [ ] Justified against DCCI/NEDI by measured quality
- **Spec:** README §25.5, §13.1.3 · **Done when:** measured comparison recorded in `bench/escalation/`

#### P4-17 · Face and plate detection
- [ ] MediaPipe (`.task` licence verified separately) + Viola–Jones Tier 1 fallback
- [ ] Review-before-apply; batch
- **Spec:** README §4.6 · **Done when:** T57 detects and blurs faces on a test set, with a review step

#### P4-18 · OCR
- [ ] `tesseract.js`, per-language lazy `tessdata` (**each language's licence verified**)
- **Spec:** README §25.3.4 · **Done when:** T62 extracts text in ≥ 5 languages offline

### Tools shipped in Phase 4

#### P4-19 · Cutout and fill tools
- [ ] T66 Remove Object · T67 Expand Image · T68 Remove Background · T69 Replace Background · T77 Cutout Refine · T78 Seamless Composite — STCC
- [ ] **Each fully functional with no key and no network**
- **Spec:** README §4.8 · **Done when:** Appendix A rows checked and the no-network test covers all six

#### P4-20 · Remaining local tools
- [ ] T27 Smart Crop · T32 Upscale (Tier 1+2) · T70 Pixel-Art Upscale · T79 Procedural Generator · T80 Colour Match · T81 Adaptive Resize · T57 Blur Faces · T60 Compare · T61 Duplicates · T62 OCR · T63 Accessibility Check — STCC
- **Spec:** README §4 · **Done when:** Appendix A rows checked

#### P4-21 · Escalation benchmark corpus
- [ ] `packages/engine/bench/escalation/` with side-by-side local-vs-reference outputs per capability
- [ ] **A written statement per capability of exactly where the local path falls short**
- **Spec:** README §26 Phase 4 exit · **Done when:** every capability in the register has a measured entry

#### P4-22 · Register reconciliation
- [ ] Fill in README §13.1.3 **from measured results, not assumptions**
- [ ] **Delete the Tier 3 row for any capability whose Tier 1/2 path turned out good enough**
- [ ] Log every deletion in §14 — this is a success, not a deviation
- **Spec:** README §13.1.3 · **Done when:** every remaining register row cites a failing fixture in `bench/escalation/`

### 🚦 Gate 4 — Phase 5 does not start until all are true

- [ ] T66, T67, T68, T69, T77–T81 produce acceptable results **with no key and no network**
- [ ] `bench/escalation/` exists with a written shortfall statement per capability
- [ ] Every Tier 2 model download is consented, size-disclosed, cached, weights-licence-verified, and has a working Tier 1 path without it
- [ ] Patent/licence review of the Tier 1 set complete and recorded in `docs/ADR/ip-clearance.md`
- [ ] README §13.1.3 filled in from measurements; unjustified Tier 3 rows deleted
- [ ] Guided filter, seam carving, PatchMatch, dark channel prior: **absent from the build** (grep-verified)

---

## 7. Phase 5 — BYOK AI escalation

**Gated on Gate 4.** Build only the Tier 3 paths that survived the register.
**Spec:** README §13, §14, §15, §16, §17.

#### P5-01 · AI types and registry
- [ ] `ProviderDescriptor`, `CredentialField`, `ModelDescriptor`, `AiRequest`, `AiResult`, `ProviderAdapter`, `AdapterContext`
- [ ] Capability-based registry — adding a provider lights up existing tools with no UI change
- **Spec:** README §13.3 · **Done when:** a stub adapter declaring `upscale` makes T32's escalation appear with no UI edit

#### P5-02 · Transport
- [ ] Origin allowlist enforced **locally before the request is issued**
- [ ] Timeouts; retry only on 408/429/5xx honouring `Retry-After`, max 3, never after a possibly-billed response
- [ ] Async job polling helper with backoff, progress, and provider-side cancel
- [ ] **CORS pre-flight probe** classifying ok / auth-failed / cors-blocked / unreachable / provider-error
- [ ] Credential redaction — injected last, never logged, never in an error, never in `raw`
- **Spec:** README §13.5, §15.2 · **Done when:** a CORS failure produces `ai-cors-blocked` with its specific remedy, never a generic network error

#### P5-03 · Keystore
- [ ] Four storage modes (README §16.2), **session-only default**
- [ ] AES-GCM-256, PBKDF2-SHA-256 600k iterations (or Argon2id if the bundle allows — record an ADR)
- [ ] Non-extractable `CryptoKey`; zeroed on lock, idle timeout (default 30 min), and explicit lock
- **Spec:** README §16.3 · **Done when:** the credential-leak test passes and a wrong passphrase reports cleanly with no lockout

#### P5-04 · CSP and headers
- [ ] Base CSP from README §16.4; COOP/COEP with `crossOriginIsolated` feature detection
- [ ] Provider origins handled per the §16.4 decision — **never fall back to `connect-src *`**
- [ ] All headers from README §16.5
- **Spec:** README §16.4, §16.5, §23.4 · **Done when:** CSP evaluator passes; single-threaded WASM fallback also passes the full fixture suite

#### P5-05 · Cost ledger and spend guard
- [ ] Local IndexedDB ledger; per-provider totals; CSV export; never transmitted
- [ ] Pre-request estimate from a versioned local price table with a "last updated" date, always labelled an estimate
- [ ] Soft + hard session/day thresholds; batch confirmation above a configurable threshold (default $1.00)
- **Spec:** README §13.6 · **Done when:** a 200-file AI batch cannot be started with one accidental click

#### P5-06 · Escalation UI
- [ ] `EscalationControl` — states provider, capability, and estimated cost **before** it is pressed; never a primary button; never focused by default
- [ ] `TierBadge` on every result and every recipe step
- [ ] AI result rendered **as a diff against the local result**, with cost incurred
- [ ] `AlgorithmPicker` for T66/T67 Tier 1 choices
- **Spec:** README §12.3, §13.2, §11.4 Flow C · **Done when:** the P12 test (P5-16) passes

#### P5-07 · Mask convention
- [ ] Canonical internal form: 8-bit grayscale, **white = area to change**
- [ ] Per-adapter conversion, unit-tested against a recorded request
- **Spec:** README §13.4, §22.4 · **Done when:** every adapter's polarity test passes

#### P5-08 · Adapter — Anthropic (`describe`)
- [ ] Per README §14.1 incl. `anthropic-dangerous-direct-browser-access`, image-block-first ordering, no-newline base64, downscale to ~1.15 MP with the reduction shown in the UI
- [ ] Per-mode system prompts; structured output for tags; **`stop_reason` checked before reading `content`**
- **Spec:** README §14.1 · **Done when:** contract test passes and a refusal renders as a refusal, not a crash

#### P5-09 · Adapter — OpenAI
- [ ] `generate`, `edit`/`inpaint` (multipart, mask polarity inverted, nearest-neighbour resample), `describe`
- [ ] Aspect snapped to a supported size **and said so**; `background: transparent` wired to `output_format` together
- [ ] **Local feathered re-composite** offered so users can get a hard mask boundary
- **Spec:** README §14.2 · **Done when:** contract test passes; the masking caveat is shown once near the brush

#### P5-10 · Adapter — Google Gemini
- [ ] `generate`, `edit`, `describe`; `previous_interaction_id` exposed as "Continue editing this result"
- [ ] **SynthID watermarking stated in the UI before generation**
- [ ] No mask parameter → label the path "prompt-guided (mask applied locally)"
- **Spec:** README §14.3 · **Done when:** contract test passes and multi-turn editing works

#### P5-11 · Adapters — Stability, BFL, fal.ai
- [ ] Stability: inpaint/erase/outpaint/upscale/remove-bg/replace-bg + search-and-replace as a distinct **Find & Replace Object** tool
- [ ] BFL: async polling, each `status` value mapped to a distinct message (moderation ≠ generic failure)
- [ ] fal.ai: `data:` URI inputs, per-model schema discovery, `sam2` wired to click-to-select
- **Spec:** README §14.4–14.6 · **Done when:** contract tests pass for all three

#### P5-12 · Adapters — Replicate, remove.bg, Clipdrop, OpenAI-compatible
- [ ] Replicate: `Prefer: wait`, cancel wired to `AbortSignal`
- [ ] remove.bg: `channels: 'alpha'` for full-resolution local compositing; preview vs full cost behaviour explained
- [ ] Clipdrop: mask polarity verified; credits header → ledger
- [ ] OpenAI-compatible: capabilities **probed not assumed**; runtime CSP extension; localhost mixed-content guidance written from observed behaviour
- **Spec:** README §14.7–14.10 · **Done when:** contract tests pass for all four

#### P5-13 · Relay
- [ ] `apps/relay` Cloudflare Worker per README §15.3, **under 200 lines and readable**
- [ ] Destination allowlist, origin allowlist, optional `RELAY_TOKEN`, stateless, no body/header logging
- [ ] Deno Deploy / Vercel Edge / Netlify templates
- [ ] `apps/relay/README.md`: one-click deploy, manual steps, verify, tear down, **and what the relay can and cannot see**
- **Spec:** README §15.3, §15.4 · **Done when:** a deployed relay makes a previously CORS-blocked provider work, and the UI shows which path the request took

#### P5-14 · `/connect-ai` pages
- [ ] Hub: hero, why-BYOK, chooser table (populated from `browserDirect`, updated nightly), your-providers, `#usage`, `#relay`, `#security`, `#faq` (all 14 questions)
- [ ] "Help me choose" — 3 questions, **one** recommendation plus two alternatives
- [ ] Per-provider walkthroughs, all four steps, with the specific failure messages from §17.3
- [ ] `/connect-ai/self-hosted` with **verified** per-OS CORS commands for Ollama/LM Studio/vLLM/LiteLLM
- [ ] `/connect-ai/relay`, `/connect-ai/cost` (with the worked example), `/connect-ai/privacy`
- [ ] Two distinct empty states (escalation vs AI-only) with the §17.7 copy rules
- **Spec:** README §17 · **Done when:** every page passes SPCC; every self-hosted command verified against the current release

#### P5-15 · AI-only tools
- [ ] T64 Generate · T65 Prompt Edit · T71 Describe — STCC
- [ ] T71's **local descriptive skeleton** works with no key
- **Spec:** README §4.9 · **Done when:** Appendix A rows checked

#### P5-16 · Escalation and leak tests
- [ ] `no-implicit-escalation` test (README §22.6a) — **with a working key configured**, zero provider calls across all six escalation tools
- [ ] Companion: one gesture → exactly one request, cost shown beforehand, result in the compare view
- [ ] `register-completeness` test — a Tier 3 path without a §13.1.3 row **fails CI**
- [ ] Tier-independence property test — every `Local ⇗AI` tool completes with `ai: undefined`
- **Spec:** README §22.4, §22.6a · **Done when:** all four are required CI checks and pass

#### P5-17 · Nightly contract job
- [ ] `provider-contract.yml`: live `test()`, `listModels()` diff, one minimal op per capability with a hard spend cap
- [ ] Updates `browserDirect`, regenerates `docs/PROVIDERS.md`, opens a PR on drift, files an issue on breakage
- **Spec:** README §22.7 · **Done when:** the job runs green and a deliberately stale model list opens a PR

### 🚦 Gate 5

- [ ] All five canonical flows pass, including Flow C and C′
- [ ] Recorded contract tests pass for every adapter; nightly live job runs and reports
- [ ] Credential-leak test proves no key reaches a log, error, or diagnostic bundle
- [ ] Every failure class in README §17.3 renders its specific message
- [ ] **P12 holds:** no AI request without an explicit user gesture
- [ ] **Removing every configured provider leaves 78 of 81 tools fully working** — tested

---

## 8. Phase 6 — Long tail, PWA, CLI, extension

**Spec:** README §4, §7.2, §18.3, §23.7.

#### P6-01 · Remaining tools to complete 81
- [ ] T12 GIF Maker · T13 Video→GIF · T15 Spritesheet · T18 HTML→Image · T21 Compress-to-Size · T74 Folder Watcher — STCC
- **Done when:** Appendix A is 81/81

#### P6-02 · File System Access integration
- [ ] Folder input, folder output, `showSaveFilePicker`, T74 watch loop
- [ ] Hidden where unsupported; ZIP fallback
- **Spec:** README §7.2 · **Done when:** T74 processes new files into an output folder on Chromium; degrades cleanly elsewhere

#### P6-03 · Clipboard and drag-out
- [ ] Paste image from anywhere (⌘V from any focus position); copy result as `ClipboardItem`
- [ ] Drag result thumbnail out to the OS as a real `File`
- **Spec:** README §11.5 · **Done when:** verified on macOS and Windows against Photoshop and Figma

#### P6-04 · PWA
- [ ] `manifest.webmanifest` with icons, shortcuts, `file_handlers`, `share_target`
- [ ] Hand-rolled service worker: SWR for shell, cache-first immutable for hashed assets
- [ ] **Cross-origin requests never cached, never intercepted — AI requests bypass the SW entirely**
- [ ] Update toast, never auto-reload mid-edit
- **Spec:** README §18.3 · **Done when:** installs on Windows/macOS/Android/iOS; OS "open with" works; offline test passes

#### P6-05 · Settings → Data screen
- [ ] Every store listed with measured size and a delete button; one "Delete everything and reset"
- [ ] "Clear downloaded modules" with sizes shown
- **Spec:** README §18.1 · **Done when:** every row in §18.1 is represented and deletable

#### P6-06 · Offline hardening
- [ ] Offline badge; AI tools grey out **with that reason**
- [ ] Playwright offline run of the full local suite
- **Spec:** README §22.6, P6 · **Done when:** all 72 `Local` tools work offline after a warm cache

#### P6-07 · Keyboard completeness
- [ ] Every action keyboard-reachable; crop/mask nudge (1 px, 10 px with Shift); numeric alternative for every direct-manipulation control
- **Spec:** README §20.1 · **Done when:** the keyboard-only Playwright spec covers all five canonical flows

#### P6-08 · Accessibility pass
- [ ] `axe` zero violations on every route
- [ ] Live regions, landmarks, skip links, `role=slider` on compare, transparency textual indicator
- [ ] Contrast asserted programmatically against the token file
- [ ] Manual SR passes: NVDA+Firefox, VoiceOver+Safari, TalkBack+Chrome → `docs/a11y/audit-{date}.md`
- **Spec:** README §20 · **Done when:** zero violations is a required check and the manual audit is recorded

#### P6-09 · Performance pass
- [ ] Every §19.1 loading budget met **per archetype**
- [ ] Every §19.2 operation latency budget measured and met
- [ ] Long-task observer fails E2E on any >50 ms main-thread block from our code
- **Spec:** README §19 · **Done when:** `size-limit`, Lighthouse CI, and the bench gate are all green and required

#### P6-10 · Benchmark harness
- [ ] `packages/engine/bench/` over the fixture corpus; `bench/history.json`; +10 % regression gate
- **Spec:** README §19.5 · **Done when:** a deliberate 15 % slowdown fails CI

#### P6-11 · CLI
- [ ] `packages/cli` — `run`, `convert`, `info`; consumes the **same recipe JSON** as the web app
- [ ] Byte-identical output to the browser for the same recipe + engine version
- **Spec:** README §23.7 · **Done when:** a browser-built recipe produces identical bytes via the CLI

#### P6-12 · npm release
- [ ] Changesets; publish `@complianttools/image-engine` (Apache-2.0) and `@complianttools/ctimg`
- [ ] `verify:licenses` proves the published engine has no copyleft in its tree
- **Spec:** README §25.2 · **Done when:** both install cleanly in a fresh Node project

#### P6-13 · Browser extension
- [ ] MV3: right-click an image → open in the tool; screenshot capture → tool
- **Spec:** README §9 · **Done when:** loads unpacked in Chrome and Firefox and opens the correct tool

#### P6-14 · Error and diagnostic UX
- [ ] Every error follows what-happened · why · what-to-do (README §11.8)
- [ ] Diagnostic bundle assembled by a single allowlist function; test proves no credential can appear
- **Spec:** README §11.8, §16.6 · **Done when:** an audit of every `EngineError` shows a useful `remedy`

#### P6-15 · Recipe migration corpus
- [ ] Keep a corpus of every shipped recipe version; migration property test
- **Spec:** README §22.4 · **Done when:** every historical version migrates without loss

#### P6-16 · Security review
- [ ] `docs/SECURITY.md` with the honest threat model **including unmitigated residual risks**
- [ ] `/.well-known/security.txt`
- [ ] `pnpm audit` clean on high/critical
- **Spec:** README §16.1, §25.4 · **Done when:** SECURITY.md states the extension and supply-chain risks plainly

### 🚦 Gate 6

- [ ] Appendix A is 81/81
- [ ] Offline test passes for all 72 `Local` tools
- [ ] `axe` zero violations across all routes
- [ ] All §19 budgets met, per archetype
- [ ] CLI produces byte-identical output to the browser

---

## 9. Phase 7 — Pages, i18n, launch

**Spec:** README §7.6, §21, §24, §25.

#### P7-01 · Page generation pipeline
- [ ] Generate the ~600 format-pair pages from the §5 matrix — **supported pairs only**
- [ ] Each is a **fully functional tool** with both formats preselected, not a doorway page
- [ ] **Thin-content guardrail:** a pair with nothing format-specific to say gets **no page**
- **Spec:** README §24.1 · **Done when:** every generated page has format-specific guidance and passes SPCC

#### P7-02 · Reference pages
- [ ] `/docs/formats/[format]` for every supported format — **zero JS archetype**
- [ ] `/docs/guides/*` task guides
- **Spec:** README §7.6, §24.1 · **Done when:** reference pages ship 0 bytes of JS and pass SPCC

#### P7-03 · SEO infrastructure
- [ ] JSON-LD: `SoftwareApplication` (`offers.price: "0"`), `FAQPage`, `BreadcrumbList`, `HowTo`
- [ ] Unique title ≤ 60 and description ≤ 155 per page, with per-format overrides for the top 50 pairs
- [ ] Canonical, `hreflang`, 6 related-tool cross-links per page
- [ ] Build-time OG images (Satori → PNG) per page
- [ ] `sitemap.xml` split by tier; `robots.txt`
- **Spec:** README §24.2 · **Done when:** every page passes SPCC and structured data validates

#### P7-04 · i18n framework
- [ ] `@inlang/paraglide-js`; URL-prefix locale detection; namespaced keys; translator comments
- [ ] ICU plurals; `Intl` for numbers/dates/relative time; KB/KiB toggle with the definition stated
- [ ] **Logical CSS properties throughout**; `dir` on `<html>`; mirrored directional icons
- **Spec:** README §21 · **Done when:** `en-XA` (+40 % expansion) and `ar` (RTL) screenshot tests pass

#### P7-05 · Launch content
- [ ] `/privacy` (the §25.1 text verbatim), `/terms`, `/about` **with the trademark disclaimer**
- [ ] `/verify` — step-by-step proof that nothing is uploaded, reproducible by a third party
- [ ] `docs/THIRD-PARTY-LICENSES.md` published and linked
- **Spec:** README §25 · **Done when:** a third party can follow `/verify` and confirm the claim

#### P7-06 · Trust artefacts
- [ ] Deployed commit hash in the footer, linked to the tree
- [ ] Reproducible-build instructions in `docs/CONTRIBUTING.md`
- **Spec:** README §25.8 · **Done when:** a third party reproduces the deployed bundle from source

#### P7-07 · Deployment
- [ ] Cloudflare Pages static; `_headers` with the full §16.4/§16.5 header set and §23.3 cache policy
- [ ] Preview → smoke test → promote
- **Spec:** README §23.3 · **Done when:** headers verified in production; `crossOriginIsolated === true`

#### P7-08 · Analytics-free measurement
- [ ] Edge log aggregation to daily path+referrer counts; no cookies, no IDs, no cross-request correlation
- [ ] Search Console + Bing Webmaster
- [ ] **Zero client-side analytics** — verified by the no-network test
- **Spec:** README §24.5 · **Done when:** `/privacy`'s claim is literally true and testable

#### P7-09 · Launch-critical content pieces
- [ ] Interactive format comparison (upload once, see every format at matched quality)
- [ ] "Which image format should I use?" decision tree with measured data
- [ ] AVIF vs WebP vs JPEG XL with published, reproducible methodology
- **Spec:** README §24.4 · **Done when:** each is live and its numbers reproduce via `pnpm bench`

#### P7-10 · Distribution
- [ ] Show HN, r/photography, r/webdev, r/selfhosted, r/embedded (LVGL), Product Hunt, Lobsters
- [ ] LVGL and Home Assistant forums; awesome-list PRs
- [ ] `CONTRIBUTING.md` making "add a provider adapter" or "add a format" an obvious first contribution
- **Spec:** README §24.6 · **Done when:** posted and CONTRIBUTING.md is live

#### P7-11 · Full E2E matrix
- [ ] All five canonical flows × Chromium/Firefox/WebKit × desktop/mobile viewport
- **Spec:** README §22.1 · **Done when:** green and required

#### P7-12 · Manual release checklist
- [ ] Every item in README §22.8, recorded in `docs/release/{version}.md`
- **Done when:** the checklist is complete and signed off

#### P7-13 · Final IP sweep
- [ ] Re-run every gate; confirm §25.3.5 open items are all resolved or explicitly deferred with a shipped fallback
- [ ] Confirm no denied string, no unregistered asset, no copyleft dependency
- **Spec:** README §25 · **Done when:** `docs/ADR/ip-clearance.md` has zero undecided rows

#### P7-15 · Close the Gate 0 branch-protection waiver
- [ ] Create a branch ruleset on the default branch: restrict deletions, block force pushes, require a pull request, require status checks with "up to date" enabled
- [ ] Add all six required checks by name: `lint, typecheck, test, build`, `no-network`, `credential-leak`, plus the licence, asset, and trademark gates as they are exposed
- [ ] Verify by attempting a direct push to the default branch and confirming it is **rejected**; record the rejection message as evidence
- [ ] Flip P0-03 and P0-15 from `[~]` to `[x]` and clear the Gate 0 waiver row
- **Spec:** README §23.6 · **Blocks:** first external contributor, and public launch · **Done when:** a direct push to the default branch is rejected and a red PR cannot merge

#### P7-14 · Post-launch backlog seeded
- [ ] Create issues for: i18n Phase 2 locales, WebGPU for all filters, recipe gallery, more providers, plugin API, Tauri desktop
- **Spec:** README §26 post-launch · **Done when:** issues exist and are labelled

### 🚦 Gate 7 — launch

- [ ] **P7-15 complete** — the Gate 0 branch-protection waiver is closed, not carried into launch
- [ ] Search Console clean; Core Web Vitals green
- [ ] `/verify` reproducible by a third party
- [ ] Every gate 0–6 still green
- [ ] Appendices A–E fully checked

---

## 10. Appendix A — Tool checklist (81)

Check a box **only when all twelve STCC items (§0.4) pass.**

**Convert & export** — [x] T01 Converter `/convert` · [ ] T02 HEIC `/heic-converter` · [ ] T03 RAW
`/raw-converter` · [ ] T04 AVIF `/avif-converter` · [ ] T05 WebP `/webp-converter` · [ ] T06 JXL
`/jxl-converter` · [ ] T07 SVG→raster `/svg-to-png` · [ ] T08 Vectorize `/image-to-svg` ·
[ ] T09 PDF→Image `/pdf-to-image` · [ ] T10 Image→PDF `/image-to-pdf` · [ ] T11 Favicon
`/favicon-generator` · [ ] T12 GIF Maker `/gif-maker` · [ ] T13 Video→GIF `/video-to-gif` ·
[ ] T14 GIF Splitter `/gif-converter` · [ ] T15 Spritesheet `/spritesheet` · [ ] T16 Embedded
`/embedded-converter` · [ ] T17 Base64 `/base64-image` · [ ] T18 HTML→Image `/html-to-image` ·
[ ] T19 CBZ `/cbz-converter`

**Optimize** — [x] T20 Compressor `/compress` · [ ] T21 To-Size `/compress-to-size` ·
[ ] T22 Web Optimizer `/optimize-for-web` · [ ] T23 Lossless `/lossless-optimize`

**Transform** — [x] T24 Resizer `/resize` · [ ] T25 Bulk Resize `/bulk-resize` · [ ] T26 Crop `/crop` ·
[ ] T27 Smart Crop `/smart-crop` · [ ] T28 Rotate `/rotate` · [ ] T29 Flip `/flip` ·
[ ] T30 Canvas Resize `/canvas-resize` · [ ] T31 Enlarge `/enlarge` · [ ] T32 Upscale `/upscale` ·
[ ] T33 Border `/add-border` · [ ] T34 Round Corners `/round-corners` · [ ] T35 Collage `/collage` ·
[ ] T36 Split/Tile `/split-image`

**Colour & adjust** — [ ] T37 Adjustments `/adjust` · [ ] T38 Filters `/filters` · [ ] T39 Curves
`/curves` · [ ] T40 Colour Space `/color-space` · [ ] T41 Threshold `/threshold` · [ ] T42 Enhance
`/enhance` · [ ] T43 Sharpen/Blur `/sharpen` · [ ] T44 Denoise `/denoise` · [ ] T45 Colour Picker
`/color-picker` · [ ] T46 Recolour `/recolor` · [ ] T47 Duotone `/duotone`

**Annotate & create** — [ ] T48 Editor `/editor` · [ ] T49 Text `/add-text` · [ ] T50 Watermark
`/watermark` · [ ] T51 Meme `/meme-generator` · [ ] T52 Draw `/draw` · [ ] T53 Signature `/signature`

**Privacy & metadata** — [ ] T54 Metadata Viewer `/exif-viewer` · [ ] T55 Metadata Remover
`/remove-exif` · [ ] T56 Blur Region `/blur-image` · [ ] T57 Blur Faces `/blur-face` ·
[ ] T58 Redact `/redact`

**Analyze** — [ ] T59 Inspector `/image-info` · [ ] T60 Compare `/compare` · [ ] T61 Duplicates
`/find-duplicates` · [ ] T62 OCR `/ocr` · [ ] T63 Accessibility `/alt-text`

**Cutout, fill, synthesis (local-first)** — [ ] T66 Remove Object `/remove-object` · [ ] T67 Expand
`/expand-image` · [ ] T68 Remove Background `/remove-background` · [ ] T69 Replace Background
`/replace-background` · [ ] T70 Pixel-Art Upscale `/pixel-art-upscaler` · [ ] T77 Cutout Refine
`/cutout` · [ ] T78 Seamless Composite `/composite` · [ ] T79 Procedural Generator `/generate` ·
[ ] T80 Colour Match `/color-match` · [ ] T81 Adaptive Resize `/adaptive-resize`

**AI-only (Tier 3)** — [ ] T64 Generate `/ai/generate` · [ ] T65 Prompt Edit `/ai/edit` ·
[ ] T71 Describe `/ai/describe`

**Batch & developer** — [ ] T72 Batch `/batch` · [ ] T73 Recipe `/recipe` · [ ] T74 Watch `/watch` ·
[ ] T75 Codegen `/codegen` · [ ] T76 CLI & Library

---

## 11. Appendix B — Format checklist

Check when: fixture round-trip test passes, adversarial test passes, capability probe is correct,
and the format's `/docs/formats/` page exists. **Or** when honestly marked unavailable with a reason.

**Standard raster** — [x] JPEG · [x] PNG · [x] APNG · [x] WebP · [x] AVIF · [x] JPEG XL · [x] GIF ·
[x] BMP/DIB · [x] TIFF · [x] ICO · [x] CUR · [ ] HEIC/HEIF (decode only) · [x] TGA · [x] PCX ·
[x] PPM/PGM/PBM/PNM · [x] PAM · [x] WBMP · [x] XBM/XPM · [x] DDS · [x] KTX/KTX2 · [x] Radiance HDR ·
[x] OpenEXR · [x] PFM · [x] FITS · [x] JPEG 2000 · [x] SGI/RGB · [x] Sun Raster · [x] QOI

**Explicitly unsupported (page explaining why)** — [x] PICT · [x] MNG · [x] FLIF · [x] CDR ·
[x] DWG · [x] DjVu · [x] HEIC encode

**RAW (Stage 1 preview)** — [ ] Canon CR2/CR3/CRW · [ ] Nikon NEF/NRW · [ ] Sony ARW/SRF/SR2 ·
[ ] Fujifilm RAF · [ ] Olympus ORF · [ ] Panasonic RW2 · [ ] Pentax PEF/PTX · [ ] Leica RWL/DRF ·
[ ] Sigma X3F · [ ] Samsung SRW · [ ] Kodak DCR/KDC/K25/DCS · [ ] Epson ERF · [ ] Mamiya MEF ·
[ ] Minolta MRW/MDC · [ ] Hasselblad 3FR/FFF · [ ] Phase One IIQ/CAP · [ ] Leaf MOS · [ ] Casio BAY ·
[ ] Adobe DNG

**RAW (Stage 2 develop)** — [ ] DNG · [ ] Canon · [ ] Nikon · [ ] Sony · [ ] Fujifilm

**Vector & document** — [x] SVG in · [x] SVG out · [ ] PDF in · [ ] PDF out · [x] EPS/PS (preview +
subset) · [ ] AI (PDF-compatible) · [ ] PSD/PSB · [x] XCF · [x] WMF/EMF · [x] DXF · [x] CBZ · [x] CBR

**Embedded** — [ ] LVGL v9 C array · [ ] LVGL v9 binary · [ ] LVGL v8 C array · [ ] LVGL v8 binary ·
[ ] Generic raw · [ ] Adafruit GFX · [ ] ESP-IDF/TFT_eSPI

**Video in (WebCodecs)** — [ ] MP4/M4V/MOV · [ ] WebM · [ ] MKV · [ ] AVI

---

## 12. Appendix C — AI adapter checklist

Check when **all** hold: recorded contract test passes (incl. every error response), mask-polarity unit
test passes, `test()` is cheap and honest about cost, `listModels()` implemented where possible,
`browserDirect` set **from observation**, walkthrough page written and verified, cost estimate wired to
the ledger, nightly live entry exists, and `docs/PROVIDERS.md` regenerated.

- [ ] **Anthropic** — `describe`
- [ ] **OpenAI** — `generate`, `edit`, `inpaint`, `describe`
- [ ] **Google Gemini** — `generate`, `edit`, `describe`
- [ ] **Stability AI** — `inpaint`, `erase`, `outpaint`, `upscale`, `removeBackground`, `replaceBackground`
- [ ] **Black Forest Labs** — `generate`, `inpaint`, `outpaint`
- [ ] **fal.ai** — model-dependent, incl. `sam2` for click-to-select
- [ ] **Replicate** — model-dependent
- [ ] **remove.bg** — `removeBackground`
- [ ] **Clipdrop** — `removeBackground`, `erase`, `upscale`, `replaceBackground`
- [ ] **OpenAI-compatible / self-hosted** — probed

---

## 13. Appendix D — IP clearance checklist

Check when a decision is recorded in `docs/ADR/ip-clearance.md`. **Spec:** README §25.3.

**Copyleft removals verified absent from the lockfile** — [ ] wasm-vips · [ ] gifsicle · [ ] libheif ·
[ ] x265 · [ ] LibRaw · [ ] Ghostscript · [ ] potrace · [ ] ffmpeg.wasm · [ ] xBRZ · [ ] HQx ·
[ ] Scale2x · [ ] @imgly/background-removal (RMBG weights)

**Patent decisions recorded** — [ ] PatchMatch (excluded) · [ ] Seam carving (excluded) ·
[ ] Guided filter (excluded) · [ ] Dark channel prior (excluded) · [ ] NLM (deferred) ·
[ ] Criminisi (designed around) · [ ] GrabCut (counsel) · [ ] Poisson (counsel) ·
[ ] Closed-form matting (counsel) · [ ] Simplex noise (sidestepped) · [ ] AV1/AVIF (noted) ·
[ ] HEVC/HEIC (encode excluded)

**Trademark / asset substitutions applied** — [ ] Filter names · [ ] Polaroid · [ ] Impact font ·
[ ] Meme templates · [ ] Platform emoji · [ ] Magic Eraser/Edit/Expand/Wand · [ ] Content-Aware ·
[ ] Adobe RGB profile · [ ] Device mockups · [ ] Social preset names (counsel)

**Open items resolved (README §25.3.5)** — [ ] DjVu · [ ] Twemoji provenance · [ ] libarchive RAR path

**Positive register verified at pinned versions** — [ ] All ~40 rows in README §25.3.4 ·
[ ] All model/data asset licences verified separately from their loaders

---

## 14. Appendix E — Standard Page Completion Checklist (SPCC)

Every one of the ~680 prerendered pages. **Spec:** README §7.6, §24.2.

- [ ] Prerendered static HTML; no runtime SSR
- [ ] Loads and is readable with **JavaScript disabled**
- [ ] Real `<input type="file">` present in the served HTML (tool pages)
- [ ] Only this page's JS chunk loads; no global bundle; within its archetype budget (§7.6)
- [ ] No codec WASM fetched until a file is provided
- [ ] Single `<h1>` naming the job in the user's words; tool above the fold
- [ ] Below the tool: what it does, what is lost, option explanations, 3–6 format-specific FAQs
- [ ] JSON-LD: `SoftwareApplication` + `FAQPage` + `BreadcrumbList` (+ `HowTo` on guides)
- [ ] Unique `<title>` ≤ 60 chars, `meta description` ≤ 155 chars
- [ ] Canonical URL, `hreflang` alternates, 6 related-tool cross-links
- [ ] Build-time OG/Twitter image
- [ ] Listed in the correct sitemap tier
- [ ] Lighthouse mobile ≥ 95; CLS ≤ 0.01; LCP ≤ 1.8 s throttled
- [ ] `axe` zero violations; usable at 400 % zoom and 320 px width
- [ ] All strings i18n'd; survives `en-XA` and `ar`
- [ ] **Not thin content** — has format-specific substance, or the page is not generated at all

---

## 15. Appendix F — Traceability map

| README § | Covered by |
| --- | --- |
| §2 principles | Gates 0–7; P0-02, P0-04..08, P5-16 |
| §4 tool catalog | Appendix A; P1-15, P2-15/16, P3-05/06, P4-19/20, P5-15, P6-01 |
| §5 formats | Appendix B; P2-01..P2-11, P2-17 |
| §6 options | P1-06..09, P3-02..04, P3-09, P2-12 |
| §7.3 libraries | P0-04, P0-08, P2-04, Appendix D |
| §7.6 page delivery | P1-11, Appendix E, P7-01..03 |
| §8 architecture | P1-01..05, P0-09/10 |
| §10 engine API | P1-01, P1-08..10 |
| §11 UX | P1-12..14, P3-14, P5-06, P6-03/07 |
| §12 design system | P0-14, P5-06 |
| §13 escalation + register | P4-21/22, P5-01/06/16 |
| §14 adapters | Appendix C; P5-08..12 |
| §15 relay | P5-13 |
| §16 security | P5-03/04, P0-15, P6-16 |
| §17 connect-ai | P5-14 |
| §18 persistence | P1-10, P3-13, P6-04/05 |
| §19 performance | P6-09/10, P1-11 |
| §20 accessibility | P6-07/08 |
| §21 i18n | P7-04 |
| §22 testing | P0-15, P1-02/04/05, P2-14, P5-16/17, P7-11/12 |
| §23 build/deploy | P0-01..03, P0-12, P7-07 |
| §24 SEO | P7-01..03, P7-08..10 |
| §25 legal/IP | P0-04..08, Appendix D, P7-05/06/13 |
| §26 roadmap | Phase structure of this file |
| §27 definition of done | STCC (§0.4) |
| §28.6 algorithms | P4-01..P4-13 |

---

## 16. Change log

Every README change gets a row here, per §0.3. Newest first.

| Date | README § | Change | PLAN action |
| --- | --- | --- | --- |
| 2026-08-09 | §7.6, §11, §19, §22, §24, §25.3.4 | Closed Phase 1 with live target-search progress, canvas pan/pixel grid, 12 MP latency evidence, Axe, keyboard, SEO, en-XA/Arabic coverage, and pinned Axe tooling | Completed P1-08/09/12/14/15, T01/T20/T24, and Gate 1 |
| 2026-08-09 | §7.6, §8, §10, §11, §19, §25.3.4 | Implemented the Phase 1 engine core, static route archetypes, generated controls, compare canvas, predicted sizing, and pinned/verified their direct dependencies | Completed P1-01..07, P1-10/11/13; recorded partial completion on P1-08/09/12/14 and measured Gate 1 evidence |
| 2026-08-09 | §7.3, §25.2, §25.3.4 | Approved IJG/IJG-short with mandatory attribution; verified the pinned jSquash codec portions | Added and completed P0-13-R1; unblocked and completed P0-13 |
| 2026-08-09 | §23.6 | **Waiver.** Required-check enforcement deferred; harnesses exist and pass, but branch protection needs repository settings access that is unavailable. Substance satisfied, mechanism deferred | P0-03 and P0-15 → `[~]`; Gate 0 row waived; added P7-15 as the re-entry trigger and a Gate 7 row that blocks launch on it |
| 2026-08-18 | §25.3.4 | Graduated `utif` 3.1.0, `gifuct-js` 2.1.2, `@jsquash/avif` 2.1.1, `@jsquash/jxl` 1.3.0 and transitive `pako` 1.0.11 into the shipping register; rewrote the OpenEXR and JPEG 2000 rows to state that no distributable package exists rather than implying a licence problem | Unblocked P2-04; added P2-04a for the two vendored WASM builds |
| 2026-08-19 | §5.6, §25.3.4 | Pinned and clearance-verified `mediabunny` 1.25.1 (MPL-2.0) for browser-local MP4/WebM container reading over platform WebCodecs; split AVIF/JXL browser decoders from worker-based encoders so the production bundle remains buildable | Advanced P2-10 implementation; AVIF/JXL browser decode delivery is build-verified, while encode delivery remains explicitly unavailable pending a compatible worker build |
| 2026-08-22 | §25.3.4 | Pinned and clearance-verified `dxf-parser` 1.1.2 and transitive `loglevel` 1.9.2 (both MIT) from installed manifests and licence files | Unblocked the DXF portion of P2-09 |
| 2026-08-18 | — | Fixed the licence-expression parser: SPDX `AND` was parsed as a choice, so a conjunction was allowed whenever any one term was allowlisted. Now every term of an `AND` must be allowlisted | Gate correctness; no plan task |
| 2026-08-09 | §25.3.4 | Split the positive register into a shipping register (installed, verified, enforced) and a candidate register (not installed, unverified, unenforced); added a build gate requiring every direct dependency to appear in the shipping register | P0-08 unblocked and completed; Gate 0 §25.3.4 row satisfied |
| 2026-08-09 | §25.3, §25.3.3 | Counsel recipient set (Festus Ogun / FOLEGAL); packet expanded to a full engagement brief with threshold questions and a response-record table; cover email drafted | P0-07 send subtasks moved `[!]` → `[~]`; added a response-recording subtask |
| 2026-08-09 | §25.3.4 | Verified newly pinned Svelte, Tailwind, and Playwright versions; excluded jSquash JPEG pending IJG review | Completed P0-14 infrastructure; blocked P0-13 explicitly |
| — | §7.6 | Added per-page delivery architecture (D1–D10, five route archetypes) | Added P1-11, Appendix E; amended P7-01..03 |
| — | §2 | Added P13 (clean IP by construction) | Added P0-04..08, Appendix D |
| — | §25.2–25.6 | Added clearance framework and substitution register | Added Phase 0 clearance block |
| — | §25.3.4/.5 | Added positive register and open-items list | Added P0-08, Appendix D |
| — | §2 | Added P11/P12 (programmatic before probabilistic; explicit escalation) | Restructured Phases 4 and 5; added P5-16 |
| — | §13.1 | Added escalation ladder + AI Justification Register | Added P4-21/22, P5-16 |
| — | §4.8/4.9 | Restructured to local-first; added T77–T81 | Added P4-19/20; Appendix A now 81 |

---

**Total: 134 tasks across 8 phases, 81 tools, 74 format entries, 10 adapters, ~680 pages.**

Start at **P0-01**.
