# Engine benchmarks

Benchmarks run against the built engine and fixed, provenance-recorded fixtures. Run:

```sh
pnpm --filter @complianttools/image-engine build
pnpm --filter @complianttools/image-engine bench
```

An ordinary local run enforces the absolute README §19 budget. Regression comparisons are runner-specific: CI sets `BENCH_RUNNER_ID` to the pinned runner image identifier. A matching baseline must already exist in `history.json`; absence is a failure in CI, not an invitation to record an arbitrary workstation result.

To record a result intentionally on the pinned runner, set both `BENCH_RUNNER_ID` and `BENCH_RECORD=1`. The runner appends the measured result. Review and commit that history change separately.

The metadata benchmark uses every `.gif` in `test/fixtures/gif-reference`. Its files are CC0 and integrity-pinned by that directory's `SHA256SUMS` and `PROVENANCE.md`.
