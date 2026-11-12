<script lang="ts">
  import { onMount } from 'svelte';

  // Signal to the global FeedbackWidget that this is the dedicated feedback page
  // by setting a data attribute on the body that the widget can read
  onMount(() => {
    document.body.dataset.feedbackDedicatedPage = 'true';
    return () => {
      delete document.body.dataset.feedbackDedicatedPage;
    };
  });
</script>

<svelte:head>
  <title>Feedback - Image Compliant Tools</title>
  <meta name="description" content="Provide feedback about Image Compliant Tools." />
</svelte:head>
