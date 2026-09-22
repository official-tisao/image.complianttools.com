# T69 background replace

**Status: PARTIAL — local composition approximation measured; model gap not admitted.**

`t69/run.mjs` measures a deterministic 4×4 red/blue alpha composite and records
the input/output hashes, first-pixel value, alpha-blend reference, error, and
latency in `t69/results.json`. The result confirms the current local function is
a deterministic per-pixel alpha blend. It is not evidence of a full Laplacian
pyramid, Poisson blend, synthesized backdrop, or physically plausible relighting.
Those capabilities remain unmeasured and no Tier 3 row is justified from this
fixture alone.
