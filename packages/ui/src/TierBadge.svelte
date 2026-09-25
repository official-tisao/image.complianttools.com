<!-- P5-06 TierBadge — appears on every result and every recipe step. -->
<script lang="ts">
  export let tier: 'local' | 'on-device' | 'provider';
  export let providerName: string | undefined = undefined;
</script>

<span
  class="tier-badge"
  data-tier={tier}
  aria-label={tier === 'local'
    ? 'Local result'
    : tier === 'on-device'
      ? 'On-device model result'
      : providerName
        ? `Provider result (${providerName})`
        : 'Provider result'}
>
  {#if tier === 'local'}Local
  {:else if tier === 'on-device'}On-device model
  {:else}{providerName ?? 'Provider'}
  {/if}
</span>

<style>
  .tier-badge {
    display: inline-block;
    padding: 0.15rem 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    background: var(--c-surface-sunk, #f1f5f9);
    color: var(--c-text-muted, #64748b);
    border: 1px solid var(--c-border, #e2e8f0);
  }
  .tier-badge[data-tier='local'] {
    background: var(--c-success, #22c55e);
    color: #fff;
    border-color: transparent;
  }
  .tier-badge[data-tier='provider'] {
    background: var(--c-accent-subtle, #dbeafe);
    color: var(--c-accent, #2563eb);
    border-color: var(--c-accent-subtle, #dbeafe);
  }
</style>
