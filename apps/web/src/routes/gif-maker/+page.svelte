<script lang="ts">
  import { page } from '$app/state';
  import T12GifMaker from '$lib/T12GifMaker.svelte';
  import type { Locale } from '$lib/i18n';

  const locale = $derived(
    (page.url.pathname.split('/')[1] === 'ar'
      ? 'ar'
      : page.url.pathname.split('/')[1] === 'en-XA'
        ? 'en-XA'
        : 'en') as Locale,
  );
</script>

<T12GifMaker {locale} />
