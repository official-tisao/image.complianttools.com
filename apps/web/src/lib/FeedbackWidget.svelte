<script lang="ts">
  import { page } from '$app/state';
  import {
    buildFeedbackPayload,
    isValidEmail,
    submitFeedback,
    type Rating,
  } from '$lib/feedback-submission';

  /** Optional context passed by the parent page to identify the tool. */
  let {
    product,
    dedicatedPage = false,
    productClass = 'imagetools',
  }: { product?: string; dedicatedPage?: boolean; productClass?: string } = $props();

  // Check if this is the dedicated feedback page via body data attribute
  // (used by /feedback page to signal without prop duplication)
  const isDedicatedPage = $derived.by(() => {
    if (typeof document === 'undefined') return dedicatedPage;
    return dedicatedPage || document.body.dataset.feedbackDedicatedPage === 'true';
  });

  const productClassValue = $derived(productClass);

  const formData = $state<
    {
      product: string;
      email: string;
      whatBroke: string;
      whatWorks: string;
      better: string;
    } & { [key: string]: string }
  >({
    product: '',
    email: '',
    whatBroke: '',
    whatWorks: '',
    better: '',
  });

  let rating: Rating | null = $state(null);
  let submitting = $state(false);
  let submitError: string | null = $state(null);
  let submitted = $state(false);

  const currentPath = page.url.pathname;

  /** Extract the tool name from a path like `/en/crop`, `/crop`, or `/crop/`. */
  const segments = currentPath.split('/').filter(Boolean);
  const start = new Set(['en', 'en-XA', 'ar']).has(segments[0]) ? 1 : 0;
  const currentTool = segments[start] || '';

  /** Known tool names for automatic identification. */
  const knownTools = new Set([
    // Phase 1 tools
    'crop',
    'resize',
    'compress',
    'convert',
    'rotate',
    'flip',
    'add-border',
    'image-info',
    'remove-exif',
    'exif-viewer',
    'base64-image',
    'favicon-generator',
    'svg-to-png',
    'image-to-svg',
    'pdf-to-image',
    'image-to-pdf',
    'cbz-converter',
    'gif-converter',
    'avif-converter',
    'webp-converter',
    'jxl-converter',
    'heic-converter',
    'raw-converter',
    'embedded-converter',
    'lossless-optimize',
    'pixel-art-upscaler',
    'upscale',
    'ocr',
    'threshold',
    'sharpen',
    'duotone',
    // Localized tools
    'adaptive-resize',
    'alt-text',
    'blur-face',
    'color-match',
    'find-duplicates',
    'generate',
    'smart-crop',
    'add-text',
    'adjust',
    'blur-image',
    'bulk-resize',
    'canvas-resize',
    'codegen',
    'collage',
    'color-picker',
    'color-space',
    'compare',
    'composite',
    'curves',
    'cutout',
    'denoise',
    'draw',
    'editor',
    'enhance',
    'enlarge',
    'expand-image',
    'filters',
    'meme-generator',
    'optimize-for-web',
    'recipe',
    'recolor',
    'redact',
    'remove-background',
    'remove-object',
    'replace-background',
    'round-corners',
    'signature',
    'split-image',
    'watermark',
    'gif-maker',
    'html-to-image',
    'video-to-gif',
    'spritesheet',
    'watch',
    'connect-ai',
    'compress-to-size',
  ]);

  /** Route-derived product when context is known (tool pages). Empty on dedicated page. */
  const routeProduct = $derived(() => {
    if (isDedicatedPage) return '';
    // Homepage
    if (
      currentPath === '/' ||
      currentPath === '/en' ||
      currentPath === '/en-XA' ||
      currentPath === '/ar'
    ) {
      return 'homepage';
    }
    // Known tool (both locale and non-locale paths)
    if (knownTools.has(currentTool)) {
      return currentTool;
    }
    // Other pages - use the first path segment as identifier
    if (currentTool) {
      return currentTool;
    }
    return '';
  });

  /** Product value used in submission: explicit prop > route-derived > user input. */
  const productForSubmission = $derived(product ?? routeProduct() ?? formData.product);

  /** Is the product input hidden (context known) or shown (user must enter it)? */
  const productInputHidden = $derived(isDedicatedPage ? false : routeProduct() !== '');

  /** Whether the product field is required for this page. */
  const productRequired = $derived(isDedicatedPage || routeProduct() === '');

  /** Conditional textarea fields based on rating. */
  const conditionalFields = $derived(
    rating === null
      ? []
      : rating === 5
        ? [{ label: 'What can we do better?', name: 'better', placeholder: 'Optional', rows: 4 }]
        : [
            {
              label: "What broke or didn't work well?",
              name: 'whatBroke',
              placeholder: 'Optional',
              rows: 4,
            },
            {
              label: 'What works but could be better?',
              name: 'whatWorks',
              placeholder: 'Optional',
              rows: 4,
            },
          ],
  );

  /** Whether the form can be submitted (rating + product present). */
  const canSubmit = $derived(
    rating !== null && (productForSubmission !== '' || productInputHidden),
  );

  function selectRating(value: Rating) {
    rating = value;
    submitError = null;
  }

  async function handleSubmit() {
    if (!rating || !canSubmit) return;
    if (!isValidEmail(formData.email)) {
      submitError = 'Please enter a valid email address.';
      return;
    }

    submitting = true;
    submitError = null;

    const payload = buildFeedbackPayload({
      rating,
      product: productForSubmission,
      productClass: productClassValue,
      email: formData.email || undefined,
      whatBroke: formData.whatBroke || undefined,
      whatWorks: formData.whatWorks || undefined,
      better: formData.better || undefined,
    });

    try {
      const ok = await submitFeedback(payload);
      if (ok) {
        rating = null;
        formData.product = '';
        formData.email = '';
        formData.whatBroke = '';
        formData.whatWorks = '';
        formData.better = '';
        submitted = true;
      } else {
        submitError = 'Submission failed. Try again later.';
      }
    } catch {
      submitError = 'Network error while submitting feedback. Try again later.';
    } finally {
      submitting = false;
    }
  }
</script>

<div class="feedback-widget" aria-labelledby="feedback-heading">
  <h2 id="feedback-heading" class="feedback-heading">Does this tool help you?</h2>
  <p class="feedback-description">Rate this tool.</p>

  <form
    onsubmit={(event) => {
      event.preventDefault();
      handleSubmit();
    }}
  >
    <div class="rating-group">
      <legend class="sr-only">Rate this tool</legend>
      <div class="rating-stars" role="radiogroup" aria-label="Rate this tool from 1 to 5 stars">
        {#each Array(5) as _, i (i)}
          <button
            type="button"
            aria-pressed={rating === i + 1}
            aria-label={`Rate ${i + 1} stars`}
            onclick={() => selectRating((i + 1) as Rating)}
          >
            <span class="star">★</span>
            <span class="sr-only">{i + 1} star{i + 1 === 1 ? '' : 's'}</span>
          </button>
        {/each}
      </div>
      {#if rating}
        <p class="rating-hint" id="rating-hint">
          You rated this {rating} stars
        </p>
      {/if}
    </div>

    {#if rating && conditionalFields.length > 0}
      <div class="conditional-fields">
        {#each conditionalFields as field (field.name)}
          <div class="form-field">
            <label class="form-label" for={field.name}>{field.label}</label>
            <textarea
              id={field.name}
              bind:value={formData[field.name]}
              rows={field.rows}
              class="form-textarea"
              placeholder={field.placeholder}
              spellcheck="true"></textarea>
          </div>
        {/each}
      </div>
    {/if}

    {#if rating}
      <div class="form-field">
        <label class="form-label" for="email">Email</label>
        <input
          id="email"
          type="email"
          name="email"
          bind:value={formData.email}
          class="form-input"
          placeholder="your@email.com"
          autocomplete="email"
        />
        <small class="form-hint">Optional — receive updates when issues are fixed</small>
      </div>
    {/if}

    {#if rating !== null && !productInputHidden}
      <div class="form-field">
        <label class="form-label" for="product">Which tool or page is this feedback about?</label>
        <input
          id="product"
          type="text"
          name="product"
          bind:value={formData.product}
          class="form-input"
          placeholder="e.g., /crop or crop"
          required={productRequired}
        />
        {#if productRequired}
          <small class="form-hint">Required — enter the tool name or page URL</small>
        {/if}
      </div>
    {/if}

    <input type="hidden" name="product-class" value={productClassValue} />

    <button type="submit" class="submit-button" disabled={submitting || !canSubmit}>
      {submitting ? 'Submitting…' : 'Submit feedback'}
    </button>

    {#if submitError}
      <p class="error-message" role="alert">{submitError}</p>
    {/if}
  </form>

  {#if submitted}
    <div class="success-message" role="status" aria-live="polite">Thank you for your feedback!</div>
  {/if}

  <p class="privacy-notice">Submitted feedback is shared with the feedback server for review.</p>
</div>

<style>
  .feedback-widget {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    border-radius: var(--r-md);
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    max-width: 560px;
    margin: 0 auto;
    font: var(--fs-base) / var(--lh-normal) var(--font-sans);
    color: var(--c-text);
  }

  .feedback-heading {
    margin: 0;
    font-size: var(--fs-md);
    font-weight: 600;
    color: var(--c-text);
  }

  .feedback-description {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--c-text-muted);
  }

  .rating-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .rating-stars {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .rating-stars button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--c-border-strong);
    border-radius: var(--r-sm);
    background: var(--c-surface);
    color: var(--c-text-subtle);
    cursor: pointer;
    font-size: 1.5rem;
    line-height: 1;
    transition: all var(--dur-fast) var(--ease-out);
  }

  .rating-stars button:hover {
    border-color: var(--c-accent);
    color: var(--c-accent);
    background: var(--c-accent-subtle);
  }

  .rating-stars button:focus-visible {
    outline: 2px solid var(--c-accent);
    outline-offset: 2px;
  }

  .rating-stars button[aria-pressed='true'] {
    border-color: var(--c-accent);
    background: var(--c-accent);
    color: var(--c-on-accent);
  }

  .rating-stars button[aria-pressed='true']:hover {
    background: var(--c-accent-hover);
  }

  .rating-hint {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--c-text-muted);
  }

  .conditional-fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--c-border);
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-label {
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--c-text);
  }

  .form-input,
  .form-textarea {
    width: 100%;
    padding: 0.5rem 0.625rem;
    border: 1px solid var(--c-border);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-text);
    font: inherit;
    box-sizing: border-box;
  }

  .form-input:focus,
  .form-textarea:focus {
    outline: 2px solid var(--c-accent);
    border-color: var(--c-accent);
  }

  .form-input::placeholder,
  .form-textarea::placeholder {
    color: var(--c-text-subtle);
  }

  .form-hint {
    font-size: var(--fs-xs);
    color: var(--c-text-muted);
  }

  .submit-button {
    margin-top: 0.5rem;
    padding: 0.625rem 1rem;
    font-weight: 600;
    width: 100%;
    background: var(--c-accent);
    color: var(--c-on-accent);
    border: none;
    border-radius: var(--r-md);
    cursor: pointer;
    font: inherit;
  }

  .submit-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .submit-button:hover:not(:disabled) {
    background: var(--c-accent-hover);
  }

  .success-message {
    font-size: var(--fs-sm);
    color: var(--c-success);
    font-weight: 600;
  }

  .error-message {
    font-size: var(--fs-sm);
    color: var(--c-danger);
    font-weight: 500;
  }

  .privacy-notice {
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--c-border);
    font-size: var(--fs-xs);
    color: var(--c-text-muted);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 640px) {
    .feedback-widget {
      width: 100%;
      padding: 0.75rem;
    }
    .rating-stars button {
      width: 40px;
      height: 40px;
      font-size: 1.25rem;
    }
  }
</style>
