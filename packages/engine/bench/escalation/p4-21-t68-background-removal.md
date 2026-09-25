# T68 background removal

**Status: PARTIAL — hinted local path measured; zero-hint model remains blocked.**

`t68/run.mjs` uses a deterministic 4×4 fixture with a hard foreground square
and a hard background border. `t68/results.json` records the source hash, the
trimap, all output alpha values, hard foreground/background checks, and CPU
latency. The local alpha-matting path preserves the supplied trimap semantics
without network access. It does not measure hair/fur/veil quality and does not
provide automatic zero-hint segmentation. GrabCut, closed-form matting, and
guided filtering remain excluded; no Tier 2 weights are selected.
