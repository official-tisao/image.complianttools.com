<!--
  P5-14 — `/connect-ai/relay` (README §17.4).

  This page has one job beyond explaining relays: telling the truth about what deploying one means.
  A relay is code running on someone else's infrastructure, and a page that said only "your key
  never touches our servers" while recommending you deploy a proxy would be technically true and
  practically misleading. So the hosting-platform section below is the longest part of the page,
  and it is the part a reader should not skip.

  Everything asserted here about the relay's behaviour comes from `apps/relay/src` and
  `apps/relay/README.md`, which is the same source the relay's own tests assert against:
  - no storage binding, no `console` call, and a test that fails if one is added
  - `ALLOWED_ORIGINS` compared by exact string equality, with no wildcard support
  - the provider URL travelling in a `url=` query parameter, and the key travelling as a header
  - the user's IP and user agent reaching the platform but deliberately not forwarded upstream
-->
<script lang="ts">
  import '../../../connect.css';
  import { SITE_ORIGIN } from '$lib/connect/content';
  import { SUBPAGES } from '$lib/connect/nav';

  const title = 'Deploying your own AI relay — what it can and cannot see — ctimg';
  const description =
    'What an AI relay is, when you need one, how to deploy your own, and precisely what it can see: nothing is stored, the key travels as a header, and the hosting platform still records request metadata.';
  const canonical = `${SITE_ORIGIN}/connect-ai/relay`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'TechArticle', headline: 'Deploying your own AI relay', description },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Connect AI',
            item: `${SITE_ORIGIN}/connect-ai`,
          },
          { '@type': 'ListItem', position: 2, name: 'Relay', item: canonical },
        ],
      },
    ],
  };

  /** Can / cannot see. The two most-quoted rows of any relay documentation. */
  const CAN_SEE = [
    'The method, the `Origin` header, and the provider request headers.',
    'The request body, for the lifetime of that one request, in memory.',
    'The provider URL, which arrives in a `url=` query parameter.',
    'The `X-Relay-Token`, if you set one.',
  ];
  const CANNOT_SEE_OR_DO = [
    'It does not store anything. There is no KV, no D1, no R2, no Durable Object, and no cache — no storage binding is configured at all.',
    'It does not log anything. There is no logging call in the source, and a test fails the build if one is added.',
    'It never sees your API key as a stored value. The key is forwarded in a header on each request and is not written down.',
    'It does not keep your IP address or user agent from the platform: it receives them and does not forward them upstream, by design.',
  ];
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={`${SITE_ORIGIN}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(jsonLd)}</svelte:element
  >
</svelte:head>

<main class="connect-page" lang="en" dir="ltr" data-testid="relay">
  <header class="connect-hero">
    <p class="eyebrow">Only if your browser is blocked</p>
    <h1>Deploying your own relay</h1>
    <p>
      A relay is a small program that adds the CORS headers your browser needs to call a provider
      that refuses direct browser access. That is the only thing it does.
    </p>
    <p>
      You deploy it, to your own account. This site hosts no relay and offers no shared instance —
      if we ran one, your key would pass through our infrastructure and the promise that it never
      touches our servers would be worth nothing.
    </p>
    <div class="hero-actions">
      <a class="button primary" href="#visibility">What it can see</a>
      <a class="button" href="#deploy">Deploy one</a>
    </div>
  </header>

  <section class="connect-section" id="when" aria-labelledby="when-heading">
    <h2 id="when-heading">When you actually need one</h2>
    <p class="connect-lede">
      Most of the time you do not. The app probes for direct browser access before a relay is ever
      suggested, because a relay introduces a second party into the path for no benefit when the
      provider already allows the call.
    </p>
    <dl class="connect-why">
      <div>
        <dt>You do not need one for a local model</dt>
        <dd>
          Ollama, LM Studio, vLLM, and LiteLLM run on your own machine. There is no browser
          restriction to work around — you configure the server’s own CORS setting instead. See
          <a href="/connect-ai/self-hosted">running a model yourself</a>.
        </dd>
      </div>
      <div>
        <dt>You do not need one for most hosted providers</dt>
        <dd>
          Several answer browsers directly, and several others allow it as long as the request
          carries the right header. The “Works in browser” column on the chooser reflects what each
          provider currently does.
        </dd>
      </div>
      <div>
        <dt>You need one when a provider refuses browsers outright</dt>
        <dd>
          That is the case the relay exists for: a provider that sends no CORS headers at all. The
          browser blocks the request before it leaves, so no key and no setting on your side will
          change the outcome.
        </dd>
      </div>
    </dl>
  </section>

  <!-- The section to read before deploying anything. -->
  <section class="connect-section" id="visibility" aria-labelledby="visibility-heading">
    <h2 id="visibility-heading">What it can and cannot see</h2>
    <p class="connect-lede">Read this before deploying anything.</p>

    <h3 class="connect-h3">The relay code</h3>
    <h4>It sees:</h4>
    <ul>
      {#each CAN_SEE as item (item)}
        <li>{item}</li>
      {/each}
    </ul>
    <h4>It does not:</h4>
    <ul>
      {#each CANNOT_SEE_OR_DO as item (item)}
        <li>{item}</li>
      {/each}
    </ul>

    <div class="connect-note">
      <strong>The one thing to understand</strong>
      The relay is a pipe, not a vault. It forwards a request and returns a response. The key is in the
      request it forwards and is not written anywhere, which is why revoking a key at the provider — not
      at the relay — is the step that matters if one leaks.
    </div>

    <h3 class="connect-h3">The hosting platform</h3>
    <div class="connect-warning" data-testid="platform-caveat">
      <strong>“Stateless” stops being the whole answer here</strong>
      You are running code on someone else’s infrastructure. Depending on the platform and your plan,
      that platform may independently record things the relay code never sees. This is not a reason not
      to deploy one; it is a reason to know whose servers you are on.
    </div>
    <ul>
      <li>
        <strong>Request metadata.</strong> Method, path, query string (which contains the provider URL,
        and therefore the model and operation), response status, timing, byte counts, and your IP address.
      </li>
      <li>
        <strong>Platform-side logs and analytics.</strong> Cloudflare, Deno Deploy, Vercel, and Netlify
        all retain some request telemetry for abuse prevention, billing, and debugging. We do not control
        that and we make no claim about any retention period — check the terms of whichever you choose.
      </li>
      <li>
        <strong>What we could switch off.</strong> The bundled configuration disables Cloudflare’s Workers
        Logs for this Worker. That closes one logging path. It does not close Cloudflare’s account-level
        or edge-network logging, which is outside a Worker author’s control.
      </li>
    </ul>

    <h3 class="connect-h3">The provider</h3>
    <p>
      The provider sees a request from your relay’s IP address rather than from your browser. It
      cannot tell which user made it from the IP alone, but it can correlate requests arriving from
      the same relay. Your key, your prompt, and any image are visible to the provider — exactly as
      they are when you call it directly.
    </p>

    <h3 class="connect-h3">Us</h3>
    <p>
      Nothing. This site is statically hosted and has no endpoint that could receive your key, your
      relay URL, or your requests. Your relay URL is held in your browser for the session and is not
      written to storage.
    </p>
  </section>

  <section class="connect-section" id="deploy" aria-labelledby="deploy-heading">
    <h2 id="deploy-heading">Deploying one</h2>
    <p class="connect-lede">
      The relay ships in this project as a small Cloudflare Worker. You deploy it with your own
      account; the one-click button opens Cloudflare’s deploy flow using the configuration in the
      repository, which you can read before you click.
    </p>

    <pre class="connect-command"><code>npx wrangler deploy</code></pre>
    <p>
      You get a URL like <code>https://ctimg-relay.&lt;your-subdomain&gt;.workers.dev</code>. That
      is the value to paste into the app as your relay URL.
    </p>

    <div class="connect-note">
      <strong>Who may use it: ALLOWED_ORIGINS</strong>
      A comma-separated list of exact origins. A wildcard, a path, or a suffix is discarded rather than
      reinterpreted, and a list containing no usable origin makes the relay refuse every request rather
      than falling back to a default. There is no wildcard support, by design.
    </div>

    <div class="connect-note">
      <strong>Optional but recommended: a relay token</strong>
      A shared secret that every request must carry. It stops an origin you have not listed from using
      your relay to spend your provider quota. Treat it like a password: it is held in your browser for
      the session only, and it is not stored.
    </div>

    <h3 class="connect-h3">Other platforms</h3>
    <p>
      Equivalent templates ship for Deno Deploy, Vercel Edge, and Netlify Edge, with the same
      allowlist and token behaviour.
    </p>
  </section>

  <section class="connect-section" id="verify-relay" aria-labelledby="verify-relay-heading">
    <h2 id="verify-relay-heading">Verifying it, and removing it</h2>
    <p class="connect-lede">
      A relay that is misconfigured fails quietly, so check it directly rather than concluding from
      a tool not working.
    </p>
    <pre class="connect-command"><code
        >curl -i "https://ctimg-relay.YOUR-SUBDOMAIN.workers.dev/?url=https%3A%2F%2Fapi.openai.com%2Fv1%2Fmodels" \
  -H "Origin: https://image.complianttools.com"</code
      ></pre>
    <p>
      A response carrying <code>Access-Control-Allow-Origin</code> means the allowlist matched. A
      403 means your origin is not in <code>ALLOWED_ORIGINS</code>. A response without any CORS
      header at all means the request never reached the relay.
    </p>
    <p>
      To remove it, delete the deployment from your hosting account. Nothing here keeps a reference
      to it: the relay URL lives in your browser for the session and is gone when you close the tab.
    </p>
  </section>

  <section class="connect-section" id="related">
    <h2>Related</h2>
    <div class="connect-subpages">
      {#each SUBPAGES.filter((p) => p.href !== '/connect-ai/relay') as page (page.href)}
        <a href={page.href}>
          <strong>{page.title}</strong>
          <span>{page.body}</span>
        </a>
      {/each}
    </div>
  </section>
</main>
