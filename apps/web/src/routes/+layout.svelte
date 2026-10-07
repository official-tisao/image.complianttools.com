<script lang="ts">
  import { onMount } from 'svelte';
  import '$lib/trustedTypes';
  import '../../../../packages/ui/src/tokens.css';
  import '../app.css';
  let { children } = $props();

  let offline = $state(false);
  let updateReady = $state(false);
  let swRegistration: ServiceWorkerRegistration | undefined = $state();

  onMount(() => {
    document.documentElement.dataset.hydrated = 'true';

    const updateOnlineStatus = () => {
      offline = !navigator.onLine;
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    if (
      'serviceWorker' in navigator &&
      (location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1')
    ) {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          swRegistration = reg;
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  updateReady = true;
                }
              });
            }
          });
        })
        .catch(() => {
          // Offline support is an enhancement; the route remains usable when a
          // browser or deployment declines service-worker registration.
        });
    }
  });

  function reloadForUpdate() {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }
</script>

{@render children()}

{#if updateReady}
  <div class="sw-update-toast" role="alert" aria-live="polite">
    <span>A new version is ready.</span>
    <button onclick={reloadForUpdate}>Reload</button>
  </div>
{/if}

{#if offline}
  <div
    class="offline-badge"
    role="status"
    aria-live="polite"
    aria-describedby="offline-reassurance"
  >
    Offline — local tools still work
    <span id="offline-reassurance" hidden
      >Your local image processing continues; AI-only provider requests are paused until
      connectivity returns.</span
    >
  </div>
{/if}

<style>
  .sw-update-toast {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 50;
    padding: 0.75rem 1rem;
    background: #2a3f5f;
    color: #fff;
    border-radius: 0.4rem;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }
  .sw-update-toast button {
    padding: 0.35rem 0.6rem;
    font-size: 0.75rem;
    cursor: pointer;
    border: none;
    border-radius: 0.25rem;
    background: #fff;
    color: #2a3f5f;
    font-weight: 600;
  }
  .offline-badge {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 50;
    padding: 0.35rem 0.6rem;
    background: #c23b22;
    color: #fff;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 700;
  }
</style>
