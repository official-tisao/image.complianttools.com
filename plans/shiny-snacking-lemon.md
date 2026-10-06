# Fix remaining 23 e2e failures (CSP + clipboard + drag)

## Context

`pnpm test:e2e` still shows 23 failures after the previous CSP/style-trusted fix:

- `encoder-parity`: jpeg/png/webp download disabled (CSP blocks `script-src 'unsafe-eval'` needed by Firefox/WebKit bundle chunks; worker CSP/trusted-types still blocks `new Worker()`)
- `phase1-tools`: /convert, /compress, /resize download disabled (same CSP/worker root cause)
- `p6-03-clipboard-drag`: Firefox paste (line 76, 143) and clipboard drag still fail because no result is produced when workers can't load

Firefox error: `Content-Security-Policy: ... script-src 'self' 'wasm-unsafe-eval' ... (Missing 'unsafe-eval')`

## Approach

1. `apps/web/svelte.config.js`: add `'unsafe-eval'` to `script-src` (required by Firefox/WebKit bundle chunks that use `eval`/`new Function()`).
2. `apps/web/src/lib/trustedTypes.ts`: verify `default` policy is installed correctly; the `new URL()` strings in workers rely on implicit `createScriptURL` conversion from the `default` policy. Ensure `createScriptURL` is exported and used.
3. `apps/web/src/lib/ToolWorkspace.svelte`, `formatEncoderWorker.ts`, and other worker-constructing files: wrap `new URL(...)` with `createScriptURL()` to produce an explicit `TrustedScriptURL` so `require-trusted-types-for 'script'` allows `new Worker()`.
4. Confirm `e2e/encoder-parity.spec.ts`, `e2e/phase1-tools.spec.ts`, `e2e/p6-03-clipboard-drag.spec.ts` expectations match the fixed behavior.

## Critical files to modify

- `apps/web/svelte.config.js`
- `apps/web/src/lib/trustedTypes.ts`
- `apps/web/src/lib/ToolWorkspace.svelte`
- `apps/web/src/lib/formatEncoderWorker.ts`
- `apps/web/src/lib/T60Compare.svelte` (if needed)

## Verification

Run `pnpm test:e2e -- e2e/encoder-parity.spec.ts e2e/phase1-tools.spec.ts e2e/p6-03-clipboard-drag.spec.ts` and confirm 0 failures in those specs.
