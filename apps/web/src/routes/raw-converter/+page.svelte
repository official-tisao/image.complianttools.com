<script lang="ts">
  import {
    RawToolOptionsSchema,
    decodeWithTypedErrors,
    developDng,
    engineErrorMessage,
    extractRawCameraPreview,
    rawToolOptionDescriptions,
  } from '@complianttools/image-engine';
  import GeneratedControls from '$lib/GeneratedControls.svelte';

  let status = $state(''),
    error = $state(''),
    previewUrl = $state(''),
    developedUrl = $state(''),
    developedDownload = $state(''),
    developedFilename = $state('developed.png');
  let options = $state(RawToolOptionsSchema.parse({}));
  const controlValues = $derived(
    Object.fromEntries(Object.entries(options).map(([key, value]) => [`raw.${key}`, value])),
  );

  function setControl(path: string, value: unknown) {
    if (!path.startsWith('raw.')) return;
    const parsed = RawToolOptionsSchema.safeParse({ ...options, [path.slice(4)]: value });
    if (parsed.success) options = parsed.data;
  }

  function replaceUrl(current: string, next: string) {
    if (current) URL.revokeObjectURL(current);
    return next;
  }
  async function canvasPng(data: Uint8ClampedArray, width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.putImageData(new ImageData(data, width, height), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The browser could not encode the developed DNG preview as PNG.');
    return blob;
  }
  async function extract(file: File | undefined) {
    status = '';
    error = '';
    previewUrl = replaceUrl(previewUrl, '');
    developedUrl = replaceUrl(developedUrl, '');
    developedDownload = replaceUrl(developedDownload, '');
    if (!file) return;
    try {
      const bytes = await file.arrayBuffer(),
        baseName = file.name.replace(/\.[^.]+$/u, '');
      const isDng = file.name.toLowerCase().endsWith('.dng');
      if (options.instantPreview) {
        try {
          const preview = await decodeWithTypedErrors('raw', () => extractRawCameraPreview(bytes));
          previewUrl = replaceUrl(
            previewUrl,
            URL.createObjectURL(new Blob([preview.bytes], { type: 'image/jpeg' })),
          );
          const download = document.createElement('a');
          download.href = previewUrl;
          download.download = `${baseName}-camera-preview.jpg`;
          download.click();
          status = `Extracted ${preview.label}. This is the camera's embedded JPEG preview, not a RAW develop.`;
        } catch (reason) {
          if (!isDng) throw reason;
          status = 'No embedded camera preview was found; continuing with the full DNG develop.';
        }
      }
      if (!isDng) {
        status = `${status ? `${status} ` : ''}Full RAW development is currently available for DNG only; this format remains camera-preview only.`;
        return;
      }
      status = `${status ? `${status} ` : ''}Developing the DNG in the background…`;
      await new Promise<void>((resolve) => globalThis.requestAnimationFrame(() => resolve()));
      const developed = await decodeWithTypedErrors('raw', () => developDng(bytes, options));
      const png = await canvasPng(developed.frames[0].data, developed.width, developed.height);
      developedUrl = replaceUrl(developedUrl, URL.createObjectURL(png));
      if (options.outputBitDepth === 16 && developed.frames[0].data16) {
        const raw16 = new Uint16Array(developed.frames[0].data16);
        developedDownload = replaceUrl(
          developedDownload,
          URL.createObjectURL(new Blob([raw16], { type: 'application/octet-stream' })),
        );
        developedFilename = `${baseName}-${developed.width}x${developed.height}-rgba16le.raw`;
      } else {
        developedDownload = replaceUrl(developedDownload, URL.createObjectURL(png));
        developedFilename = `${baseName}-developed.png`;
      }
      status = `DNG develop complete at ${options.outputBitDepth}-bit using ${options.demosaic.toUpperCase()}.`;
    } catch (reason) {
      error = engineErrorMessage(reason);
    }
  }
</script>

<svelte:head
  ><title>RAW Camera Preview and DNG Developer — Image Compliant Tools</title><meta
    name="description"
    content="Extract RAW camera previews and develop DNG files locally."
  /><link rel="canonical" href="https://image.complianttools.com/raw-converter" /></svelte:head
>
<main>
  <a href="/convert">← Convert</a>
  <h1>RAW Camera Preview and DNG Developer</h1>
  <p>
    Embedded previews are the camera's rendering, not a full RAW develop. Full development currently
    supports DNG.
  </p>
  <fieldset>
    <legend>DNG develop options</legend>
    <GeneratedControls
      descriptions={rawToolOptionDescriptions}
      values={controlValues}
      onChange={setControl}
    />
  </fieldset>
  <label
    >Choose a RAW file <input
      type="file"
      accept=".3fr,.arw,.bay,.cap,.cr2,.cr3,.crf,.crw,.cs1,.dcr,.dcs,.dng,.drf,.erf,.fff,.iiq,.k25,.kdc,.mdc,.mef,.mos,.mrw,.nef,.nrw,.orf,.pef,.ptx,.raf,.raw,.rw2,.rwl,.rwz,.sr2,.srf,.srw,.x3f"
      onchange={(event) => void extract(event.currentTarget.files?.[0])}
    /></label
  >
  {#if previewUrl}<h2>Camera preview</h2>
    <img src={previewUrl} alt="Embedded camera preview" />{/if}
  {#if developedUrl}<h2>Developed DNG preview</h2>
    <img src={developedUrl} alt="Developed DNG preview" />
    <p>
      <a href={developedDownload} download={developedFilename}
        >Download {options.outputBitDepth}-bit developed output</a
      >
    </p>{/if}
  {#if status}<p role="status">{status}</p>{/if}{#if error}<p role="alert">{error}</p>{/if}
</main>
