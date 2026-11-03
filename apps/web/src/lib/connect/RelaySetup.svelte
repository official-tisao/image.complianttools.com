<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { setProviderRelay } from '@complianttools/image-engine/ai/connection';
  import {
    CLOUDFLARE_AUTH_URL,
    exchangeCloudflareCode,
    installRelay,
    listCloudflareAccounts,
    revokeCloudflareToken,
    type CloudflareAccount,
    RelaySetupError,
  } from './relay-installer';

  type Phase = 'ready' | 'authorizing' | 'choosing-account' | 'installing' | 'error';
  interface PendingLogin {
    state: string;
    verifier: string;
    redirectUri: string;
    returnTo: string;
  }

  const FLOW_KEY = 'ctimg:relay-oauth-pending';
  let phase = $state<Phase>('ready');
  let message = $state('');
  let accounts = $state<CloudflareAccount[]>([]);
  let selectedAccountId = $state('');
  let accessToken = '';
  let returnTo = '/connect-ai';
  const clientId = import.meta.env.PUBLIC_CLOUDFLARE_OAUTH_CLIENT_ID.trim();

  function randomBase64Url(byteCount: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  }

  function safeReturnPath(value: string | null): string {
    if (value === '/ai/generate' || value === '/ai/edit' || value === '/ai/describe') return value;
    return '/connect-ai';
  }

  async function pkceChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    let binary = '';
    for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  }

  async function beginSetup() {
    if (!clientId) {
      phase = 'error';
      message = 'Cloudflare setup is not enabled on this deployment yet.';
      return;
    }
    const verifier = randomBase64Url(48);
    const state = randomBase64Url(32);
    const redirectUri = `${location.origin}/connect-ai/relay/setup`;
    const pending: PendingLogin = {
      verifier,
      state,
      redirectUri,
      returnTo: safeReturnPath(page.url.searchParams.get('return')),
    };
    try {
      sessionStorage.setItem(FLOW_KEY, JSON.stringify(pending));
    } catch {
      phase = 'error';
      message = 'This browser blocked temporary sign-in storage. Allow site storage and try again.';
      return;
    }

    phase = 'authorizing';
    const url = new URL(CLOUDFLARE_AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'account.read workers-platform.write');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', await pkceChallenge(verifier));
    url.searchParams.set('code_challenge_method', 'S256');
    location.assign(url.toString());
  }

  async function completeAuthorization(code: string, returnedState: string) {
    let pending: PendingLogin | undefined;
    try {
      pending = JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? 'null') as PendingLogin | undefined;
      sessionStorage.removeItem(FLOW_KEY);
    } catch {
      pending = undefined;
    }
    history.replaceState(null, '', location.pathname);
    if (!pending || !returnedState || pending.state !== returnedState) {
      throw new RelaySetupError('Cloudflare sign-in could not be verified. Start setup again.');
    }
    returnTo = safeReturnPath(pending.returnTo);
    accessToken = await exchangeCloudflareCode({
      code,
      verifier: pending.verifier,
      clientId,
      redirectUri: pending.redirectUri,
    });
    accounts = await listCloudflareAccounts(accessToken);
    if (accounts.length === 0) {
      throw new RelaySetupError('No Cloudflare account is available for this sign-in.');
    }
    selectedAccountId = accounts[0]!.id;
    if (accounts.length === 1) await deployForAccount(accounts[0]!.id);
    else phase = 'choosing-account';
  }

  async function deployForAccount(accountId: string) {
    if (!accessToken)
      throw new RelaySetupError('Your Cloudflare sign-in expired. Start setup again.');
    phase = 'installing';
    message = 'Setting up your private relay in your Cloudflare account…';
    try {
      const relay = await installRelay(accessToken, accountId, location.origin);
      const settings = { relayUrl: relay.url, token: relay.relayToken };
      for (const kind of ['generate', 'edit', 'describe'] as const) {
        setProviderRelay(`ai-tool-${kind}`, settings);
      }
      await revokeCloudflareToken(accessToken, clientId);
      accessToken = '';
      await goto(returnTo);
    } catch (cause) {
      await revokeCloudflareToken(accessToken, clientId);
      accessToken = '';
      phase = 'error';
      message =
        cause instanceof Error
          ? cause.message
          : 'Cloudflare could not finish setting up the relay. Start again or choose another provider.';
    }
  }

  onMount(() => {
    const parameters = new URLSearchParams(location.search);
    const code = parameters.get('code');
    const state = parameters.get('state');
    const oauthError = parameters.get('error_description') ?? parameters.get('error');
    if (oauthError) {
      sessionStorage.removeItem(FLOW_KEY);
      history.replaceState(null, '', location.pathname);
      phase = 'error';
      message = 'Cloudflare authorization was cancelled. You can try again whenever you are ready.';
    } else if (code) {
      phase = 'installing';
      void completeAuthorization(code, state ?? '').catch((cause: unknown) => {
        phase = 'error';
        message =
          cause instanceof Error
            ? cause.message
            : 'Cloudflare authorization could not be completed.';
      });
    }
  });
</script>

<svelte:head>
  <title>Set up your private relay — ctimg</title>
  <meta
    name="description"
    content="Set up a private AI relay in your own Cloudflare account without using a command line."
  />
</svelte:head>

<main class="connect-page" lang="en" dir="ltr" data-testid="relay-setup">
  <header class="connect-hero">
    <p class="eyebrow">Only when your browser needs it</p>
    <h1>Set up your private relay</h1>
    <p>
      One sign-in installs a small relay in your Cloudflare account. It lets the selected AI
      provider answer requests that your browser cannot send directly.
    </p>
    <div class="connect-warning" data-testid="relay-setup-privacy">
      <strong>Your account, your relay</strong>
      Your browser sends the worker code and setup requests directly to Cloudflare. CompliantTools does
      not receive your Cloudflare access token, provider key, prompts, or images. Cloudflare hosts your
      relay and may process request metadata under its own terms.
    </div>
  </header>

  <section class="connect-section" aria-labelledby="setup-heading">
    <h2 id="setup-heading">What you approve</h2>
    <ul>
      <li>Cloudflare creates one uniquely named Worker in the account you select.</li>
      <li>
        Cloudflare's consent screen requests account read and Workers platform write access for the
        selected account. That Workers permission is broader than this setup's actions; this flow
        uses it only to create and enable the relay Worker.
      </li>
      <li>
        The Worker accepts requests only from this site and only to supported AI provider hosts.
      </li>
      <li>A random relay token is stored in this browser and in your Worker secret settings.</li>
      <li>
        Your API keys and image content are not part of setup; they are sent only when you later
        choose to run an AI request.
      </li>
    </ul>
    <p class="connect-note">
      Cloudflare account access is required. Cloudflare may require you to enable a workers.dev
      address or accept its terms. Usage is subject to your Cloudflare plan.
    </p>

    {#if phase === 'ready' || phase === 'authorizing'}
      <button
        class="button primary"
        type="button"
        data-testid="relay-setup-start"
        disabled={phase === 'authorizing' || !clientId}
        onclick={beginSetup}
      >
        {phase === 'authorizing' ? 'Opening Cloudflare…' : 'Set up with Cloudflare'}
      </button>
      {#if !clientId}
        <p role="status" data-testid="relay-setup-unavailable">
          One-time Cloudflare OAuth setup is still being prepared for this site.
        </p>
      {/if}
    {:else if phase === 'choosing-account'}
      <label for="relay-account">Choose your Cloudflare account</label>
      <select id="relay-account" bind:value={selectedAccountId} data-testid="relay-account">
        {#each accounts as account (account.id)}
          <option value={account.id}>{account.name}</option>
        {/each}
      </select>
      <button
        class="button primary"
        type="button"
        data-testid="relay-account-continue"
        onclick={() => deployForAccount(selectedAccountId)}>Set up my relay</button
      >
    {:else if phase === 'installing'}
      <p role="status" data-testid="relay-setup-progress">{message}</p>
      <progress aria-label="Setting up your private relay"></progress>
    {:else if phase === 'error'}
      <p role="alert" data-testid="relay-setup-error">{message}</p>
      <button class="button" type="button" onclick={() => (phase = 'ready')}>Try again</button>
    {/if}
  </section>
</main>
