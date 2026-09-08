# Phase 2 — remaining verification evidence

This file records the verification items that cannot be produced by an ordinary Node/Windows
checkout, plus the current operation-latency measurements. It exists so future verification is a
short, repeatable exercise rather than a re-derivation. It is evidence capture, not a claim: an item
is only "done" once the evidence listed here has actually been produced in the required environment.

## 1. Operation latency (§19.2 / STCC item 9) — currently FAILING

Measured on the production engine paths over a deterministic 12 MP (4000×3000) RGBA fixture with
`pnpm --filter @complianttools/image-engine bench:operations`.

| Operation                         | p95 (ms) | Budget (ms) | Ratio over budget | Re-measured 2026-09-07 |
| --------------------------------- | -------: | ----------: | ----------------: | ---------------------: |
| decode JPEG + generate proxy      |     2782 |         400 |              7.0× |                 2633.9 |
| resize Lanczos3 → 1920            |     2179 |         250 |              8.7× |                 2011.6 |
| encode JPEG q82                   |     3534 |         700 |              5.0× |                 3409.4 |
| encode WebP q80                   |     2943 |         900 |              3.3× |                 2863.8 |
| encode AVIF speed 6               |    71526 |        4000 |             17.9× |                69509.8 |
| target-size search (8 iterations) |     9320 |        4000 |              2.3× |                 9015.0 |

_Numbers above are the 2026-09-04 re-measurement on the same deterministic 12 MP RGBA gradient
fixture. They are within ±10% of the previously recorded values; the gap structure is unchanged.
The 2026-09-07 re-measurement on the same Node 22 baseline confirms the gap is stable: the
p95 deltas are within noise, and no engine change between 2026-09-04 and 2026-09-07 has moved
any operation materially closer to its budget._

### 1.0 Why each operation is over budget, and what would actually close the gap

| Operation                         | Where the time goes                                                     | Structural blocker                                                                                                                    | Realistic fix path                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| decode JPEG + generate proxy      | `mozjpeg_dec` (single-thread) + pure-JS bilinear downscale to 2048-edge | jSquash's single-thread JPEG build is the only cleared one; the MT build needs `crossOriginIsolated`; pure-JS resize is the slow part | (a) Production `crossOriginIsolated === true` activates the MT build; (b) `createImageBitmap` proxy path (browser only) bypasses the pure-JS resize |
| resize Lanczos3 → 1920            | Pure-JS separable resample, 12 MP → 2.7 MP, 6-tap kernel                | No SIMD; `@jsquash/resize` is scalar (~20 % gain)                                                                                     | A custom SIMD WASM build (not cleared) or `createImageBitmap` (browser only)                                                                        |
| encode JPEG q82                   | `mozjpeg_enc` (single-thread)                                           | Same single-thread jSquash build                                                                                                      | MT build activation in production                                                                                                                   |
| encode WebP q80                   | `webp_enc_simd` (single-thread in Node)                                 | Same                                                                                                                                  | MT build activation in production                                                                                                                   |
| encode AVIF speed 6               | `avif_enc` libavif, speed 6 (slowest setting)                           | Speed 6 is the highest-compression slowest setting; even MT libavif is not 4 s on 12 MP                                               | Bench should use a realistic production speed (e.g. 8) for the day-to-day path; speed 6 is the worst case                                           |
| target-size search (8 iterations) | 8 × single-encode cost                                                  | The 8 iterations are 8× the single-encode cost                                                                                        | Reducing per-encode cost closes it                                                                                                                  |

**No local change between 2026-09-04 and 2026-09-07 closes any of these.** The fixes are either
production-environment (multithread + `crossOriginIsolated`) or a codec architecture change that
needs to be both cleared and reproducible. The budgets must not be relaxed to make this pass.

This is **not a Gate 2 blocker** (Gate 2 covers formats, the adversarial corpus, and licensing). It
is STCC item 9, so it keeps the P2-15/P2-16 Appendix A rows unchecked. It is a real performance
project, not a measurement gap: closing it needs engine-level work (faster decode/proxy, a SIMD or
native resize path, and AVIF speed-level selection), not a budget change. Budgets must not be relaxed
to make this pass.

### 1.1 Resize-path investigation (`@jsquash/resize`)

`@jsquash/resize@2.1.1` (Apache-2.0) was investigated as the candidate SIMD/WASM resampler. Finding:
**it is not suitable as a fix.** Its `squoosh_resize_bg.wasm` is a scalar build (34 KB, zero `v128`
SIMD opcodes), so a 12 MP Lanczos3 downscale measures ~1.55 s versus ~2.0 s for the existing pure-JS
implementation — a ~20% gain, still ~6× over the 250 ms budget. The package ships no SIMD variant, and
its linear-light (`linearRGB: true`) default would also change pixel output versus the current
gamma-space path. Meeting the resize budget requires either a custom SIMD WASM build (not a cleared,
pinned package) or a browser-native resampler (`createImageBitmap`), which is unavailable in the Node
benchmark. The integration was therefore reverted rather than shipped as a dead-end dependency.

## 2. External evidence — not producible in this environment

None of these are claimed to pass; each requires a specific environment.

### 2.1 Real HEIC/HEIF decode (blocks Gate 2)

Required by P2-08, the Appendix B HEIC/HEIF row, the "every §5 row" Gate 2 item, and STCC item 12.

- **Target environments:** macOS or iOS Safari (native image pipeline), or Windows Chrome with the
  HEVC Video Extension installed (WebCodecs `ImageDecoder`).
- **Capture:** for each environment, record the browser version, the `ImageDecoder.isTypeSupported`
  result (or the native fallback path taken), and a successful decode of a real `.heic`/`.heif` file
  to PNG with the decoded dimensions.
- **Branch state on 2026-09-07:** the platform wrapper is in `packages/engine/src/codecs/platform/heic.ts`;
  the native-image fallback is in `apps/web/src/lib/HeicConverter.svelte` (`decodeWithNativeImagePipeline`,
  `createImageBitmap` → `<img>.decode()` chain); 7 unit tests in `packages/engine/test/heic-codec.test.ts`
  (covers MIME-type detection, container validation, `isTypeSupported` positive/negative, native-decode
  copyTo, missing-decoder error); 28 e2e tests in `e2e/heic-converter.spec.ts` (mocked ImageDecoder, native
  pipeline, keyboard reach, en-XA, ar — all 4 engines pass). The implementation is ready to be exercised
  on the target environments below.

#### 2.1.1 Evidence capture template

Drop the captured result into a new bullet under the matching environment when the run is done. Do not
delete the placeholder rows; an empty row is the honest "not yet captured" record.

- **macOS Safari 17.x** — Safari/17.x (macOS 14.x), `ImageDecoder` exposed:
  `image/heic: <true|false>`, `image/heif: <true|false>`. Path taken (WebCodecs / native). Decoded
  `camera.heic` (e.g. 4032×3024 iPhone 12 Pro back camera) to `<width>×<height>` PNG; SHA-256 of the
  PNG.
- **iOS Safari 17.x** — same fields as macOS, on an iPhone with iOS 17.x.
- **Windows Chrome with HEVC Video Extension** — Chrome/<version> (Windows 10/11), with the
  Microsoft "HEVC Video Extensions from Device Manufacturer" (or the paid alternative) installed.
  `ImageDecoder.isTypeSupported({ type: 'image/heic' })` must return `true`. Decoded a real
  `camera.heic` to PNG with dimensions captured.

Capture format per environment, drop in here:

```text
- <environment> — <date captured>:
    - browser: <name>/<version> on <os>
    - ImageDecoder.isTypeSupported('image/heic') → <bool>
    - ImageDecoder.isTypeSupported('image/heif') → <bool>
    - path taken: <WebCodecs|native fallback>
    - input: <file> (e.g. IMG_0001.HEIC, <width>×<height>, <bytes> bytes, sha256:<hex>)
    - output: <width>×<height> PNG, <bytes> bytes, sha256:<hex>
```

- **Windows note:** the earlier probe showed Windows Chrome exposes `ImageDecoder` but reports
  `image/heic` and `image/heif` unsupported without the HEVC extension; the native fallback is the
  required path on Windows.
- Do not mark the HEIC rows complete until this evidence is produced.

### 2.2 Pinned-runner benchmark baseline

`packages/engine/bench/run.mjs` already enforces an absolute 40 ms metadata budget in CI. The
regression baseline requires `BENCH_RUNNER_ID` set to a pinned runner image and a committed
`history.json` entry for that runner. See `packages/engine/bench/README.md` for the record flow
(`BENCH_RUNNER_ID` + `BENCH_RECORD=1`, then review and commit the history change).

### 2.3 Production `crossOriginIsolated` / headers

The `_headers` file (COOP/COEP/CORP/CSP/HSTS/cache) is committed and verified for asset integrity,
but `crossOriginIsolated === true` and the full header set must be verified on the deployed
Cloudflare Pages origin. This is P7-07 and remains open.

### 2.4 Production Lighthouse and browser matrix

Lighthouse thresholds (≥0.95 performance/accessibility, CLS ≤0.01, LCP ≤1.8 s) are enforced in CI
over local `pnpm build` output. Final production-origin Lighthouse, the Safari/iOS/Android matrix,
and en-XA/ar visual screenshots remain to be captured on real devices and are not claimed here.

### 2.5 Appendix A tool completion

A tool in Appendix A is checked only when all twelve STCC items (§0.4) pass. The first three
(T01, T20, T24) were closed in Phase 1 with full browser-environment evidence (axe, Lighthouse,
en-XA, ar, offline, live-preview fidelity, latency budget, adversarial tests). The remaining
~22 routes that exist (T02, T03, T04, T05, T06, T07, T08, T09, T10, T11, T12, T13, T14, T16, T17,
T19, T23, T54, T55, T59) ship a page + i18n SEO FAQ via `FormatToolCompletion`, but have not yet
been verified against the full STCC matrix; the remaining ~56 tools (T25 onward) have no
implementation yet. Marking a tool [x] without the full STCC run would falsify the dashboard and
break the planning contract. The honest unblock is: run the STCC verifier (axe + Lighthouse +
en-XA + ar + offline + latency) on each of the 22 existing routes in a real browser, then flip
the boxes. This is a substantial body of work and is not attempted in this audit.

#### 2.5.1 Locally-runnable STCC checks (re-verified 2026-09-07)

Run from the repository root on a clean build; the full Playwright suite takes ~15 min on 4 engines.
Numbers below are from the local re-run on this branch.

| Check                                                                                                                  | Routes              | Engines                                      | Result                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/format-page-completion.spec.ts` (static discovery content, JSON-LD, hreflang, OG, en-XA/ar)                       | 14 × 3 locales      | chromium + firefox + webkit + installed-edge | **176/176**                                                                                                                                                                                                                                                           |
| `e2e/phase2-accessibility.spec.ts` (axe zero violations + h1 + canonical + title ≤ 60 + description ≤ 155)             | 18 × 3 locales      | chromium + firefox + webkit + installed-edge | **224/224**                                                                                                                                                                                                                                                           |
| `e2e/no-network.spec.ts` (real conversion pipeline makes 0 cross-origin requests; offline interaction)                 | 2 flows             | chromium + firefox + webkit + installed-edge | **8/8**                                                                                                                                                                                                                                                               |
| `e2e/heic-converter.spec.ts` (capability-probed decoder + native pipeline fallback + keyboard reach + en-XA/ar)        | 5 flows             | chromium + firefox + webkit + installed-edge | **28/28**                                                                                                                                                                                                                                                             |
| `e2e/metadata-tools.spec.ts` (T54/T55/T59 — viewer/remover/inspector)                                                  | 3 tools × 3 locales | chromium + firefox + webkit + installed-edge | **72/72**                                                                                                                                                                                                                                                             |
| `e2e/lossless-optimize.spec.ts` (T23 — 50-file corpus pixel-identical, keyboard, en-XA/ar)                             | 6 flows             | chromium + firefox + webkit + installed-edge | **24/24**                                                                                                                                                                                                                                                             |
| `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm progress && pnpm verify:assets && pnpm verify:headers` | n/a                 | n/a                                          | **all green**                                                                                                                                                                                                                                                         |
| `pnpm exec lhci autorun` (per-route perf/a11y ≥ 0.95, CLS ≤ 0.01, LCP ≤ 1.8 s)                                         | 20 routes × 3 runs  | desktop Chrome                               | **deferred to CI** — the local Chrome instance in the development environment could not complete the 60-measurement matrix within a usable time budget (timed out at 10 min). CI runs this on every PR via the `lighthouse` matrix job in `.github/workflows/ci.yml`. |

The remaining STCC item 9 (§19.2 latency budgets) is unchanged from §1 above.

## 4. Bench runner baseline (external step)

`packages/engine/bench/run.mjs` already supports a 10 % regression gate (line 73: `p95Ms >
baseline.p95Ms * regressionLimit`). The gate is dormant in CI today because the bench step
in `.github/workflows/ci.yml` does not set `BENCH_RUNNER_ID`; if it did without a committed
baseline, the script would fail with "No committed metadata-read baseline exists for pinned
runner …". This is by design — the `bench-record.yml` workflow (`.github/workflows/bench-record.yml`)
opens a PR with the first `history.json` entry after one `workflow_dispatch` on the same
`ubuntu-24.04` runner the bench step will use.

To activate the regression gate once:

1. On the repository's GitHub Actions tab, run the `record-benchmark-baseline` workflow
   manually. The job uses `runs-on: ubuntu-24.04`; that is the canonical runner ID.
2. Merge the resulting PR (it adds one entry to `packages/engine/bench/history.json`).
3. Add the following to the `Enforce absolute metadata-read latency budget` step in
   `.github/workflows/ci.yml`:

   ```yaml
   - name: Enforce absolute metadata-read latency budget
     env:
       BENCH_RUNNER_ID: ubuntu-latest # or ubuntu-24.04 to match the recorded runner
     run: pnpm --filter @complianttools/image-engine bench
   ```

After step 3, CI rejects a PR whose `metadata-read` p95 regresses by more than 10 % vs the
recorded baseline. Until step 3, the bench step enforces the absolute 40 ms budget only.

## 3. Format/encoder truthfulness notes

- **AVIF / JPEG XL animation:** the runtime registry reports `animation: false` because the pinned
  jSquash codecs are single-frame. The README §5.2 table now matches: the `A` column is `—` for both,
  with notes explaining why a multi-frame path requires a container+frame codec that is not yet
  cleared.
- **JPEG XL reconstructible JPEG transcode:** not implemented; the current codec accepts decoded
  raster pixels only (`lossless` is pixel-lossless, not a reversible JPEG bitstream transcode). The
  README §5.2 JPEG XL row and §7.6 library note now state this explicitly instead of implying a
  transcode is available.
- **EPS / PSD encode:** §5.4 originally listed `E` for both, but the engine only ships a decode path
  for EPS/PS and PSD/PSB. The §5.4 table now matches the implementation: `—` for both, with
  reasons pointing users to SVG/PDF and PNG/TIFF/WebP/AVIF.
- **OpenEXR:** reported `v1 unsupported`; a fixture-tested experimental parser exists but does not
  establish complete ZIP/PIZ interoperability, and no reproducible TinyEXR WASM build is produced.
