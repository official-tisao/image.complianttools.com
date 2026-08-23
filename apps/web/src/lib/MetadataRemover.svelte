<script lang="ts">
  import {
    MetadataRemovalOptionsSchema,
    MetadataRemovalPresetSchema,
    engineErrorMessage,
    isEngineError,
    metadataRemovalOptionDescriptions,
    stripGifMetadata,
    stripJpegExifTags,
    stripJpegGpsMetadata,
    stripJpegMakerNotes,
    stripJpegMetadata,
    stripJpegMetadataExceptOrientationCopyright,
    stripPngMetadata,
    stripWebpMetadata,
    withTypedEngineErrors,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  let { locale = 'en' }: { locale?: Locale } = $props();
  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const localizedPath = $derived(locale === 'en' ? '/remove-exif' : `/${locale}/remove-exif`);

  let fileName = $state('');
  let status = $state('');
  let error = $state('');
  let preset = $state(MetadataRemovalOptionsSchema.parse({}).preset);
  let selectedTags = $state<number[]>([]);
  const controlValues = $derived({ 'metadata.preset': preset });
  const customFields = [
    [0x013b, 'remover.artist', 'Artist'],
    [0x8298, 'remover.copyright', 'Copyright'],
    [0x010e, 'remover.descriptionField', 'ImageDescription'],
    [0x9286, 'remover.comment', 'UserComment'],
    [0x9003, 'remover.date', 'DateTimeOriginal'],
    [0x0131, 'remover.software', 'Software'],
    [0x4746, 'remover.rating', 'Rating'],
    [0x9c9e, 'remover.keywords', 'Keywords'],
    [0x8825, 'remover.gps', 'GPS coordinates'],
    [0x0112, 'remover.orientation', 'Orientation'],
    [0x927c, 'remover.makerNotes', 'MakerNotes'],
  ] as const;

  function selectTag(tag: number, checked: boolean) {
    selectedTags = checked
      ? [...new Set([...selectedTags, tag])]
      : selectedTags.filter((value) => value !== tag);
  }

  function setControl(path: string, value: unknown) {
    if (path !== 'metadata.preset') return;
    preset = MetadataRemovalPresetSchema.parse(value);
  }

  async function strip(file: File | undefined) {
    fileName = file?.name ?? '';
    status = '';
    error = '';
    if (!file) return;
    try {
      const options = MetadataRemovalOptionsSchema.parse({ preset, selectedTags });
      const isPng = file.type === 'image/png' || /\.png$/iu.test(file.name);
      const isWebp = file.type === 'image/webp' || /\.webp$/iu.test(file.name);
      const isGif = file.type === 'image/gif' || /\.gif$/iu.test(file.name);
      const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/iu.test(file.name);
      const input = await file.arrayBuffer();
      const output = withTypedEngineErrors(
        t('remover.failure', 'Metadata removal failed'),
        t(
          'remover.remedy',
          'Choose a valid PNG, JPEG, GIF, or WebP file, or select Keep everything.',
        ),
        () => {
          if (
            ['gps', 'except-orientation-copyright', 'maker-notes', 'custom'].includes(
              options.preset,
            ) &&
            !isJpeg
          )
            throw new Error(
              t(
                'remover.selectiveJpeg',
                'This selective metadata preset is currently verified for JPEG files only.',
              ),
            );
          return options.preset === 'keep'
            ? new Uint8Array(input)
            : isPng
              ? stripPngMetadata(input)
              : isWebp
                ? stripWebpMetadata(input)
                : isGif
                  ? stripGifMetadata(input)
                  : options.preset === 'gps'
                    ? stripJpegGpsMetadata(input)
                    : options.preset === 'except-orientation-copyright'
                      ? stripJpegMetadataExceptOrientationCopyright(input)
                      : options.preset === 'maker-notes'
                        ? stripJpegMakerNotes(input)
                        : options.preset === 'custom'
                          ? stripJpegExifTags(input, options.selectedTags)
                          : stripJpegMetadata(input);
        },
      );
      const extension = isPng ? 'png' : isWebp ? 'webp' : isGif ? 'gif' : 'jpg';
      const url = URL.createObjectURL(
        new Blob([output], {
          type: isPng ? 'image/png' : isWebp ? 'image/webp' : isGif ? 'image/gif' : 'image/jpeg',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${file.name.replace(/\.[^.]+$/u, '')}-stripped.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
      status =
        options.preset === 'keep'
          ? t('remover.kept', 'Kept every byte locally ({value} bytes).', output.byteLength)
          : `${t('remover.removed', 'Removed metadata locally')}: ${file.size} bytes → ${output.byteLength} bytes.`;
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} ${t('error.remedyLabel', 'Remedy')}: ${reason.remedy}`
        : t('remover.unable', 'Unable to remove metadata from this file.');
    }
  }
</script>

<svelte:head>
  <title>{t('remover.title', 'Metadata Remover')} — Image Compliant Tools</title>
  <meta
    name="description"
    content={t(
      'remover.metaDescription',
      'Remove supported PNG, JPEG, GIF, and WebP metadata locally in your browser.',
    )}
  />
  <link rel="canonical" href={`https://image.complianttools.com${localizedPath}`} />
</svelte:head>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href="/exif-viewer">{t('remover.back', '← Metadata Viewer')}</a>
  <h1>{t('remover.title', 'Metadata Remover')}</h1>
  <p>
    {t(
      'remover.description',
      'PNG, JPEG, GIF, and WebP metadata is stripped locally. Other format-specific stripping options are not offered until they are implemented and verified.',
    )}
  </p>
  <GeneratedControls
    descriptions={localizeOptions(locale, metadataRemovalOptionDescriptions)}
    values={controlValues}
    onChange={setControl}
    {locale}
  />
  {#if preset === 'custom'}
    <fieldset>
      <legend>{t('remover.fields', 'EXIF fields to remove')}</legend>
      {#each customFields as [tag, key, fallback] (tag)}
        <label
          ><input
            type="checkbox"
            checked={selectedTags.includes(tag)}
            onchange={(event) => selectTag(tag, event.currentTarget.checked)}
          />
          {t(key, fallback)}</label
        >
      {/each}
    </fieldset>
  {/if}
  <label>
    {t('remover.choose', 'Choose a PNG, JPEG, GIF, or WebP')}
    <input
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      onchange={(event) => void strip(event.currentTarget.files?.[0])}
    />
  </label>
  {#if fileName}<p>{fileName}</p>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
