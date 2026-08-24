<script lang="ts">
  import { onMount } from 'svelte';
  import '../../../../packages/ui/src/tokens.css';
  import '../app.css';
  let { children } = $props();

  onMount(() => {
    document.documentElement.dataset.hydrated = 'true';
  });
</script>

{@render children()}
