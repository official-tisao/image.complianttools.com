<script lang="ts">
  import {
    engineErrorMessage,
    isEngineError,
    withTypedEngineErrors,
  } from '@complianttools/image-engine/errors';
  import type { ExifFieldEdits } from '@complianttools/image-engine/metadata/exif';
  import {
    editJpegExifFields,
    readContainerMetadata,
    type MetadataTag,
  } from '@complianttools/image-engine/metadata/container';
  import {
    MetadataEditOptionsSchema,
    metadataEditOptionDescriptions,
    type MetadataEditOptions,
  } from '@complianttools/image-engine/schemas/options';
  import type { EngineError } from '@complianttools/image-engine/types';
  import GeneratedControls from './GeneratedControls.svelte';
  import ToolPageCompletion from './ToolPageCompletion.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const title = $derived(t('viewer.title', 'Metadata Viewer'));
  const metaDescription = $derived(
    t('viewer.metaDescription', 'Read and edit supported image metadata locally in your browser.'),
  );
  const seoFaqs = $derived([
    {
      question: t('seo.localQuestion', 'Does my file leave this device?'),
      answer: t(
        'seo.localAnswer',
        'No. The file is read and processed locally in your browser without an upload.',
      ),
    },
    {
      question: t('viewer.faqReadable', 'Which metadata can be read?'),
      answer: t(
        'viewer.faqReadableAnswer',
        'Supported PNG, JPEG, GIF, WebP, AVIF, and HEIF fields are shown, including opaque MakerNote bytes.',
      ),
    },
    {
      question: t('viewer.faqEdit', 'Can every format be edited?'),
      answer: t(
        'viewer.faqEditAnswer',
        'No. EXIF field editing is verified for JPEG files only, and unselected fields remain unchanged.',
      ),
    },
  ]);

  type EditKey = Exclude<keyof ExifFieldEdits, 'gpsCoordinates'> | 'latitude' | 'longitude';
  const editSpecs: ReadonlyArray<{
    key: EditKey;
    name: string;
    message: string;
    label: string;
    kind?: 'number';
  }> = [
    { key: 'artist', name: 'artist', message: 'viewer.artist', label: 'Artist' },
    { key: 'copyright', name: 'copyright', message: 'viewer.copyright', label: 'Copyright' },
    {
      key: 'imageDescription',
      name: 'image-description',
      message: 'viewer.imageDescription',
      label: 'ImageDescription',
    },
    {
      key: 'userComment',
      name: 'user-comment',
      message: 'viewer.userComment',
      label: 'UserComment',
    },
    {
      key: 'dateTimeOriginal',
      name: 'date-time-original',
      message: 'viewer.dateTimeOriginal',
      label: 'DateTimeOriginal',
    },
    { key: 'software', name: 'software', message: 'viewer.software', label: 'Software' },
    { key: 'rating', name: 'rating', message: 'viewer.rating', label: 'Rating', kind: 'number' },
    { key: 'keywords', name: 'keywords', message: 'viewer.keywords', label: 'Keywords' },
    {
      key: 'orientation',
      name: 'orientation',
      message: 'viewer.orientation',
      label: 'Orientation',
      kind: 'number',
    },
    {
      key: 'latitude',
      name: 'latitude',
      message: 'viewer.latitude',
      label: 'GPS latitude',
      kind: 'number',
    },
    {
      key: 'longitude',
      name: 'longitude',
      message: 'viewer.longitude',
      label: 'GPS longitude',
      kind: 'number',
    },
  ];
  let fileName = $state(''),
    error = $state(''),
    status = $state('');
  let tags = $state<readonly MetadataTag[]>([]),
    inputBytes = $state<Uint8Array>();
  let canEdit = $state(false);
  let editOptions = $state<MetadataEditOptions>(MetadataEditOptionsSchema.parse({}));
  const editDescriptions = $derived(localizeOptions(locale, metadataEditOptionDescriptions));
  const controlValues = $derived(
    Object.fromEntries(
      editSpecs.flatMap((spec) => [
        [`metadata.edit.${spec.key}.enabled`, editOptions[spec.key].enabled],
        [`metadata.edit.${spec.key}.value`, editOptions[spec.key].value],
      ]),
    ),
  );

  function setEditControl(path: string, value: unknown) {
    const match = /^metadata\.edit\.([^.]+)\.(enabled|value)$/u.exec(path);
    if (!match) return;
    const key = match[1] as EditKey;
    if (!editSpecs.some((spec) => spec.key === key)) return;
    editOptions = {
      ...editOptions,
      [key]: {
        ...editOptions[key],
        [match[2]!]: match[2] === 'enabled' ? Boolean(value) : String(value),
      },
    };
  }
  async function inspect(file: File | undefined) {
    fileName = file?.name ?? '';
    tags = [];
    error = '';
    status = t('viewer.inspecting', 'Extracting image metadata...');
    inputBytes = undefined;
    canEdit = false;
    editOptions = MetadataEditOptionsSchema.parse({});
    if (!file) return;
    try {
      inputBytes = new Uint8Array(await file.arrayBuffer());
      tags = withTypedEngineErrors(
        t('viewer.inspectFailure', 'Metadata inspection failed'),
        t(
          'viewer.inspectRemedy',
          'Choose a valid PNG, JPEG, GIF, WebP, AVIF, or HEIF file and try again.',
        ),
        () => readContainerMetadata(inputBytes!),
      ).tags;
      if (/\.jpe?g$/iu.test(file.name)) {
        canEdit = true;
        for (const spec of editSpecs) {
          const namespace = spec.key === 'latitude' || spec.key === 'longitude' ? 'GPS' : 'EXIF';
          const field = tags.find((tag) => tag.namespace === namespace && tag.name === spec.name);
          if (!field) continue;
          editOptions = {
            ...editOptions,
            [spec.key]: {
              ...editOptions[spec.key],
              value: spec.key === 'userComment' || spec.key === 'keywords' ? '' : field.value,
            },
          };
        }
      }
      // Only show success when metadata was actually extracted; otherwise show empty state
      if (tags.length > 0) {
        status = t('viewer.metadataReady', 'Image metadata extracted successfully.');
      } else {
        status = '';
      }
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : t('viewer.inspectUnable', 'This local metadata reader could not inspect the file.');
      status = t('viewer.inspectionFailed', 'Failed to extract image metadata. Please try again.');
    }
  }
  function saveEdits() {
    error = '';
    status = '';
    const selected = editSpecs.filter((spec) => editOptions[spec.key].enabled);
    if (!inputBytes || selected.length === 0) {
      const reason = {
        kind: 'internal',
        detail: t('viewer.editFailure', 'EXIF editing failed'),
        remedy: t('viewer.selectField', 'Select at least one existing EXIF field to edit.'),
      } satisfies EngineError;
      error = `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`;
      return;
    }
    try {
      const parsed = withTypedEngineErrors(
        t('viewer.editFailure', 'EXIF editing failed'),
        t(
          'viewer.editRemedy',
          'Select existing fields with valid values, or use Metadata Remover to strip the metadata.',
        ),
        () => MetadataEditOptionsSchema.parse(editOptions),
      );
      const edits: Record<string, unknown> = {};
      for (const { key } of selected) {
        if (key === 'latitude' || key === 'longitude') continue;
        edits[key] =
          key === 'rating' || key === 'orientation' ? Number(parsed[key].value) : parsed[key].value;
      }
      if (parsed.latitude.enabled && parsed.longitude.enabled) {
        edits.gpsCoordinates = {
          latitude: Number(parsed.latitude.value),
          longitude: Number(parsed.longitude.value),
        };
      }
      const output = withTypedEngineErrors(
        t('viewer.editFailure', 'EXIF editing failed'),
        t(
          'viewer.editRemedy',
          'Select existing fields with valid values, or use Metadata Remover to strip the metadata.',
        ),
        () => editJpegExifFields(inputBytes!, edits as ExifFieldEdits),
      );
      const url = URL.createObjectURL(new Blob([output], { type: 'image/jpeg' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${fileName.replace(/\.[^.]+$/u, '')}-metadata-edited.jpg`;
      download.click();
      URL.revokeObjectURL(url);
      status =
        selected.length === 1
          ? t(
              'viewer.editedOne',
              'Edited 1 existing EXIF field locally; all other bytes were preserved.',
            )
          : t(
              'viewer.editedMany',
              'Edited {value} existing EXIF fields locally; all other bytes were preserved.',
              selected.length,
            );
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : t('viewer.editUnable', 'Unable to edit these EXIF fields.');
    }
  }
</script>

<main
  class="exif-viewer"
  lang={locale === 'en-XA' ? 'en-XA' : locale}
  dir={locale === 'ar' ? 'rtl' : 'ltr'}
>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('viewer.back', '← Convert')}</a>

  <header class="exif-header">
    <h1>{t('viewer.title', 'Metadata Viewer')}</h1>
    <p class="exif-description">
      {t(
        'viewer.description',
        'Your file stays in this browser. PNG, JPEG, GIF, WebP, AVIF, and HEIF metadata markers are read locally.',
      )}
    </p>
  </header>

  <section class="exif-upload-section">
    <div class="exif-card">
      <div class="exif-dropzone">
        <label for="metadata-file-input">
          <span class="exif-dropzone-label">{t('viewer.choose', 'Choose an image')}</span>
          <input
            id="metadata-file-input"
            aria-label={t('viewer.choose', 'Choose an image')}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/heif"
            onchange={(event) => void inspect(event.currentTarget.files?.[0])}
          />
        </label>
        {#if fileName}
          <div class="exif-file-selected">
            <span class="exif-file-icon">📷</span>
            <span class="exif-file-name">{fileName}</span>
          </div>
        {/if}
      </div>
    </div>
  </section>

  {#if error}
    <div class="exif-error" role="alert">{error}</div>
  {:else if status}
    <div class="exif-status" role="status">{status}</div>
  {/if}

  {#if fileName && tags.length === 0}
    <div class="exif-empty" role="status">
      {t('viewer.none', 'No readable metadata was found.')}
    </div>
  {/if}

  {#if tags.length}
    <section class="exif-metadata-section">
      <div class="exif-card">
        <h2 class="exif-section-title">{t('viewer.metadata', 'Metadata Fields')}</h2>
        <div class="exif-metadata-grid">
          {#each tags as tag (`${tag.namespace}:${tag.name}:${tag.value}`)}
            <div class="exif-metadata-row">
              <span class="exif-metadata-namespace">{tag.namespace}</span>
              <span class="exif-metadata-field">{tag.name}</span>
              <span class="exif-metadata-value">{tag.value}</span>
            </div>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  {#if canEdit}
    <section class="exif-edit-section">
      <div class="exif-card">
        <h2 id="exif-edit-heading" class="exif-section-title">
          {t('viewer.editHeading', 'Add or edit EXIF fields')}
        </h2>
        <p class="exif-edit-description">
          {t(
            'viewer.editDescription',
            'Choose fields to add or change. Longer values and new fields are appended through a rebuilt EXIF structure; unchecked metadata remains untouched.',
          )}
        </p>
        <GeneratedControls
          descriptions={editDescriptions}
          values={controlValues}
          onChange={setEditControl}
          {locale}
        />
        <button type="button" class="exif-download-button" onclick={saveEdits}
          >{t('viewer.download', 'Download edited JPEG')}</button
        >
      </div>
    </section>
  {/if}

  <ToolPageCompletion
    {locale}
    route="exif-viewer"
    {title}
    description={metaDescription}
    formatNote={t(
      'viewer.formatNote',
      'The viewer reads EXIF, IPTC, XMP, ICC, and other supported container fields. EXIF editing is currently limited to JPEG.',
    )}
    faqs={seoFaqs}
  />
</main>

<style>
  .exif-viewer {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--sp-6) var(--sp-4) var(--sp-12);
    min-height: 100vh;
  }

  /* Header */
  .exif-header {
    margin-bottom: var(--sp-10);
  }

  .exif-header h1 {
    font-size: clamp(1.75rem, 4vw, 2.25rem);
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0 0 var(--sp-2) 0;
    line-height: var(--lh-tight);
  }

  .exif-description {
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    line-height: var(--lh-relaxed);
    margin: 0;
    max-width: 640px;
  }

  /* Upload section */
  .exif-upload-section {
    margin-bottom: var(--sp-8);
  }

  .exif-dropzone {
    border: 1px solid var(--c-border);
    border-radius: var(--r-lg);
    padding: var(--sp-6);
    background: var(--c-surface);
    position: relative;
    min-height: 160px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    cursor: pointer;
    transition:
      border-color var(--dur-fast) var(--ease-out),
      background-color var(--dur-fast) var(--ease-out);
  }

  .exif-dropzone-label {
    display: block;
    font-size: var(--fs-md);
    font-weight: 500;
    margin-bottom: var(--sp-2);
    color: var(--c-text);
  }

  .exif-dropzone input[type='file'] {
    display: none;
  }

  .exif-dropzone:hover {
    border-color: var(--c-accent);
    background-color: var(--c-accent-subtle);
  }

  .exif-file-selected {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-top: var(--sp-4);
    padding: var(--sp-2) var(--sp-4);
    background: var(--c-accent-subtle);
    border-radius: var(--r-md);
    font-size: var(--fs-sm);
    color: var(--c-text);
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .exif-file-icon {
    font-size: var(--fs-md);
    flex-shrink: 0;
  }

  .exif-file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Cards */
  .exif-card {
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--r-lg);
    padding: var(--sp-6);
    margin-bottom: var(--sp-6);
  }

  /* Status / Error */
  .exif-error {
    background: oklch(98% 0.02 25);
    border: 1px solid oklch(85% 0.04 25);
    color: var(--c-danger);
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-md);
    margin-bottom: var(--sp-4);
    font-size: var(--fs-sm);
    line-height: var(--lh-relaxed);
  }

  .exif-status {
    background: oklch(97% 0.03 145);
    border: 1px solid oklch(90% 0.04 145);
    color: var(--c-success);
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-md);
    margin-bottom: var(--sp-4);
    font-size: var(--fs-sm);
    line-height: var(--lh-relaxed);
  }

  .exif-empty {
    text-align: center;
    color: var(--c-text-muted);
    padding: var(--sp-6);
    background: var(--c-surface);
    border: 1px dashed var(--c-border);
    border-radius: var(--r-md);
    margin-bottom: var(--sp-6);
  }

  /* Metadata section */
  .exif-metadata-section {
    margin-bottom: var(--sp-8);
  }

  .exif-section-title {
    font-size: var(--fs-lg);
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0 0 var(--sp-4) 0;
    color: var(--c-text);
  }

  .exif-metadata-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--sp-3);
  }

  .exif-metadata-row {
    padding: var(--sp-3) var(--sp-4);
    background: var(--c-bg);
    border: 1px solid var(--c-border);
    border-radius: var(--r-md);
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .exif-metadata-namespace {
    font-size: var(--fs-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--c-text-subtle);
  }

  .exif-metadata-field {
    font-size: var(--fs-sm);
    font-weight: 500;
    color: var(--c-text);
  }

  .exif-metadata-value {
    font-size: var(--fs-sm);
    color: var(--c-text-muted);
    word-break: break-all;
    font-family: var(--font-mono);
  }

  /* Edit section */
  .exif-edit-section {
    margin-bottom: var(--sp-8);
  }

  .exif-edit-description {
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    line-height: var(--lh-relaxed);
    margin: 0 0 var(--sp-4) 0;
    max-width: 640px;
  }

  .exif-download-button {
    margin-top: var(--sp-2);
    background: var(--c-accent);
    color: var(--c-on-accent);
    border: none;
    border-radius: var(--r-md);
    padding: var(--sp-2) var(--sp-4);
    font-size: var(--fs-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease-out);
  }

  .exif-download-button:hover:not(:disabled) {
    background: var(--c-accent-hover);
  }

  .exif-download-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .exif-download-button:focus-visible {
    outline: 2px solid var(--c-accent);
    outline-offset: 2px;
  }

  /* Responsive */
  @media (max-width: 767px) {
    .exif-viewer {
      padding: var(--sp-4) var(--sp-3) var(--sp-8);
    }

    .exif-card {
      padding: var(--sp-4);
    }

    .exif-dropzone {
      padding: var(--sp-4);
      min-height: 140px;
    }

    .exif-metadata-grid {
      grid-template-columns: 1fr;
    }

    .exif-metadata-row {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
    }

    .exif-metadata-namespace,
    .exif-metadata-field,
    .exif-metadata-value {
      font-size: var(--fs-xs);
    }
  }
</style>
