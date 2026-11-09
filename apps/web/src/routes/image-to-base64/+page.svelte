<script lang="ts">
  import Base64ImageTool from '$lib/Base64ImageTool.svelte';
  import FormatToolCompletion from '$lib/FormatToolCompletion.svelte';
</script>

<!--
  Legacy alias of the canonical `/base64-image` route (README §4.1 T17). The tool's canonical
  link and hreflang alternates already point at `/base64-image`, so this page serves the same
  tool and the same static completion content — an alias that served less content would render
  a different document at a second URL rather than the same page under a legacy path.
-->
<Base64ImageTool />
<FormatToolCompletion route="base64-image" />
