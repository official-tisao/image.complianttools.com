<script lang="ts">
  import {
    decodeWithTypedErrors,
    developDng,
    engineErrorMessage,
    extractRawCameraPreview,
    type DngDevelopOptions,
  } from '@complianttools/image-engine';

  let status = $state(''),
    error = $state(''),
    previewUrl = $state(''),
    developedUrl = $state(''),
    developedDownload = $state(''),
    developedFilename = $state('developed.png');
  let instantPreview = $state(true),
    temperatureKelvin = $state(6500),
    tint = $state(0),
    gamma = $state(2.2),
    exposureEv = $state(0),
    noiseReductionThreshold = $state(0),
    chromaticAberrationCorrection = $state(false);
  let demosaic = $state<NonNullable<DngDevelopOptions['demosaic']>>('ahd');
  let whiteBalance = $state<NonNullable<DngDevelopOptions['whiteBalance']>>('as-shot');
  let highlightRecovery = $state<NonNullable<DngDevelopOptions['highlightRecovery']>>('clip');
  let outputColorSpace = $state<NonNullable<DngDevelopOptions['outputColorSpace']>>('srgb');
  let outputBitDepth = $state<NonNullable<DngDevelopOptions['outputBitDepth']>>(8);

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
      if (instantPreview) {
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
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const developed = await decodeWithTypedErrors('raw', () =>
        developDng(bytes, {
          chromaticAberrationCorrection,
          demosaic,
          exposureEv,
          gamma,
          highlightRecovery,
          noiseReductionThreshold,
          outputBitDepth,
          outputColorSpace,
          temperatureKelvin,
          tint,
          whiteBalance,
        }),
      );
      const png = await canvasPng(developed.frames[0].data, developed.width, developed.height);
      developedUrl = replaceUrl(developedUrl, URL.createObjectURL(png));
      if (outputBitDepth === 16 && developed.frames[0].data16) {
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
      status = `DNG develop complete at ${outputBitDepth}-bit using ${demosaic.toUpperCase()}.`;
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
    <label
      ><input type="checkbox" bind:checked={instantPreview} /> Instant embedded-JPEG preview while DNG
      develops</label
    >
    <label
      >Demosaic <select bind:value={demosaic}
        ><option value="ahd">AHD</option><option value="vng">VNG</option><option value="ppg"
          >PPG</option
        ><option value="dcb">DCB</option><option value="linear">Linear</option></select
      ></label
    >
    <label
      >White balance <select bind:value={whiteBalance}
        ><option value="as-shot">As shot</option><option value="camera">Camera</option><option
          value="auto">Auto</option
        ><option value="daylight">Daylight</option><option value="custom">Custom</option></select
      ></label
    >
    {#if whiteBalance === 'custom'}<label
        >Temperature (K) <input
          type="number"
          min="2000"
          max="50000"
          bind:value={temperatureKelvin}
        /></label
      ><label>Tint <input type="number" min="-150" max="150" bind:value={tint} /></label>{/if}
    <label
      >Highlight recovery <select bind:value={highlightRecovery}
        ><option value="clip">Clip</option><option value="unclip">Unclip</option><option
          value="blend">Blend</option
        ><option value="rebuild">Rebuild</option></select
      ></label
    >
    <label
      >Output colour space <select bind:value={outputColorSpace}
        ><option value="srgb">sRGB</option><option value="display-p3">Display P3</option><option
          value="adobe-rgb">Adobe RGB compatible</option
        ><option value="gray">Gray</option></select
      ></label
    >
    <label
      >Output bit depth <select bind:value={outputBitDepth}
        ><option value={8}>8-bit PNG</option><option value={16}>16-bit RGBA little-endian</option
        ></select
      ></label
    >
    <label>Gamma <input type="number" min="0.1" max="5" step="0.1" bind:value={gamma} /></label>
    <label
      >Exposure (EV) <input
        type="number"
        min="-3"
        max="3"
        step="0.1"
        bind:value={exposureEv}
      /></label
    >
    <label
      >Noise-reduction threshold <input
        type="number"
        min="0"
        max="100"
        bind:value={noiseReductionThreshold}
      /></label
    >
    <label
      ><input type="checkbox" bind:checked={chromaticAberrationCorrection} /> Chromatic-aberration correction</label
    >
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
        >Download {outputBitDepth}-bit developed output</a
      >
    </p>{/if}
  {#if status}<p role="status">{status}</p>{/if}{#if error}<p role="alert">{error}</p>{/if}
</main>
