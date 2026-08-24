<script lang="ts">
  import {
    MetadataEditOptionsSchema,
    editJpegExifFields,
    engineErrorMessage,
    isEngineError,
    metadataEditOptionDescriptions,
    readContainerMetadata,
    withTypedEngineErrors,
    type EngineError,
    type ExifFieldEdits,
    type MetadataEditOptions,
    type MetadataTag,
  } from '@complianttools/image-engine';
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
    status = '';
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
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : t('viewer.inspectUnable', 'This local metadata reader could not inspect the file.');
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

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/convert' : `/${locale}/convert`}>{t('viewer.back', '← Convert')}</a>
  <h1>{t('viewer.title', 'Metadata Viewer')}</h1>
  <p>
    {t(
      'viewer.description',
      'Your file stays in this browser. PNG, JPEG, GIF, WebP, AVIF, and HEIF metadata markers are read locally.',
    )}
  </p>
  <label
    >{t('viewer.choose', 'Choose an image')}
    <input
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/heif"
      onchange={(event) => void inspect(event.currentTarget.files?.[0])}
    /></label
  >
  {#if fileName}<h2>{fileName}</h2>{/if}
  {#if error}<p role="alert">{error}</p>{:else if status}<p role="status">
      {status}
    </p>{:else if fileName && tags.length === 0}<p>
      {t('viewer.none', 'No readable metadata was found.')}
    </p>{/if}
  {#if tags.length}<table>
      <thead
        ><tr
          ><th>{t('viewer.namespace', 'Namespace')}</th><th>{t('viewer.field', 'Field')}</th><th
            >{t('viewer.value', 'Value')}</th
          ></tr
        ></thead
      ><tbody
        >{#each tags as tag (`${tag.namespace}:${tag.name}:${tag.value}`)}<tr
            ><td>{tag.namespace}</td><td>{tag.name}</td><td>{tag.value}</td></tr
          >{/each}</tbody
      >
    </table>{/if}
  {#if canEdit}
    <section aria-labelledby="edit-fields-heading">
      <h2 id="edit-fields-heading">{t('viewer.editHeading', 'Add or edit EXIF fields')}</h2>
      <p>
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
      <button type="button" onclick={saveEdits}
        >{t('viewer.download', 'Download edited JPEG')}</button
      >
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
