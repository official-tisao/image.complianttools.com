<!--
  P6-03 — the copy-to-clipboard control and the drag-out affordance for one processed result.

  README §11.5 asks for two things this component provides for every tool that renders a result:
  "copy result as `ClipboardItem`" and "drag result thumbnail out of the browser writes the
  processed file to the OS (`DataTransfer` with a real `File`)".

  ## Why this is a component and not a snippet inside each tool

  A dozen-plus tool components each have an `outputUrl`, a `busy` flag, and a download button, and
  each previously kept only the object URL. Recreating the clipboard write, its fallback, the
  staleness rule, and the drag handler in every one of them is how they drift apart: one tool
  would show "Copied" when it had actually downloaded a file, another would let you copy a result
  that no longer matched its preview. Here they all run the same code over the same
  `PublishedResult`, so they cannot disagree.

  ## Staleness, restated for this component's callers

  Pass `result` as null the moment the source or options change, if the tool cannot show the old
  preview in the meantime. Pass it with `stale: true` (via `markStale`) when the tool *does* keep
  rendering the previous preview while the next one is computed — the button is then disabled, so
  the copy is refused at the moment the user would otherwise press it.

  ## Keyboard and assistive-technology behaviour

  The drag handle is a real `<button>`, not a `draggable="true"` `<img>`, because a draggable
  image is not reachable by keyboard and its affordance is invisible to a screen reader. Native
  drag still works from the handle, and the button gives keyboard users the same outcome through
  the copy action, which writes the identical bytes. Status is announced through `role="status"`
  and failures through `role="alert"`, matching how every other tool in this app reports both.
-->
<script lang="ts">
  import { copyImageToClipboard, supportsImageClipboard } from './transfer/clipboard';
  import { prepareDragOut, writeFileToTransfer, type DragTransferLike } from './transfer/drag-out';
  import type { PublishedResult } from './transfer/result-file';
  import { translate, type Locale } from './i18n';

  let {
    result = null,
    busy = false,
    locale = 'en',
    testIdPrefix = 'result-transfer',
  }: {
    /** The current result, or null. A stale result disables every action here. */
    result?: PublishedResult | null;
    /** True while a new result is being computed. */
    busy?: boolean;
    locale?: Locale;
    /** Lets a tool keep its existing naming convention for the controls' test ids. */
    testIdPrefix?: string;
  } = $props();

  let status = $state('');
  let failure = $state('');

  const unavailable = $derived(!supportsImageClipboard());
  const canExport = $derived(result !== null && !result.stale && !busy);

  function t(key: string, fallback: string) {
    return translate(locale, key, fallback);
  }

  /**
   * The copy button is disabled rather than hidden when the clipboard cannot take an image: the
   * fallback download is a real outcome, so hiding the control would remove a working path, and
   * leaving it enabled with no explanation would look broken. The label says which it will do.
   */
  function clearMessages() {
    status = '';
    failure = '';
  }

  async function copy() {
    clearMessages();
    if (!result || result.stale || busy) return;
    const outcome = await copyImageToClipboard(result.file, result.file.name);
    if (outcome.outcome === 'copied')
      status = t('transfer.copied', 'Copied to clipboard as an image.');
    else if (outcome.outcome === 'downloaded')
      // The honest report of the README §7.2 fallback, not an error: the file is in the user's
      // downloads, and saying "copied" here would be a lie the user discovers in another app.
      status = t(
        'transfer.fallbackDownloaded',
        'This browser cannot put images on the clipboard, so the file was downloaded instead.',
      );
    else
      failure = t(
        'transfer.copyFailed',
        'Couldn’t copy to the clipboard. Allow clipboard access for this page, or use Download.',
      );
  }

  function onDragStart(event: DragEvent) {
    clearMessages();
    const decision = prepareDragOut({
      result,
      busy,
      transfer: event.dataTransfer as unknown as DragTransferLike | null,
    });
    if (decision.action === 'skip') {
      // A stale or absent result must not travel. Preventing the default stops the browser from
      // starting a drag that would drop the page's own text or the old object URL into the target.
      event.preventDefault();
      if (decision.reason === 'stale' || decision.reason === 'busy')
        failure = t(
          'transfer.resultNotCurrent',
          'This result is out of date. Wait for processing to finish, then drag it again.',
        );
      return;
    }
    const refused = writeFileToTransfer(
      event.dataTransfer as unknown as DragTransferLike,
      decision.file,
      decision.result.filename,
    );
    if (refused === 'no-file-items')
      // No `items` means this browser can only carry text: the drop target will receive the filename
      // rather than a file. Said plainly, because a silent no-op here is what a user reports as
      // "dragging does nothing".
      failure = t(
        'transfer.dragTextOnly',
        'This browser can only drag the filename, not the image. Use Copy to clipboard instead.',
      );
  }
</script>

<div class="transfer" data-testid={`${testIdPrefix}-controls`}>
  <button
    class="button"
    type="button"
    data-testid={`${testIdPrefix}-copy`}
    disabled={!canExport}
    aria-label={unavailable ? t('transfer.copy', 'Copy to clipboard') : undefined}
    aria-describedby={unavailable ? `${testIdPrefix}-copy-note` : undefined}
    onclick={() => void copy()}
  >
    {unavailable
      ? t('transfer.copyAndDownload', 'Copy to clipboard or download')
      : t('transfer.copy', 'Copy to clipboard')}
  </button>
  {#if unavailable}
    <span
      class="transfer-note"
      id={`${testIdPrefix}-copy-note`}
      data-testid={`${testIdPrefix}-copy-note`}
      >{t(
        'transfer.copyUnavailable',
        'This browser does not put images on the clipboard, so this downloads the file.',
      )}</span
    >
  {/if}
  <!--
    The drag source is a button wrapper rather than the preview image itself. `draggable` on an
    `<img>` would work with a mouse but is unreachable by keyboard and invisible to a screen
    reader; here the same bytes are reachable both ways.
  -->
  <span
    class="transfer-drag"
    role="button"
    tabindex={canExport ? 0 : -1}
    data-testid={`${testIdPrefix}-drag`}
    data-draggable={canExport ? 'true' : 'false'}
    aria-disabled={canExport ? undefined : 'true'}
    aria-label={t('transfer.dragOut', 'Drag the result out as a file')}
    draggable={canExport}
    ondragstart={onDragStart}
    onkeydown={(event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void copy();
      }
    }}
  >
    {t('transfer.dragHandle', 'Drag out')}
  </span>
  {#if status}
    <p
      class="transfer-status"
      role="status"
      aria-live="polite"
      data-testid={`${testIdPrefix}-status`}
    >
      {status}
    </p>
  {/if}
  {#if failure}
    <p class="transfer-failure" role="alert" data-testid={`${testIdPrefix}-failure`}>{failure}</p>
  {/if}
</div>
