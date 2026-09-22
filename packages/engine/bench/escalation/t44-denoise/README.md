# P4-21 benchmark: T44 denoise

This benchmark measures the production engine API on deterministic impulse and additive Gaussian noise derived from four individually registered CC0 source images. The exact 128×128 clean references and corrupted inputs are persisted under `fixtures/`; all generated fixture and method-output PNG hashes are recorded in the manifests/results.

## Scope and production API

The production implementation is `applyDenoise` in `packages/engine/src/ops/enhance/denoise.ts`. It supports `median` and `bilateral`; median is a 3×3 per-channel filter, and bilateral is a 5×5 luminance-guided filter with strength default 50. The runtime API rejects `nlm`. There is no wavelet/BayesShrink implementation in the production API, so this measurement does not claim or benchmark one.

The benchmark applies both supported methods at strength 50 to the same persisted input for each fixture. This includes the production median method's configured strength argument, although that method currently does not use strength. Two warmups and eight timed calls are taken per case/method. The final output is hashed and repeated calls are checked for identical RGBA bytes. Timing covers only `applyDenoise`, not decoding, fixture construction, metrics, or PNG encoding.

## Corpus construction

The source assets and item-level CC0 evidence are registered in `../fixtures/cc0/manifest.json`. The fixture generator verifies each original image hash, metadata-snapshot hash, and supported CC0 metadata field before use. It decodes each original JPEG with the lockfile-pinned `@jsquash/jpeg`, takes the fixed source-pixel crop in `fixtures/manifest.json`, then uses production Lanczos3 resizing to produce a 128×128 clean reference.

For every source crop, a versioned SHA-256-derived uint32 seed generates three independent corruptions:

- Additive per-channel Gaussian noise with sigma 12, rounded and clamped to 8-bit RGB.
- Additive per-channel Gaussian noise with sigma 24, rounded and clamped to 8-bit RGB.
- Salt-and-pepper impulse noise on 2% of pixels, with each selected pixel set to black or white.

Alpha is unchanged. PNG byte hashes and decoded RGBA hashes are both registered for each clean reference/input and each method output. The source's exact item-level citation, CC0 evidence text, source-byte hash, and metadata-snapshot hash are embedded in the fixture manifest and result record.

## Metrics

- RGB PSNR against the exact clean derived reference, excluding alpha.
- Mean local SSIM on Rec.601 luminance, using a normalized 7×7 Gaussian window with sigma 1.2 and replicated image borders.
- Per-call latency samples, median, and nearest-rank p95.

Results report the unfiltered noisy-input metrics beside each method's metrics, so denoising regressions remain visible. The aggregate is a simple mean over the four registered source crops for each corruption class.

## Measured results

The checked-in run used Node.js 22.22.0 on Windows x64 with an Intel Core i7-10750H CPU, two warmups, and eight timed calls for each of 12 fixture/method pairs. Metrics below are means across the four source crops. Latency is aggregated over those same four cases and eight samples per case.

| Noise case | Method | Noisy PSNR → output PSNR (dB) | PSNR change (dB) | Noisy SSIM → output SSIM | SSIM change | Median / p95 (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Gaussian, sigma 12 | Median | 26.6612 → 26.9342 | +0.2729 | 0.782717 → 0.721378 | −0.061339 | 63.897 / 89.451 |
| Gaussian, sigma 12 | Bilateral | 26.6612 → 31.3289 | +4.6677 | 0.782717 → 0.857216 | +0.074499 | 28.521 / 37.682 |
| Gaussian, sigma 24 | Median | 20.7268 → 24.5996 | +3.8728 | 0.532434 → 0.631080 | +0.098647 | 66.478 / 98.657 |
| Gaussian, sigma 24 | Bilateral | 20.7268 → 26.6549 | +5.9281 | 0.532434 → 0.672433 | +0.139999 | 29.021 / 40.854 |
| Impulse, 2% | Median | 22.0323 → 28.4268 | +6.3945 | 0.723381 → 0.768963 | +0.045582 | 57.713 / 72.959 |
| Impulse, 2% | Bilateral | 22.0323 → 21.8018 | −0.2306 | 0.723381 → 0.621800 | −0.101581 | 26.116 / 31.742 |

On these cases, bilateral improved mean PSNR and SSIM for both Gaussian levels, while median improved both metrics for 2% impulse noise. Median slightly improved PSNR but reduced SSIM for the sigma-12 case. Bilateral degraded both metrics for impulse noise. This is evidence of method/noise tradeoffs on these fixtures, not a universal method ranking.

## Reproduction

From the repository root, build the engine, verify the source provenance and deterministic fixtures, then run the benchmark:

    pnpm --filter @complianttools/image-engine build
    node scripts/verify-p4-21-cc0-fixtures.mjs
    node packages/engine/bench/escalation/t44-denoise/prepare-fixtures.mjs --verify
    node packages/engine/bench/escalation/t44-denoise/run.mjs

Run the fixture generator without `--verify` only when intentionally regenerating the registered derived PNG files and fixture manifest. The generator writes inside this directory.

## Limits

These are controlled synthetic corruptions of four small CC0-derived crops, not raw sensor captures, low-light camera noise, demosaicing artifacts, or a representative user-photo corpus. The Gaussian process is independent by channel and pixel; real camera noise is commonly signal-dependent and processed. The 2% impulse case is a diagnostic salt-and-pepper pattern. Lanczos3-resized CC0 crops are the exact targets by construction, but they are not pristine camera originals. PSNR/SSIM do not establish subjective preference or edge/detail retention for every image class. Timing is a local Node.js CPU measurement and is not a browser or route-level latency result.

Interpret each measured case only for its stated corruption and fixture class. A synthetic metric result does not justify a learned-model escalation, close route STCC, or establish broad denoise quality.
