<script lang="ts">
  import { page } from '$app/state';
  import T15Spritesheet from '$lib/T15Spritesheet.svelte';
  import type { Locale } from '$lib/i18n';

  const locale = $derived(
    (page.url.pathname.split('/')[1] === 'ar'
      ? 'ar'
      : page.url.pathname.split('/')[1] === 'en-XA'
        ? 'en-XA'
        : 'en') as Locale,
  );
</script>

<T15Spritesheet {locale} />
