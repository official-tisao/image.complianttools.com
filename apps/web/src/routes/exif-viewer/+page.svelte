<script lang="ts">
  import {
    editJpegExifFields,
    readContainerMetadata,
    type ExifFieldEdits,
    type MetadataTag,
  } from '@complianttools/image-engine';

  type EditKey = Exclude<keyof ExifFieldEdits, 'gpsCoordinates'> | 'latitude' | 'longitude';
  const editSpecs: ReadonlyArray<{ key: EditKey; name: string; label: string; kind?: 'number' }> = [
    { key: 'artist', name: 'artist', label: 'Artist' },
    { key: 'copyright', name: 'copyright', label: 'Copyright' },
    { key: 'imageDescription', name: 'image-description', label: 'ImageDescription' },
    { key: 'userComment', name: 'user-comment', label: 'UserComment' },
    { key: 'dateTimeOriginal', name: 'date-time-original', label: 'DateTimeOriginal' },
    { key: 'software', name: 'software', label: 'Software' },
    { key: 'rating', name: 'rating', label: 'Rating', kind: 'number' },
    { key: 'keywords', name: 'keywords', label: 'Keywords' },
    { key: 'orientation', name: 'orientation', label: 'Orientation', kind: 'number' },
    { key: 'latitude', name: 'latitude', label: 'GPS latitude', kind: 'number' },
    { key: 'longitude', name: 'longitude', label: 'GPS longitude', kind: 'number' },
  ];
  let fileName = $state(''),
    error = $state(''),
    status = $state('');
  let tags = $state<readonly MetadataTag[]>([]),
    inputBytes = $state<Uint8Array>();
  let available = $state<EditKey[]>([]),
    selected = $state<EditKey[]>([]);
  let values = $state<Record<EditKey, string>>({
    artist: '',
    copyright: '',
    imageDescription: '',
    userComment: '',
    dateTimeOriginal: '',
    software: '',
    rating: '',
    keywords: '',
    orientation: '',
    latitude: '',
    longitude: '',
  });

  function choose(key: EditKey, checked: boolean) {
    selected = checked
      ? [...new Set([...selected, key])]
      : selected.filter((value) => value !== key);
  }
  async function inspect(file: File | undefined) {
    fileName = file?.name ?? '';
    tags = [];
    error = '';
    status = '';
    inputBytes = undefined;
    available = [];
    selected = [];
    if (!file) return;
    try {
      inputBytes = new Uint8Array(await file.arrayBuffer());
      tags = readContainerMetadata(inputBytes).tags;
      if (/\.jpe?g$/iu.test(file.name)) {
        available = editSpecs.map((spec) => spec.key);
        for (const spec of editSpecs) {
          const namespace = spec.key === 'latitude' || spec.key === 'longitude' ? 'GPS' : 'EXIF';
          const field = tags.find((tag) => tag.namespace === namespace && tag.name === spec.name);
          if (!field) continue;
          values[spec.key] =
            spec.key === 'userComment' || spec.key === 'keywords' ? '' : field.value;
        }
      }
    } catch (reason) {
      error =
        reason instanceof Error
          ? reason.message
          : 'This local metadata reader could not inspect the file.';
    }
  }
  function saveEdits() {
    error = '';
    status = '';
    if (!inputBytes || selected.length === 0) {
      error = 'Select at least one existing EXIF field to edit.';
      return;
    }
    try {
      const edits: Record<string, unknown> = {};
      for (const key of selected) {
        if (key === 'latitude' || key === 'longitude') continue;
        edits[key] = key === 'rating' || key === 'orientation' ? Number(values[key]) : values[key];
      }
      if (selected.includes('latitude') || selected.includes('longitude')) {
        if (!selected.includes('latitude') || !selected.includes('longitude'))
          throw new Error(
            'Select both GPS latitude and longitude when adding or editing coordinates.',
          );
        edits.gpsCoordinates = {
          latitude: Number(values.latitude),
          longitude: Number(values.longitude),
        };
      }
      const output = editJpegExifFields(inputBytes, edits as ExifFieldEdits);
      const url = URL.createObjectURL(new Blob([output], { type: 'image/jpeg' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `${fileName.replace(/\.[^.]+$/u, '')}-metadata-edited.jpg`;
      download.click();
      URL.revokeObjectURL(url);
      status = `Edited ${selected.length} existing EXIF field${selected.length === 1 ? '' : 's'} locally; all other bytes were preserved.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to edit these EXIF fields.';
    }
  }
</script>

<svelte:head
  ><title>Metadata Viewer — Image Compliant Tools</title><meta
    name="description"
    content="Read and edit supported image metadata locally in your browser."
  /><link rel="canonical" href="https://image.complianttools.com/exif-viewer" /></svelte:head
>
<main>
  <a href="/convert">← Convert</a>
  <h1>Metadata Viewer</h1>
  <p>
    Your file stays in this browser. PNG, JPEG, GIF, WebP, AVIF, and HEIF metadata markers are read
    locally.
  </p>
  <label
    >Choose an image <input
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/heif"
      onchange={(event) => void inspect(event.currentTarget.files?.[0])}
    /></label
  >
  {#if fileName}<h2>{fileName}</h2>{/if}
  {#if error}<p role="alert">{error}</p>{:else if status}<p role="status">
      {status}
    </p>{:else if fileName && tags.length === 0}<p>No readable metadata was found.</p>{/if}
  {#if tags.length}<table>
      <thead><tr><th>Namespace</th><th>Field</th><th>Value</th></tr></thead><tbody
        >{#each tags as tag (`${tag.namespace}:${tag.name}:${tag.value}`)}<tr
            ><td>{tag.namespace}</td><td>{tag.name}</td><td>{tag.value}</td></tr
          >{/each}</tbody
      >
    </table>{/if}
  {#if available.length}
    <section aria-labelledby="edit-fields-heading">
      <h2 id="edit-fields-heading">Add or edit EXIF fields</h2>
      <p>
        Choose fields to add or change. Longer values and new fields are appended through a rebuilt
        EXIF structure; unchecked metadata remains untouched.
      </p>
      {#each editSpecs.filter((spec) => available.includes(spec.key)) as spec}
        <label
          ><input
            type="checkbox"
            checked={selected.includes(spec.key)}
            onchange={(event) => choose(spec.key, event.currentTarget.checked)}
          />
          {spec.label}
          <input
            type={spec.kind === 'number' ? 'number' : 'text'}
            aria-label={spec.label}
            bind:value={values[spec.key]}
            disabled={!selected.includes(spec.key)}
          />
        </label>
      {/each}
      <button type="button" onclick={saveEdits}>Download edited JPEG</button>
    </section>
  {/if}
</main>
