# Phase 2 — remaining verification evidence

This file records the verification items that cannot be produced by an ordinary Node/Windows
checkout, plus the current operation-latency measurements. It exists so future verification is a
short, repeatable exercise rather than a re-derivation. It is evidence capture, not a claim: an item
is only "done" once the evidence listed here has actually been produced in the required environment.

## 1. Operation latency (§19.2 / STCC item 9) — currently FAILING

Measured on the production engine paths over a deterministic 12 MP (4000×3000) RGBA fixture with
`pnpm --filter @complianttools/image-engine bench:operations`.

| Operation                         | p95 (ms) | Budget (ms) | Ratio over budget |
| --------------------------------- | -------: | ----------: | ----------------: |
| decode JPEG + generate proxy      |     2495 |         400 |              6.2× |
| resize Lanczos3 → 1920            |     1987 |         250 |              7.9× |
| encode JPEG q82                   |     3374 |         700 |              4.8× |
| encode WebP q80                   |     3014 |         900 |              3.3× |
| encode AVIF speed 6               |    64934 |        4000 |             16.2× |
| target-size search (8 iterations) |     8712 |        4000 |              2.2× |

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

## 3. Format/encoder truthfulness notes

- **AVIF / JPEG XL animation:** the runtime registry reports `animation: false` because the pinned
  jSquash codecs are single-frame. The README `A` flag is an intentionally-open spec requirement.
- **JPEG XL reconstructible JPEG transcode:** not implemented; the current codec accepts decoded
  raster pixels only (`lossless` is pixel-lossless, not a reversible JPEG bitstream transcode).
- **OpenEXR:** reported `v1 unsupported`; a fixture-tested experimental parser exists but does not
  establish complete ZIP/PIZ interoperability, and no reproducible TinyEXR WASM build is produced.
