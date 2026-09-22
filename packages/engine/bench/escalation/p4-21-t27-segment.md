# T27 segment / click-to-select assist

**Status: PARTIAL — local hinted path measured; semantic selection remains blocked.**

`t27-segment/run.mjs` measures the cleared rectangle-hint colour-range,
watershed, and iterative-refinement path on a generated 6×6 image with a
known two-tone foreground mask. The confusion counts, precision/recall, source
hash, and latency are recorded in `t27-segment/results.json`. This proves the
local path is deterministic for a colour-separated hint. It does not measure
semantic object identity, arbitrary subjects, or a Tier 2 detector; GrabCut and
uncleared model weights remain excluded.
