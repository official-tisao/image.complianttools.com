<script lang="ts">
  import { onMount } from 'svelte';
  import '../../../../packages/ui/src/tokens.css';
  import '../app.css';
  let { children } = $props();

  onMount(() => {
    document.documentElement.dataset.hydrated = 'true';

    // The static worker keeps the shell and immutable same-origin runtime assets
    // available after an online warm-up. Cross-origin model files remain owned by
    // their configured CDN and are never copied through the app server.
    if (
      'serviceWorker' in navigator &&
      (location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1')
    ) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Offline support is an enhancement; the route remains usable when a
        // browser or deployment declines service-worker registration.
      });
    }
  });
</script>

{@render children()}
