# The Relay

A relay adds the CORS headers a browser needs to call an AI provider that refuses direct browser
access. That is the **only** thing it does.

You deploy it. To your account. Not to ours — we host no relay and offer no shared instance. If we
ran one, your API key would pass through our infrastructure, and the promise that it never touches
our servers would be worth nothing.

Source of truth: [README §15.3](../../README.md) and [PLAN.md P5-13](../../PLAN.md).

---

## What the relay can and cannot see

This is the section to read before deploying anything.

### The relay code itself

| | |
| --- | --- |
| **Stores** | Nothing. No KV, no D1, no R2, no Durable Objects, no queues, no cache, no cookie jar. There is no storage binding in `wrangler.toml` and no persistence call anywhere in `src/`. |
| **Logs** | Nothing. There is no `console` call in `src/`, and a test asserts one cannot be added. Request bodies, headers, and query strings are never written anywhere. |
| **Reads** | The inbound request — method, `Origin`, `X-Relay-Token`, the provider headers, and the body — for the lifetime of that one request, in memory. |
| **Sends** | The provider request, to the allowlisted host only, and the provider's response back to your browser. |

The API key you paste is forwarded in the request and never persisted. The relay is a pipe, not a
vault.

### The hosting platform

This is where "stateless" stops being the whole answer, and it would be dishonest to imply otherwise.

You are running code on someone else's infrastructure. Depending on the platform and your plan,
that platform may independently record things the relay code never sees:

- **Request metadata.** Method, path, query string (which contains the provider URL, including the
  model and operation in the path), response status, timing, byte counts, and the client's IP
  address.
- **Your IP address and user agent**, which reach the platform whether or not the relay forwards
  them upstream — and which the relay does *not* forward upstream, by design.
- **Platform-side logs and analytics.** Cloudflare, Deno Deploy, Vercel, and Netlify all retain some
  request telemetry for abuse prevention, billing, and debugging. **We do not control or audit that,
  and we make no claim about any retention period.** Check the terms of whichever provider you choose.

The `url=` query parameter carries the provider URL but never the key — the key is a header. Still,
that URL is metadata and it is visible to the host.

The bundled `wrangler.toml` sets `[observability] enabled = false`, which turns off Cloudflare's
Workers Logs for this Worker. That disables one logging path; it does not disable Cloudflare's
account-level or edge-network logging, which is outside a Worker author's control. **If request
metadata retention matters to you, that is a reason to choose a platform whose terms you have read,
or to not use a relay at all** — many providers are reachable directly, and the app probes for that
before you ever need one.

### What the provider sees

The provider sees a request from your relay's IP address, not from your browser. It cannot tell
which user made it from the IP alone, but it can correlate requests arriving from the same relay.
Your API key, your prompt, and any image you send are all visible to the provider — as they are
when you call it directly.

### What we can see

Nothing about your key, your relay, or your requests. The app is statically hosted and has no
endpoint that could receive any of it.

---

## Deploy to Cloudflare Workers

### Option 1 — one click

[![Deploy to Cloudflare](https://deploy.workers.devbutton.com/button)](https://deploy.workers.dev/?repository-url=https://github.com/official-tisao/image.complianttools.com)

This opens Cloudflare's deploy flow using the `wrangler.toml` in this directory. It will ask you to
create or choose a Workers account. Note that Cloudflare's one-click deploy path lets you edit
`wrangler.toml` in the browser before deploying — it is the same file that is in this repository.

After it deploys you get a URL like `https://ctimg-relay.<your-subdomain>.workers.dev`. That is the
value to paste into the app as your relay URL.

### Option 2 — manual

```bash
cd apps/relay
pnpm install                 # only needed for the TypeScript build
pnpm build                   # compiles src/ to dist/ (Wrangler runs dist/index.js)
npx wrangler login           # opens a browser to authorise
npx wrangler deploy
```

---

## Configure it

### `ALLOWED_ORIGINS` — who may use your relay

A comma-separated list of **exact** origins. Anything else — a wildcard, a path, a suffix — is
discarded rather than reinterpreted. If you set this to something that contains no usable origin,
the relay refuses every request rather than falling back to a default.

Default in `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://image.complianttools.com"
```

To allow your own deployment as well:

```toml
ALLOWED_ORIGINS = "https://image.complianttools.com,https://yoursite.example"
```

Origins are compared for exact string equality. `https://example.com` and `https://example.com/` are
equivalent; `http://example.com`, `https://www.example.com`, and `https://example.com.evil.test` are
not. There is no wildcard support, by design.

### `RELAY_TOKEN` — optional, but recommended

A shared secret so that only your browser can use your relay. Without it, anyone who finds your
relay URL can spend your provider quota through it.

```bash
npx wrangler secret put RELAY_TOKEN
```

Pick a long random string. Paste the same value into the app as the relay token. The app sends it as
`X-Relay-Token`; the relay strips that header before forwarding and never passes it to a provider.

**Preflight is exempt.** A CORS preflight cannot carry custom headers, so demanding the token on
`OPTIONS` would make the relay unusable from a browser. The token is checked on the real request.

### Destinations

The allowlist of provider hosts is **compiled into the source**, not configured:

```
api.anthropic.com            api.openai.com            generativelanguage.googleapis.com
api.stability.ai             api.bfl.ai                fal.run
queue.fal.run                api.replicate.com         api.remove-bg.com
api.remove.bg                clipdrop-api.co
```

HTTPS only, no credentials in the URL, no ports other than 443. If you use a self-hosted
OpenAI-compatible endpoint, add your host to `ALLOWED_DESTINATIONS` in `src/index.ts` and redeploy —
that is the point of the user-deployed model.

> `api.remove-bg.com` is listed because [README §15.3](../../README.md) specifies it. The remove.bg
> adapter in this repository currently calls only `api.remove.bg` (dot, no hyphen), so the hyphen
> entry is carried for spec fidelity rather than for a call the app makes today. Removing it is a
> one-line change if you would rather the allowlist contain only reachable hosts.

### Methods, headers, and redirects

These are derived from what the provider adapters in `packages/engine/src/ai/adapters` actually do,
not from a generic-proxy assumption. A test pins the contract, so a change to an adapter fails the
build here rather than surfacing later as an opaque browser error.

| | |
| --- | --- |
| **Methods** | `GET`, `POST`, `OPTIONS` only. Adapters issue `GET` for model lists, account/balance checks, and prediction polling, and `POST` for create, cancel, and edits. Nothing issues `PUT`, `PATCH`, or `DELETE`; the other verbs are refused with `405`. |
| **Request headers forwarded** | Whatever the adapter set: `Authorization` (OpenAI, Replicate, Stability, fal.ai), `x-api-key` (Anthropic, Clipdrop), `X-Api-Key` (remove.bg — same header, different casing), `x-key` (BFL), `x-goog-api-key` (Gemini), `anthropic-version`, `anthropic-dangerous-direct-browser-access`, `Prefer`, and `Content-Type`. |
| **Request headers never forwarded** | `X-Relay-Token`, `Cookie`, `Origin`, `Referer`, `Host`, the hop-by-hop set (`Connection`, `Keep-Alive`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`, `Proxy-Authorization`), and every client-identity header (`Forwarded`, `X-Forwarded-*`, `CF-Connecting-IP`, `CF-IPCountry`, `CF-Ray`, `CF-Visitor`, `True-Client-IP`, `X-Real-IP`). |
| **Response headers exposed** | The provider's own headers are passed through; `Set-Cookie` is removed. The credit and rate-limit headers the cost ledger reads (`X-Credits-Charged`, `X-Remaining-Credits`, `X-Rate-Limit-*`) and `Retry-After` are additionally listed in `Access-Control-Expose-Headers`, because a response header the browser cannot read is invisible to JavaScript and the ledger would silently never populate. |

**Redirects are never followed.** The relay issues the upstream request with `redirect: 'manual'` and
returns a `3xx` to the browser untouched.

This is deliberately stricter than the `redirect: 'follow'` sketched in README §15.3. That sketch
would let an allowlisted provider 302 the relay to an arbitrary host — the allowlist would govern
where the request *started* but not where it *ended*, which is the exact open-proxy failure the
allowlist exists to prevent.

Following redirects is also not needed here. No adapter reads a `Location` or `Operation-Location`
header: Replicate and fal.ai are polled by inspecting the JSON body, and the rest issue single
requests. So refusing a redirect costs nothing. If an adapter ever does need redirect-following, the
correct change is to validate the `Location` against this same exact-host allowlist before following
it — not to switch the runtime default to `follow`.

---

## Verify it works

Run these against **your deployed URL**. Replace `https://relay.example.workers.dev` with yours and
`https://image.complianttools.com` with the origin you allowed.

### Positive — the relay forwards a real request

```bash
curl -i "https://relay.example.workers.dev/?url=https%3A%2F%2Fapi.replicate.com%2Fv1%2Fmodels" \
  -H "Origin: https://image.complianttools.com"
```

Expect `HTTP/2 200` and a JSON body. A `401` from Replicate here is a **pass**: it proves the request
reached the provider with valid CORS headers, and the provider rejected it for want of a key.

If you set a `RELAY_TOKEN`, add `-H "X-Relay-Token: $RELAY_TOKEN"`.

### Negative — the guards actually hold

Each of these must fail. If any succeeds, stop and fix it before using the relay.

| Command | Expected | Why it matters |
| --- | --- | --- |
| Omit `-H "Origin: …"` | `403 Forbidden origin` | Fail-closed: no Origin, no service. |
| `Origin: https://evil.test` | `403 Forbidden origin` | Third parties cannot use your quota. |
| `Origin: null` | `403 Forbidden origin` | Sandboxed iframes are not a free pass. |
| `Origin: http://image.complianttools.com` | `403 Forbidden origin` | A scheme downgrade is a different origin. |
| `Origin: https://image.complianttools.com:8443` | `403 Forbidden origin` | A non-default port is a different origin. |
| `Origin: https://sub.image.complianttools.com` | `403 Forbidden origin` | No subdomain inference. |
| `Origin: https://image.complianttools.com.evil.test` | `403 Forbidden origin` | No suffix matching. |
| `?url=http://api.openai.com/v1/models` | `400 HTTPS only` | No plaintext egress. |
| `?url=ftp://api.openai.com/v1` | `400 HTTPS only` | HTTPS is the only scheme. |
| `?url=https://evil.test/x` | `403 Destination not allowed` | Not an open proxy. |
| `?url=https://user:pw@api.openai.com/v1` | `400 Credentials in url are not allowed` | No credential smuggling. |
| `?url=https://api.openai.com:8443/v1` | `400 Unexpected port` | Same host, different service. |
| `?url=https://api.openai.com.evil.test/v1` | `403 Destination not allowed` | No suffix matching. |
| `?url=https://api.openai.com.evil.test` via a `302` | `302` returned, never re-fetched | A redirect cannot escape the allowlist. |
| `?url=` (empty) | `400 Missing url` | |
| `-X DELETE` | `405 Method not allowed` | Only what the adapters need. |
| Wrong `X-Relay-Token` | `401 Unauthorized relay` | Only your browser may use it. |

```bash
# The two most important negative checks, runnable as-is:
curl -s -o /dev/null -w '%{http_code}\n' "https://relay.example.workers.dev/?url=https%3A%2F%2Fevil.test"
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE "https://relay.example.workers.dev/" \
  -H "Origin: https://image.complianttools.com"
# both must print 403 and 405
```

A worked redirect-escape check, if you want to see the guard rather than infer it:

```bash
# A provider answering 302 to an unapproved host must produce a 302 back to your browser,
# and the relay must make exactly ONE upstream call — never a second one to evil.test.
curl -si "https://relay.example.workers.dev/?url=https%3A%2F%2Fapi.openai.com%2Fv1%2Fmodels" \
  -H "Origin: https://image.complianttools.com" | head -1
# -> HTTP/2 3xx   (not a 200 from an unapproved host)
```

### In the browser

The real test is a request from a page. Open your site's AI tool, choose **Via my relay**, paste the
relay URL and token, and send a request. The UI shows which path each request took, so you can
confirm it went via the relay rather than direct. If the browser console shows no CORS error and the
provider responds, the relay is working.

---

## Tear it down

The relay holds nothing, so deleting it loses nothing.

```bash
# Cloudflare — deletes the Worker and its secrets
npx wrangler delete

# Or via the dashboard: Workers & Pages → ctimg-relay → Delete
```

The secret is destroyed with the Worker. If you used the same `RELAY_TOKEN` anywhere else, rotate it.

---

## Other platforms

All three import the same audited `src/policy.ts` as the Cloudflare Worker, so none of them can
quietly enforce weaker rules. A test asserts they keep every guard.

| Platform | File | Deploy |
| --- | --- | --- |
| Deno Deploy | `templates/deno.ts` | `deployctl deploy --project=my-relay apps/relay/templates/deno.ts` |
| Vercel Edge | `templates/vercel-edge.ts` | Place at `api/relay.ts`; set env vars in the dashboard |
| Netlify Edge | `templates/netlify-edge.ts` | Place at `netlify/edge-functions/relay.ts`; declare in `netlify.toml` |

Configuration is by environment variable on all three:

| Variable | Meaning |
| --- | --- |
| `ALLOWED_ORIGINS` | Comma-separated exact origins. Unset → the app's own origin. |
| `RELAY_TOKEN` | Optional shared secret. |

Each platform has its own limits that the relay does not hide from you: Vercel and Netlify Edge cap
request duration, which a slow provider call can exceed, and all three log to varying degrees —
read the platform's terms, as above.

### Adding a host for a self-hosted endpoint

You run a LiteLLM proxy or Ollama on your own machine and want the relay to reach it. Add the
hostname to `ALLOWED_DESTINATIONS` in `src/index.ts`, run `pnpm test`, and redeploy. Note that the
relay is reachable from the public internet, so an entry pointing at a private address is reachable
by anyone who passes the origin and token checks. Scope `ALLOWED_ORIGINS` accordingly, or do not use
a relay for a local endpoint — a local server usually needs only CORS headers, which
[README §17.4](../../README.md) covers.
