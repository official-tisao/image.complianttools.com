<script lang="ts">
  export let accept = 'image/*';
  export let multiple = true;
  export let disabled = false;
  export let label = 'Drop images here or choose files';
  let dragging = false;
</script>

<label
  class="ct-file-drop"
  data-dragging={dragging}
  on:dragenter={() => (dragging = true)}
  on:dragleave={() => (dragging = false)}
  on:drop={() => (dragging = false)}
>
  <span>{label}</span>
  <input data-testid="file-input" type="file" {accept} {multiple} {disabled} />
</label>
