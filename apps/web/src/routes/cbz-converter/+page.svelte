<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    CbzToolOptionsSchema,
    cbzToolOptionDescriptions,
    codecUnavailableError,
    createPdfFromPngPages,
    decodeCbz,
    encodeCbz,
    engineErrorMessage,
    isEngineError,
    withTypedEngineErrorsAsync,
    type ComicPage,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  type LocalBlobPart = NonNullable<ConstructorParameters<typeof globalThis.Blob>[0]>[number];
  let status = $state('');
  let error = $state('');
  let files = $state<readonly File[]>([]);
  let output = $state<Uint8Array>();
  let outputName = $state('');
  let outputType = $state('');
  let extractedPages = $state<readonly ComicPage[]>([]);
  let previewUrl = $state('');
  let options = $state(CbzToolOptionsSchema.parse({}));
  const controlValues = $derived({ 'cbz.operation': options.operation });
  const previewNames = $derived(
    options.operation === 'create' && output ? decodeCbz(output).map((page) => page.name) : [],
  );

  onDestroy(() => URL.revokeObjectURL(previewUrl));

  function clearOutput() {
    output = undefined;
    outputName = '';
    outputType = '';
    extractedPages = [];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }
  function setControl(path: string, value: unknown) {
    if (path !== 'cbz.operation') return;
    const parsed = CbzToolOptionsSchema.safeParse({ operation: value });
    if (parsed.success) {
      options = parsed.data;
      files = [];
      status = '';
      error = '';
      clearOutput();
    }
  }
  function selectFiles(selected: readonly File[]) {
    files = selected;
    status = selected.length
      ? `${selected.length} ${selected.length === 1 ? 'file' : 'files'} ready.`
      : '';
    error = '';
    clearOutput();
  }
  async function pageAsPng(page: ComicPage) {
    const bitmap = await createImageBitmap(new Blob([page.bytes as LocalBlobPart]));
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
  async function generate() {
    status = '';
    error = '';
    clearOutput();
    if (files.length === 0) {
      error = 'Choose input files first.';
      return;
    }
    try {
      await withTypedEngineErrorsAsync(
        'Comic conversion failed',
        'Choose valid image pages or a bounded CBZ/ZIP archive and try again.',
        async () => {
          if (options.operation === 'create') {
            const pages = await Promise.all(
              files.map(async (file) => ({
                name: file.name,
                bytes: new Uint8Array(await file.arrayBuffer()),
              })),
            );
            output = new Uint8Array(encodeCbz(pages));
            outputName = 'comic.cbz';
            outputType = 'application/vnd.comicbook+zip';
            status = `Packed ${pages.length} image page${pages.length === 1 ? '' : 's'} into a CBZ locally.`;
            return;
          }
          const file = files[0]!;
          const source = new Uint8Array(await file.arrayBuffer());
          if (new globalThis.TextDecoder('latin1').decode(source.subarray(0, 4)) === 'Rar!')
            throw codecUnavailableError('cbr', 'decode');
          const pages = decodeCbz(source);
          if (options.operation === 'extract') {
            extractedPages = pages;
            status = `Prepared ${pages.length} naturally ordered image page${pages.length === 1 ? '' : 's'} locally.`;
            return;
          }
          output = new Uint8Array(
            await createPdfFromPngPages(await Promise.all(pages.map(pageAsPng))),
          );
          outputName = `${file.name.replace(/\.(?:cbz|zip)$/iu, '')}.pdf`;
          outputType = 'application/pdf';
          previewUrl = URL.createObjectURL(
            new Blob([output as LocalBlobPart], { type: outputType }),
          );
          status = `Converted ${pages.length} naturally ordered comic page${pages.length === 1 ? '' : 's'} to PDF locally.`;
        },
      );
    } catch (reason) {
      error = isEngineError(reason)
        ? `${engineErrorMessage(reason)} Remedy: ${reason.remedy}`
        : 'Unable to convert this comic archive.';
    }
  }
  function download(bytes: Uint8Array, type: string, name: string) {
    const url = URL.createObjectURL(new Blob([bytes as LocalBlobPart], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function downloadOutput() {
    if (output) download(output, outputType, outputName);
  }
  function downloadPages() {
    for (const page of extractedPages) download(page.bytes, 'application/octet-stream', page.name);
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
      onchange={(event) => selectFiles([...(event.currentTarget.files ?? [])])}
    />
  </label>
  <button type="button" onclick={() => void generate()} disabled={files.length === 0}
    >Generate output</button
  >
  {#if output}
    <button type="button" onclick={downloadOutput}>Download {outputName}</button>
  {:else if extractedPages.length}
    <button type="button" onclick={downloadPages}>Download extracted pages</button>
  {/if}
  {#if previewNames.length}
    <section aria-labelledby="cbz-preview-heading">
      <h2 id="cbz-preview-heading">Exact CBZ page order</h2>
      <ol>
        {#each previewNames as name (name)}<li>{name}</li>{/each}
      </ol>
    </section>
  {:else if extractedPages.length}
    <section aria-labelledby="extract-preview-heading">
      <h2 id="extract-preview-heading">Exact extracted page order</h2>
      <ol>
        {#each extractedPages as page (page.name)}<li>
            {page.name} ({page.bytes.byteLength} bytes)
          </li>{/each}
      </ol>
    </section>
  {:else if previewUrl}
    <section aria-labelledby="comic-pdf-preview-heading">
      <h2 id="comic-pdf-preview-heading">Faithful exported PDF preview</h2>
      <iframe title="Comic PDF export preview" src={previewUrl}></iframe>
    </section>
  {/if}
  {#if status}<p role="status">{status}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</main>
