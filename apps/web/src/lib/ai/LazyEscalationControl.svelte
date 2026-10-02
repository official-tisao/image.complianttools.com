<!--
  P5-16 (README §22.6a) — the single place `EscalationControl` is loaded from.

  Four route components render the control, and three of them — `/denoise`, `/editor`, and every
  Phase 2 metadata route — never actually reach it: they either have no admitted capability or no
  local result yet. A static import in any one of them hoists the provider catalogue, the request
  gate, and the implemented-adapter allowlist into that route's *shared* chunk, so every route the
  component is imported by pays for the control whether or not it renders one. Measured, that cost
  +32 KB compressed on the `/editor` app shell, which broke its 220 KB budget outright.

  So the control is `import()`ed here, once, and only when a caller has both a capability and a local
  result to offer it for. Routes that genuinely escalate pay one extra round trip, which is the right
  trade for routes that never escalate at all.
-->
<script lang="ts">
  import type { Component } from 'svelte';
  import type { AiCapability } from '@complianttools/image-engine/ai/types';
  import type { RasterImage } from '@complianttools/image-engine/types';
  import type { Locale } from '../i18n';

  /**
   * The props `EscalationControl` takes, restated so this wrapper can be typed without importing it.
   * `Component` is checked structurally at the call site, so drift still fails `svelte-check`.
   *
   * Mirrors the inner component exactly, including which props are optional: `buildImage` and
   * `buildRequest` both have defaults there, and tightening them here would reject call sites that
   * legitimately omit them.
   */
  type EscalationControlProps = {
    capability: AiCapability;
    localResultUrl: string;
    buildImage?: () => Promise<RasterImage | undefined>;
    buildRequest?: () => Record<string, unknown>;
    locale?: Locale;
  };

  let { capability, localResultUrl, buildImage, buildRequest, locale }: EscalationControlProps =
    $props();

  let Control = $state<Component<EscalationControlProps>>();

  $effect(() => {
    if (Control !== undefined) return;
    let cancelled = false;
    void import('./EscalationControl.svelte').then((module) => {
      if (!cancelled) Control = module.default;
    });
    return () => {
      cancelled = true;
    };
  });
</script>

{#if Control}
  <Control {capability} {localResultUrl} {buildImage} {buildRequest} {locale} />
{/if}
