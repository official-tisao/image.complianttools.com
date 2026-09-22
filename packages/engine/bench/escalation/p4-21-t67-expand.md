# T67 generative expand / outpaint

**Status: BLOCKED — implementation shortfall measured.**

`packages/engine/bench/escalation/t67/run.mjs` creates an 8×8 deterministic
RGBA fixture and a 4×4 expansion mask. The recorded result in `t67/results.json`
shows that the no-mask path is byte-identical and that the masked path keeps the
canvas at 8×8. It changes only same-size masked pixels; it does not create a
larger canvas or an outpainted reference region. This is a measured local
shortfall, not an AI quality comparison. A model comparison must wait until the
local expansion contract and a cleared reference asset exist.
