# P4-21 Benchmark: T70 Pixel-Art Scaling

**Status:** Measured on 4 deterministic, self-generated RGBA fixtures. This is a narrow engine comparison against independent integer nearest-neighbour block replication. It does not establish broad sprite quality or route-level STCC completion.

## Method

The fixture generator is [generate-fixtures.mjs](generate-fixtures.mjs); canonical pixels and SHA-256 hashes are in [fixtures/manifest.json](fixtures/manifest.json). [run.mjs](run.mjs) scales each fixture at factors 2, 3, and 4 with the engine's pixelArtScale operation and an independent nearest-neighbour baseline. A benchmark-only copy of the pre-fix averaging rule supplies before/after evidence. The report records exact RGBA differences, PSNR/MAE, source-palette additions, alpha changes, PNG/RGBA hashes, reviewable PNGs, and timing. Each measured method receives 10 warmups and 100 timed calls per fixture/factor. Timing covers only synchronous in-memory scaling.

The palette fixtures include a fully opaque stepped icon, a transparent outline sprite, a transparent pixel surrounded by eight different colors (no dominant neighbor), and a transparent pixel with a seven-to-one red/blue neighborhood (clear majority). All fixtures are generated locally; no external images or trained models are used.

## Results

Environment: Node v22.22.0, win32 x64, Intel(R) Core(TM) i7-10750H CPU @ 2.60GHz.

| Fixture | Scale | Changed RGBA pixels vs nearest | RGBA PSNR dB | RGBA MAE | Pre-fix invented RGB pixels | Current invented RGB pixels | New alpha-level pixels | Intermediate-alpha pixels | Nearest median ms | Engine median ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opaque-staircase-palette | ×2 | 0/1024 (0%) | ∞ (exact) | 0 | 0 | 0 | 0 | 0 | 0.1278 | 0.0266 |
| opaque-staircase-palette | ×3 | 0/2304 (0%) | ∞ (exact) | 0 | 0 | 0 | 0 | 0 | 0.1849 | 0.0651 |
| opaque-staircase-palette | ×4 | 0/4096 (0%) | ∞ (exact) | 0 | 0 | 0 | 0 | 0 | 0.237 | 0.1174 |
| transparent-outline-sprite | ×2 | 108/1024 (10.5469%) | 22.6779 | 5.189453 | 0 | 0 | 108 | 108 | 0.1284 | 0.1358 |
| transparent-outline-sprite | ×3 | 160/2304 (6.9444%) | 24.3665 | 3.525174 | 0 | 0 | 160 | 160 | 0.1426 | 0.3039 |
| transparent-outline-sprite | ×4 | 212/4096 (5.1758%) | 25.5802 | 2.668457 | 0 | 0 | 212 | 212 | 0.4386 | 0.6871 |
| transparent-pocket-mixed-palette | ×2 | 0/36 (0%) | ∞ (exact) | 0 | 4 | 0 | 0 | 0 | 0.0056 | 0.0213 |
| transparent-pocket-mixed-palette | ×3 | 4/81 (4.9383%) | 17.8010 | 6.216049 | 4 | 0 | 4 | 4 | 0.0114 | 0.036 |
| transparent-pocket-mixed-palette | ×4 | 8/144 (5.5556%) | 17.2895 | 6.993056 | 4 | 0 | 8 | 8 | 0.0198 | 0.0201 |
| transparent-pocket-clear-dominance | ×2 | 4/36 (11.1111%) | 14.6748 | 13.583333 | 1 | 0 | 4 | 4 | 0.0056 | 0.0088 |
| transparent-pocket-clear-dominance | ×3 | 8/81 (9.8765%) | 15.6472 | 11.296296 | 1 | 0 | 8 | 8 | 0.0118 | 0.0141 |
| transparent-pocket-clear-dominance | ×4 | 12/144 (8.3333%) | 16.5503 | 9.3125 | 1 | 0 | 12 | 12 | 0.0187 | 0.0199 |

### Findings

- The fully opaque limited-palette staircase matches integer nearest-neighbour exactly at all three factors.
- All measured outputs use only RGB colors present in their corresponding source fixture.
- The pre-fix averaging rule introduced ×2: 5, ×3: 5, ×4: 5 output pixels whose RGB was absent from the source fixture palettes; the current strict-majority guard introduces none.
- Some transparent-edge outputs differ from nearest-neighbour alpha and include intermediate-alpha pixels; nearest-neighbour preserves the source alpha blocks exactly.
- The mixed-palette pocket has no globally dominant colour by construction; the engine uses each output pixel’s local neighbourhood, so a source-palette colour can still continue where that local window has a strict majority.

Per-case exact values, added colors, focus-pixel outcomes, latency summaries, and artifact hashes are in [results.json](results.json). Baseline, pre-fix, and current PNGs are under [artifacts/](artifacts/).

## Limits

- Fixtures are synthetic, self-generated pixel patterns; they are not third-party sprites or a representative art corpus.
- Nearest-neighbour is the direct fidelity baseline for exact integer enlargement of these source pixels, not a claim that every artistic workflow prefers it.
- This benchmark does not compare against Scale2x, HQx, Eagle, or xBRZ implementations; their licensing constraints remain outside this measurement.
- Inputs are tiny (3×3 or 16×16); timings do not establish large-image latency, browser frame time, memory use, or route-level STCC performance.
