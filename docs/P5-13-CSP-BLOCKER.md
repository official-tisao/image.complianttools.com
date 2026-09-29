# P5-13 CSP blocker — user-supplied relay origins

**Status:** blocking one acceptance criterion of [PLAN.md P5-13](../PLAN.md). Everything else in
P5-13 is implemented and tested. This document states the blocker and the decision it needs, so
nobody has to rediscover it. **Requires P5-04.**

## The criterion that cannot be met yet

PLAN.md P5-13:

> **Done when:** a deployed relay makes a previously CORS-blocked provider work, and the UI shows
> which path the request took

The second half is done and tested. The first half needs a browser, a deployed relay, and a
deploying account — none of which exist in this environment, so it is **not** claimed. But there is
also a design blocker that no amount of deployment would clear.

## What the CSP actually is

The app is statically prerendered by SvelteKit with `mode: 'hash'` (`apps/web/svelte.config.js:11`).
The policy is emitted as a `<meta http-equiv>` tag baked into each of the 290 built HTML files at
build time. There is no CSP response header — `apps/web/static/_headers` carries COOP/COEP and the
§16.5 headers but no `Content-Security-Policy`, and `scripts/verify-headers.ts:26-37` documents that
omission as intentional and pending P5-04/P7-07.

`connect-src` is a **static, build-time array**:

```js
// apps/web/svelte.config.js:22-32
'connect-src': [
  'self',
  'blob:',
  'https:',                                    // <-- see below
  'https://cdn.jsdelivr.net',
  'https://raw.githubusercontent.com/tesseract-ocr/...',
],
```

It is identical on every page. Nothing at runtime can add a source to it.

## Why a user-supplied relay origin cannot be permitted safely today

README §15.4 requires: _"The relay URL is added to the runtime CSP `connect-src` (§16.4)."_ The app
cannot do that on a prerendered static page. The ways to "solve" it, and why each is wrong:

| Approach                                                         | Verdict                                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add `connect-src *`                                              | Rejected. README §16.4: _"Do not silently fall back to `connect-src *`."_ It also removes the supply-chain mitigation §16.1 relies on.                       |
| Add/retain `https:` as the workaround                            | Already present — and that is **the bug**, not the solution. See below.                                                                                      |
| Insert a `<meta>` CSP at runtime and claim it loosens the policy | Rejected. A page cannot relax its own CSP: a second policy only intersects with the first, so it can only narrow, never widen. Any claim otherwise is false. |
| Rewrite the served HTML per user                                 | Rejected. This is a static site with no server. A CDN rewrite would be a server, which breaks P7 (no server can receive a key).                              |

## The concrete defect this exposes

`https:` in `connect-src` is a **scheme source**: it permits a `fetch` to _any_ HTTPS host. Its
stated rationale in the config comment is model delivery, but `https://cdn.jsdelivr.net` and the
pinned `raw.githubusercontent.com` path are already listed explicitly and cover that use.

So the shipped policy both (a) contradicts README §16.4, which lists neither `https:` nor
`upgrade-insecure-requests` nor `require-trusted-types-for 'script'`, and (b) already satisfies a
user-supplied HTTPS relay origin — **which means the relay works today, but only because the policy
is too broad.** Removing `https:` to match §16.4 would block every user-supplied relay origin until
a real decision is made.

That inversion is the finding: the acceptance criterion would pass for the wrong reason, and the
security posture would be quietly wrong the whole time.

## The decision P5-04 needs to make

README §16.4 already anticipates this and names the options:

> _"provider requests are issued from a **dedicated worker whose own CSP is derived from the user's
> configured provider set**, delivered via a `Content-Security-Policy` on the worker script response,
> or (where that is not possible on the host) enforced by the transport's own origin allowlist
> (§13.5 item 1) with the CSP kept maximally tight for the document."_

**⚠ VERIFY** what the chosen host supports, pick the strictest workable arrangement, and record it
as an ADR. Three concrete candidates:

1. **Dedicated provider worker with its own CSP.** The document keeps a tight `connect-src`; all
   provider and relay egress happens from a worker whose CSP is derived from the user's configured
   provider set. This is the spec's first choice. It requires resolving `trustedTypes.ts:74-80`
   (each `new Worker(new URL(...))` must stay a literal for Vite to emit a separate chunk) and
   confirming the host can attach a `Content-Security-Policy` to a worker script response.

2. **Transport origin allowlist as the enforcement point.** Already implemented
   (`transport.ts:68-91`, `relay.ts` `resolveRequest`). Both endpoints are validated locally before
   any request is issued, so an injected script is limited to the origins the _user_ configured.
   Weaker than (1): it is defence in depth, not a browser-enforced boundary.

3. **Build-time allowlist of relay origins.** Acceptable only for a self-hosted deployment that
   controls its own `ALLOWED_ORIGINS` and rebuilds. It does not serve the hosted app.

Recommendation: **(1) with (2) as the fallback**, which is exactly what §16.4 prescribes.

### What is needed, concretely

- A decision recorded as an ADR, cross-referenced from P5-04 and P5-13.
- Removal of `https:` from `connect-src`, once the chosen arrangement carries provider egress. It
  should not survive as a workaround.
- `upgrade-insecure-requests` and `require-trusted-types-for 'script'`, both specified in §16.4 and
  both currently absent.
- `packages/engine/test/p5-04-csp-security.test.mjs` is **dead code that currently fails**: the
  engine test script excludes every `.test.mjs` from vitest (`packages/engine/package.json:105`) and
  it is not imported by `test/all.test.mjs`, so nothing runs it. It expects
  `require-trusted-types-for 'script'`, which the shipped policy does not contain. It should be
  rewritten as `.test.ts` and made to read the _built_ policy rather than `app.html` and `_headers`.
  **Not changed in P5-13** — it is P5-04's artifact and rewriting it would assert a policy decision
  that has not been made.

## What works today, and what does not

|                                                                          |                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| A user-deployed relay over HTTPS is reachable from the app               | **Yes**, because `connect-src` contains `https:`.                                     |
| That reachable for a defensible reason                                   | **No** — it is reachable because the policy is too broad.                             |
| A relay on a non-HTTPS origin (`http://localhost:8787` while developing) | **No.** Blocked, correctly: a page served over HTTPS cannot make an insecure request. |
| UI shows which path a request took                                       | **Yes**, before and after the request (`data-testid="ai-path"`).                      |
| Both destinations validated before any request is issued                 | **Yes**, `packages/engine/src/ai/relay.ts`.                                           |
| Silent fallback between direct and relay                                 | **Never** — asserted by test.                                                         |

**Note on the localhost case.** `http://localhost` is treated as a potentially-trustworthy origin by
Chrome but not universally, and README §14.10 flags this as **⚠ VERIFY**. It has not been verified
here. A user testing a local relay should deploy it to an HTTPS origin.

## Recommendation

Do not mark P5-13 done. Land the relay, the tests, and the templates — they are correct and
independent of this decision. Take the CSP question to P5-04 as a first-class item with the ADR
attached. The honest summary is that the relay works, and it works for a reason that should not
survive the next CSP change.
