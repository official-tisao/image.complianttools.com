<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Recipe } from '@complianttools/image-engine/types';
  import CompareCanvas from './CompareCanvas.svelte';
  import GeneratedControls from './GeneratedControls.svelte';
  import ToolPageCompletion from './ToolPageCompletion.svelte';
  import type { Locale } from './i18n';
  import type { OptionDescription } from '@complianttools/image-engine/schemas/options';

  type TransformKind = 'crop' | 'rotate' | 'flip' | 'border';
  type Copy = {
    title: string;
    description: string;
    meta: string;
    choose: string;
    ready: string;
    run: string;
    processing: string;
    download: string;
    preview: string;
    empty: string;
    local: string;
    dimensions: (width: number, height: number) => string;
    error: string;
    remedy: string;
    formatNote: string;
    faqs: readonly { question: string; answer: string }[];
    labels: Record<string, string>;
    helps: Record<string, string>;
    values: Record<string, string>;
  };

  const english: Record<TransformKind, Copy> = {
    crop: {
      title: 'Crop Image',
      description: 'Crop a still image with exact coordinates or edge offsets in your browser.',
      meta: 'Crop a still image locally with exact coordinates, edge offsets, and a live preview.',
      choose: 'Choose an image',
      ready: 'Choose an image to begin.',
      run: 'Preview crop',
      processing: 'Cropping locally…',
      download: 'Download cropped PNG',
      preview: 'Cropped image preview',
      empty: 'Your before-and-after crop preview appears here.',
      local: 'Processing happens in your browser. No image is uploaded.',
      dimensions: (width, height) => `${width} × ${height} pixels`,
      error: 'The crop could not finish.',
      remedy: 'Choose a valid still image and try again.',
      formatNote:
        'The crop is performed locally and the PNG download matches the displayed preview.',
      faqs: [
        {
          question: 'Are images uploaded?',
          answer: 'No. Decoding, cropping, and export happen locally.',
        },
        {
          question: 'What does the default do?',
          answer: 'The default rectangle keeps the full image unchanged.',
        },
        {
          question: 'Which input is accepted?',
          answer: 'This first route accepts still PNG, JPEG, and WebP images.',
        },
      ],
      labels: {
        mode: 'Crop mode',
        unit: 'Coordinate unit',
        x: 'Left',
        y: 'Top',
        width: 'Width',
        height: 'Height',
        cropTop: 'Top offset',
        cropBottom: 'Bottom offset',
        cropLeft: 'Left offset',
        cropRight: 'Right offset',
      },
      helps: {
        mode: 'Crop by a rectangle or offsets from each edge.',
        unit: 'Use pixels or percentages.',
      },
      values: { rect: 'Rectangle', edges: 'Edge offsets', px: 'Pixels', percent: 'Percent' },
    },
    rotate: {
      title: 'Rotate & Straighten',
      description: 'Rotate a still image by a precise angle or snap it to quarter turns locally.',
      meta: 'Rotate a still image locally by an exact angle with a faithful preview and PNG export.',
      choose: 'Choose an image',
      ready: 'Choose an image to begin.',
      run: 'Preview rotation',
      processing: 'Rotating locally…',
      download: 'Download rotated PNG',
      preview: 'Rotated image preview',
      empty: 'Your before-and-after rotation preview appears here.',
      local: 'Processing happens in your browser. No image is uploaded.',
      dimensions: (width, height) => `${width} × ${height} pixels`,
      error: 'The rotation could not finish.',
      remedy: 'Choose a valid still image and try again.',
      formatNote: 'Rotation runs locally; inspect the preview before downloading the PNG.',
      faqs: [
        {
          question: 'Does rotation upload my image?',
          answer: 'No. Rotation and export run locally in your browser.',
        },
        {
          question: 'What is snap to 90°?',
          answer: 'It rounds the angle to the nearest quarter turn.',
        },
        {
          question: 'What happens to the canvas?',
          answer: 'The default expands the canvas to keep the rotated image visible.',
        },
      ],
      labels: { angle: 'Angle', snap90: 'Snap to 90°', expandCanvas: 'Expand canvas' },
      helps: {
        angle: 'Use an angle from −360° to 360°.',
        snap90: 'Round to the nearest quarter turn.',
        expandCanvas: 'Keep the full rotated image visible.',
      },
      values: {},
    },
    flip: {
      title: 'Flip / Mirror',
      description: 'Mirror a still image horizontally, vertically, or in both directions locally.',
      meta: 'Flip a still image horizontally or vertically in your browser and preview the result.',
      choose: 'Choose an image',
      ready: 'Choose an image to begin.',
      run: 'Preview flip',
      processing: 'Flipping locally…',
      download: 'Download flipped PNG',
      preview: 'Flipped image preview',
      empty: 'Your before-and-after flip preview appears here.',
      local: 'Processing happens in your browser. No image is uploaded.',
      dimensions: (width, height) => `${width} × ${height} pixels`,
      error: 'The flip could not finish.',
      remedy: 'Choose a valid still image and try again.',
      formatNote: 'Flipping runs locally; inspect the preview before downloading the PNG.',
      faqs: [
        { question: 'Are images uploaded?', answer: 'No. Mirroring and export happen locally.' },
        {
          question: 'Can I flip both directions?',
          answer: 'Yes. Enable horizontal and vertical mirroring together.',
        },
        {
          question: 'Does flipping change dimensions?',
          answer: 'No. It preserves the source width and height.',
        },
      ],
      labels: { flipH: 'Mirror horizontally', flipV: 'Mirror vertically' },
      helps: { flipH: 'Reverse left and right.', flipV: 'Reverse top and bottom.' },
      values: {},
    },
    border: {
      title: 'Border / Frame',
      description: 'Add an inner or outer colour border to a still image locally.',
      meta: 'Add a configurable colour border to a still image locally with a live preview.',
      choose: 'Choose an image',
      ready: 'Choose an image to begin.',
      run: 'Preview border',
      processing: 'Adding border locally…',
      download: 'Download bordered PNG',
      preview: 'Bordered image preview',
      empty: 'Your before-and-after border preview appears here.',
      local: 'Processing happens in your browser. No image is uploaded.',
      dimensions: (width, height) => `${width} × ${height} pixels`,
      error: 'The border could not finish.',
      remedy: 'Choose a valid still image and try again.',
      formatNote: 'The border runs locally; inspect the preview before downloading the PNG.',
      faqs: [
        {
          question: 'Are images uploaded?',
          answer: 'No. Border processing and export happen locally.',
        },
        {
          question: 'What is an outer border?',
          answer: 'It adds pixels around the source image and preserves the source inside.',
        },
        {
          question: 'Can I draw inside the source?',
          answer: 'Yes. Enable inner border to reserve pixels inside the source bounds.',
        },
      ],
      labels: {
        enabled: 'Apply border',
        width: 'Border width',
        color: 'Border colour',
        inner: 'Inner border',
      },
      helps: {
        enabled: 'Turn the border on after choosing an image.',
        width: 'Use a whole number of pixels.',
        color: 'Choose the border colour.',
        inner: 'Draw inside the existing image bounds.',
      },
      values: {},
    },
  };

  const arabic: Partial<Record<TransformKind, Partial<Copy>>> = {
    crop: {
      title: 'اقتصاص الصورة',
      description: 'اقتصص صورة ثابتة بإحداثيات دقيقة أو إزاحات الحواف في متصفحك.',
      choose: 'اختر صورة',
      run: 'معاينة الاقتصاص',
      download: 'تنزيل PNG اقتصاص',
    },
    rotate: {
      title: 'تدوير وتصحيح',
      description: 'دوّر صورة ثابتة بزاوية دقيقة أو ثبّتها على ربع دورة محليًا.',
      choose: 'اختر صورة',
      run: 'معاينة التدوير',
      download: 'تنزيل PNG مدوّر',
    },
    flip: {
      title: 'قلب / عكس',
      description: 'اعكس صورة ثابتة أفقيًا أو رأسيًا أو بالاتجاهين محليًا.',
      choose: 'اختر صورة',
      run: 'معاينة القلب',
      download: 'تنزيل PNG مقلوب',
    },
    border: {
      title: 'حد / إطار',
      description: 'أضف حدًا ملونًا داخليًا أو خارجيًا إلى صورة ثابتة محليًا.',
      choose: 'اختر صورة',
      run: 'معاينة الحد',
      download: 'تنزيل PNG بإطار',
    },
  };

  let { kind, locale = 'en' }: { kind: TransformKind; locale?: Locale } = $props();
  const base = $derived(english[kind]);
  const copy = $derived(
    locale === 'ar'
      ? { ...base, ...arabic[kind] }
      : locale === 'en-XA'
        ? {
            ...base,
            title: `⟦${base.title}⟧`,
            description: `⟦${base.description}⟧`,
            choose: `⟦${base.choose}⟧`,
            run: `⟦${base.run}⟧`,
            download: `⟦${base.download}⟧`,
          }
        : base,
  );

  const path = $derived(kind === 'border' ? 'add-border' : kind);
  const defaults = $derived<Record<string, unknown>>(
    kind === 'crop'
      ? {
          mode: 'rect',
          unit: 'px',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          cropTop: 0,
          cropBottom: 0,
          cropLeft: 0,
          cropRight: 0,
        }
      : kind === 'rotate'
        ? { angle: 0, snap90: false, expandCanvas: true }
        : kind === 'flip'
          ? { flipH: false, flipV: false }
          : { enabled: false, width: 10, color: '#000000', inner: false },
  );
  let options = $state<Record<string, unknown>>({});
  let sourceFile = $state<File>();
  let sourceUrl = $state('');
  let outputUrl = $state('');
  let sourceDimensions = $state<{ width: number; height: number }>();
  let outputDimensions = $state<{ width: number; height: number }>();
  let decoded = $state<ImageData>();
  let busy = $state(false);
  let status = $state('');
  let error = $state('');
  let currentTask = 0;

  const descriptions = $derived.by(() => {
    const d: Record<string, OptionDescription> = {};
    const add = (key: string, description: OptionDescription) => {
      d[key] = {
        ...description,
        label: copy.labels[key] ?? description.label,
        help: copy.helps[key] ?? description.help,
      };
    };
    if (kind === 'crop') {
      add('mode', {
        control: 'segmented',
        group: 'Crop',
        advanced: false,
        options: ['rect', 'edges'],
        optionLabels: {
          rect: copy.values.rect ?? 'Rectangle',
          edges: copy.values.edges ?? 'Edge offsets',
        },
        defaultValue: 'rect',
        label: copy.labels.mode ?? 'Crop mode',
        help: copy.helps.mode,
      });
      add('unit', {
        control: 'segmented',
        group: 'Crop',
        advanced: false,
        options: ['px', 'percent'],
        optionLabels: { px: copy.values.px ?? 'Pixels', percent: copy.values.percent ?? 'Percent' },
        defaultValue: 'px',
        label: copy.labels.unit ?? 'Unit',
        help: copy.helps.unit,
      });
      for (const key of [
        'x',
        'y',
        'width',
        'height',
        'cropTop',
        'cropBottom',
        'cropLeft',
        'cropRight',
      ])
        add(key, {
          control: 'number',
          group: 'Crop',
          advanced: false,
          min: 0,
          step: 1,
          defaultValue: 0,
          label: copy.labels[key] ?? key,
        });
    } else if (kind === 'rotate') {
      add('angle', {
        control: 'number',
        group: 'Rotate',
        advanced: false,
        min: -360,
        max: 360,
        step: 1,
        defaultValue: 0,
        label: copy.labels.angle ?? 'Angle',
        help: copy.helps.angle,
      });
      add('snap90', {
        control: 'toggle',
        group: 'Rotate',
        advanced: false,
        defaultValue: false,
        label: copy.labels.snap90 ?? 'Snap to 90°',
        help: copy.helps.snap90,
      });
      add('expandCanvas', {
        control: 'toggle',
        group: 'Rotate',
        advanced: false,
        defaultValue: true,
        label: copy.labels.expandCanvas ?? 'Expand canvas',
        help: copy.helps.expandCanvas,
      });
    } else if (kind === 'flip') {
      add('flipH', {
        control: 'toggle',
        group: 'Flip',
        advanced: false,
        defaultValue: false,
        label: copy.labels.flipH ?? 'Mirror horizontally',
        help: copy.helps.flipH,
      });
      add('flipV', {
        control: 'toggle',
        group: 'Flip',
        advanced: false,
        defaultValue: false,
        label: copy.labels.flipV ?? 'Mirror vertically',
        help: copy.helps.flipV,
      });
    } else {
      add('enabled', {
        control: 'toggle',
        group: 'Border',
        advanced: false,
        defaultValue: false,
        label: copy.labels.enabled ?? 'Apply border',
        help: copy.helps.enabled,
      });
      add('width', {
        control: 'number',
        group: 'Border',
        advanced: false,
        min: 1,
        max: 1024,
        step: 1,
        defaultValue: 10,
        label: copy.labels.width ?? 'Border width',
        help: copy.helps.width,
      });
      add('color', {
        control: 'color',
        group: 'Border',
        advanced: false,
        defaultValue: '#000000',
        label: copy.labels.color ?? 'Border colour',
        help: copy.helps.color,
      });
      add('inner', {
        control: 'toggle',
        group: 'Border',
        advanced: false,
        defaultValue: false,
        label: copy.labels.inner ?? 'Inner border',
        help: copy.helps.inner,
      });
    }
    return d;
  });

  function updateOption(pathName: string, value: unknown) {
    options = { ...options, [pathName]: value };
    if (decoded && sourceFile) void processImage();
  }

  async function decode(file: File) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D is unavailable.');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }

  function runWorker(image: ImageData, recipe: Recipe): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../workers/tool-worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event) => {
        worker.terminate();
        if (event.data.error) reject(new Error(String(event.data.error)));
        else
          resolve(
            new ImageData(
              new Uint8ClampedArray(event.data.data),
              event.data.width,
              event.data.height,
            ),
          );
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message || 'Local transform worker failed.'));
      };
      const data = image.data.slice().buffer;
      worker.postMessage({ width: image.width, height: image.height, data, recipe }, [data]);
    });
  }

  async function encode(image: ImageData) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))),
        'image/png',
      ),
    );
    return blob;
  }

  function transformOptions() {
    if (kind === 'crop')
      return {
        mode: String(options.mode ?? 'rect'),
        unit: String(options.unit ?? 'px'),
        x: Number(options.x ?? 0),
        y: Number(options.y ?? 0),
        width: Number(options.width ?? sourceDimensions?.width ?? 1),
        height: Number(options.height ?? sourceDimensions?.height ?? 1),
        cropTop: Number(options.cropTop ?? 0),
        cropBottom: Number(options.cropBottom ?? 0),
        cropLeft: Number(options.cropLeft ?? 0),
        cropRight: Number(options.cropRight ?? 0),
        outputRounding: 1,
        aspect: 'free',
        autoTrim: 'off',
        tolerance: 0,
      };
    if (kind === 'rotate' || kind === 'flip')
      return {
        angle: Number(options.angle ?? 0),
        snap90: Boolean(options.snap90),
        expandCanvas: Boolean(options.expandCanvas ?? true),
        fillColor: '#00000000',
        interpolation: 'nearest',
        flipH: Boolean(options.flipH),
        flipV: Boolean(options.flipV),
        applyExifOrientation: true,
      };
    return {
      enabled: Boolean(options.enabled),
      width: Number(options.width ?? 10),
      color: String(options.color ?? '#000000'),
      inner: Boolean(options.inner),
    };
  }

  async function processImage() {
    if (!decoded || !sourceFile) return;
    const task = ++currentTask;
    busy = true;
    error = '';
    status = copy.processing;
    try {
      const op = kind === 'crop' ? 'crop' : kind === 'border' ? 'border' : 'rotate';
      const result = await runWorker(decoded, {
        version: 1,
        id: `t${path}`,
        steps: [{ op, options: transformOptions() }],
        export: { format: 'png' },
      } as Recipe);
      const blob = await encode(result);
      if (task !== currentTask) return;
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = URL.createObjectURL(blob);
      outputDimensions = { width: result.width, height: result.height };
      status = copy.dimensions(result.width, result.height);
    } catch (cause) {
      if (task === currentTask) {
        error = cause instanceof Error ? cause.message : String(cause);
        status = '';
      }
    } finally {
      if (task === currentTask) busy = false;
    }
  }

  async function choose(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    sourceFile = file;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(file);
    try {
      decoded = await decode(file);
      sourceDimensions = { width: decoded.width, height: decoded.height };
      options =
        kind === 'crop'
          ? { ...defaults, width: decoded.width, height: decoded.height }
          : { ...defaults };
      status = copy.ready;
      await processImage();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      status = '';
    }
  }

  function download() {
    if (!outputUrl || !sourceFile) return;
    const link = document.createElement('a');
    link.href = outputUrl;
    link.download = `${sourceFile.name.replace(/\.[^.]+$/u, '')}-${kind}.png`;
    link.click();
  }

  onDestroy(() => {
    currentTask += 1;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
  });
</script>

<main class="tool-page transform-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <section class="tool-intro">
    <p class="eyebrow">Local image instrument</p>
    <h1>{copy.title}</h1>
    <p>{copy.description}</p>
    <p class="privacy-copy">{copy.local}</p>
    <label class="file-entry">
      <span>{sourceFile?.name ?? copy.choose}</span>
      <input
        data-testid="transform-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onchange={choose}
      />
    </label>
  </section>
  <section class="workspace" aria-busy={busy}>
    <div class="canvas-panel">
      {#if sourceUrl && outputUrl}
        <CompareCanvas beforeUrl={sourceUrl} afterUrl={outputUrl} alt={copy.preview} {locale} />
      {:else}<div class="empty-canvas"><p>{copy.empty}</p></div>{/if}
    </div>
    <div class="options-panel" role="region" aria-labelledby="transform-options-heading">
      <h2 id="transform-options-heading">Options</h2>
      <GeneratedControls {descriptions} values={options} onChange={updateOption} {locale} />
      {#if sourceDimensions}<p data-testid="transform-source-dimensions">
          {copy.dimensions(sourceDimensions.width, sourceDimensions.height)}
        </p>{/if}
      {#if outputDimensions}<p data-testid="transform-output-dimensions">
          {copy.dimensions(outputDimensions.width, outputDimensions.height)}
        </p>{/if}
      {#if status}<p data-testid="transform-status" role="status" aria-live="polite">
          {status}
        </p>{/if}
      {#if error}<p data-testid="transform-error" role="alert">
          {copy.error}
          {error}
          {copy.remedy}
        </p>{/if}
      <button
        class="button"
        type="button"
        data-testid="transform-run"
        disabled={!decoded || busy}
        onclick={() => void processImage()}>{copy.run}</button
      >
      <button
        class="button primary"
        type="button"
        data-testid="transform-download"
        disabled={!outputUrl || busy}
        onclick={download}>{copy.download}</button
      >
    </div>
  </section>
  <ToolPageCompletion
    {locale}
    route={path}
    title={copy.title}
    description={copy.meta}
    formatNote={copy.formatNote}
    faqs={copy.faqs}
  />
</main>
