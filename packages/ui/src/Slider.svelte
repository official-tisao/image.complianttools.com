<script lang="ts">
  export let label: string;
  export let value = 0;
  export let min = 0;
  export let max = 100;
  export let step = 1;
  export let disabled = false;
</script>

<label class="ct-slider-field">
  <span>{label}: {value}</span>
  <input class="ct-slider" type="range" bind:value {min} {max} {step} {disabled} />
</label>
