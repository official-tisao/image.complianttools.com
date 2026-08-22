<script lang="ts">
  import { encodeCbz } from '@complianttools/image-engine';

  let status = $state('');
  let error = $state('');

  async function create(files: FileList | null) {
    status = '';
    error = '';
    if (!files?.length) return;
    try {
      const pages = await Promise.all(
        [...files].map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      );
      const output = encodeCbz(pages);
      const url = URL.createObjectURL(
        new Blob([output], { type: 'application/vnd.comicbook+zip' }),
      );
      const download = document.createElement('a');
      download.href = url;
      download.download = 'comic.cbz';
      download.click();
      URL.revokeObjectURL(url);
      status = `Packed ${pages.length} image page${pages.length === 1 ? '' : 's'} into a CBZ locally.`;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to create this CBZ archive.';
    }
  }
</script>

<svelte:head>
  <title>CBZ Comic Converter — Image Compliant Tools</title>
  <meta
    name="description"
    content="Pack naturally named image pages into a CBZ comic archive locally."
  />
  <link rel="canonical" href="https://image.complianttools.com/cbz-converter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>CBZ Comic Converter</h1>
  <p>
    Select image pages to create a CBZ archive locally. Numbered filenames determine reading order;
    no page is uploaded.
  </p>
  <label>
    Choose comic page images
    <input
      type="file"
      multiple
      accept="image/avif,image/gif,image/jpeg,image/jxl,image/png,image/webp"
      onchange={(event) => void create(event.currentTarget.files)}
    />
  </label>
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
