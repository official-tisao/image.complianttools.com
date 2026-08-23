<script lang="ts">
  import {
    CbzToolOptionsSchema,
    cbzToolOptionDescriptions,
    createPdfFromPngPages,
    decodeCbz,
    decodeWithTypedErrors,
    encodeCbz,
    engineErrorMessage,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  let status = $state('');
  let error = $state('');
  let options = $state(CbzToolOptionsSchema.parse({}));
  const controlValues = $derived({ 'cbz.operation': options.operation });
  type LocalBlobPart = NonNullable<ConstructorParameters<typeof globalThis.Blob>[0]>[number];

  function setControl(path: string, value: unknown) {
    if (path !== 'cbz.operation') return;
    const parsed = CbzToolOptionsSchema.safeParse({ operation: value });
    if (parsed.success) options = parsed.data;
  }

  function downloadBytes(bytes: LocalBlobPart, type: string, name: string) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const download = document.createElement('a');
    download.href = url;
    download.download = name;
    download.click();
    URL.revokeObjectURL(url);
  }

  function assertZipComic(bytes: Uint8Array) {
    if (new globalThis.TextDecoder('latin1').decode(bytes.subarray(0, 4)) === 'Rar!')
      throw new Error(
        'RAR-backed CBR extraction is unavailable because the cleared local libarchive RAR path is still unresolved. Convert the archive to CBZ/ZIP first.',
      );
  }

  async function pageAsPng(page: { name: string; bytes: Uint8Array }) {
    const bitmap = await createImageBitmap(new Blob([page.bytes]));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser cannot create a local canvas for a comic page.');
      context.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error(`Unable to encode ${page.name}.`))),
          'image/png',
        ),
      );
      return {
        pngBytes: new Uint8Array(await blob.arrayBuffer()),
        width: bitmap.width,
        height: bitmap.height,
      };
    } finally {
      bitmap.close();
    }
  }

  async function convert(files: readonly File[]) {
    status = '';
    error = '';
    if (!files?.length) return;
    try {
      if (options.operation !== 'create') {
        const file = files[0]!;
        const source = new Uint8Array(await file.arrayBuffer());
        assertZipComic(source);
        const pages = await decodeWithTypedErrors('cbz', () => decodeCbz(source));
        if (options.operation === 'extract') {
          for (const page of pages)
            downloadBytes(page.bytes, 'application/octet-stream', page.name);
          status = `Extracted ${pages.length} naturally ordered image page${pages.length === 1 ? '' : 's'} locally.`;
          return;
        }
        const pdf = await createPdfFromPngPages(await Promise.all(pages.map(pageAsPng)));
        downloadBytes(pdf, 'application/pdf', `${file.name.replace(/\.(?:cbz|zip)$/iu, '')}.pdf`);
        status = `Converted ${pages.length} naturally ordered comic page${pages.length === 1 ? '' : 's'} to PDF locally.`;
        return;
      }
      const pages = await Promise.all(
        [...files].map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      );
      const output = encodeCbz(pages);
      downloadBytes(output, 'application/vnd.comicbook+zip', 'comic.cbz');
      status = `Packed ${pages.length} image page${pages.length === 1 ? '' : 's'} into a CBZ locally.`;
    } catch (reason) {
      error = engineErrorMessage(reason);
    }
  }
</script>

<svelte:head>
  <title>CBZ Comic Converter — Image Compliant Tools</title>
  <meta
    name="description"
    content="Create or extract CBZ/ZIP comics and convert their image pages to PDF locally."
  />
  <link rel="canonical" href="https://image.complianttools.com/cbz-converter" />
</svelte:head>

<main>
  <a href="/convert">← Convert</a>
  <h1>CBZ Comic Converter</h1>
  <p>
    Create a CBZ from images, extract a CBZ/ZIP image set, or convert its naturally ordered pages to
    PDF locally. RAR-backed CBR remains explicitly unavailable; no page is uploaded.
  </p>
  <GeneratedControls
    descriptions={cbzToolOptionDescriptions}
    values={controlValues}
    onChange={setControl}
  />
  <label>
    {options.operation === 'create'
      ? 'Choose comic page images'
      : 'Choose a CBZ, ZIP, or CBR archive'}
    <input
      type="file"
      multiple={options.operation === 'create'}
      accept={options.operation === 'create'
        ? 'image/avif,image/gif,image/jpeg,image/jxl,image/png,image/webp'
        : '.cbz,.zip,.cbr,application/zip,application/vnd.comicbook+zip'}
      onchange={(event) => void convert([...(event.currentTarget.files ?? [])])}
    />
  </label>
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
