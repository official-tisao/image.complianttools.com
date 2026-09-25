# T57 generated fixture suite

This in-repository generated fixture suite contains three deterministic synthetic face scenes released under
[CC0 1.0 Universal](LICENSE.txt). The shapes are project-generated and are not photographs or
likenesses of real people. Each fixture records its exact visible face boxes, dimensions, PNG and
decoded-pixel SHA-256 hashes, and a fixed generator recipe in `fixtures/manifest.json`.

Use it for route behavior, exact region-coordinate mapping, multiple and clipped regions, blur
preview/export, and edge-case checks. The fixtures do not establish YuNet real-photo accuracy,
recall, demographic performance, coverage of poses or lighting, or safe automatic redaction.
Every model suggestion remains untrusted until the user reviews it; missed faces stay visible.

Regenerate intentionally with:

```sh
node packages/engine/bench/escalation/t57/generate-fixtures.mjs
```

Verify the checked-in PNG and manifest bytes with:

```sh
node packages/engine/bench/escalation/t57/generate-fixtures.mjs --verify
```
