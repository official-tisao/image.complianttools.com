<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'secondary';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let disabled = false;
  export let loading = false;
  export let type: 'button' | 'submit' | 'reset' = 'button';
</script>

<button
  class="ct-button"
  data-variant={variant}
  data-size={size}
  {type}
  disabled={disabled || loading}
  aria-busy={loading}
>
  <slot />
</button>
