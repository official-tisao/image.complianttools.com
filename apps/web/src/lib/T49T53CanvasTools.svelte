<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';

  type Locale = 'en' | 'en-XA' | 'ar';
  type ToolMode = 'text' | 'watermark' | 'meme' | 'draw' | 'signature';
  type ErrorKind = 'unsupported' | 'too-large' | 'too-many-pixels' | 'decode' | 'canvas';
  type Point = { x: number; y: number };
  type Stroke = {
    colour: string;
    width: number;
    shape: DrawShape;
    points: Point[];
    sticker?: string;
  };
  type TextLayer = {
    text: string;
    x: number;
    y: number;
    size: number;
    colour: string;
    opacity: number;
    stroke: boolean;
  };

  const ORIGIN = 'https://image.complianttools.com';
  const MAX_FILE_BYTES = 16 * 1024 * 1024;
  const MAX_PIXELS = 6_000_000;
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
  const modes = ['text', 'watermark', 'meme', 'draw', 'signature'] as const;
  type DrawShape = 'brush' | 'line' | 'rectangle' | 'circle' | 'sticker';

  type Copy = {
    title: string;
    description: string;
    eyebrow: string;
    privacy: string;
    choose: string;
    limits: string;
    ready: string;
    download: string;
    clear: string;
    add: string;
    text: string;
    top: string;
    bottom: string;
    size: string;
    colour: string;
    opacity: string;
    x: string;
    y: string;
    shape: string;
    sticker: string;
    brush: string;
    faq: string;
    faqAnswer: string;
    error: Record<ErrorKind, string>;
  };

  const EN: Record<ToolMode, Copy> = {
    text: {
      title: 'Add Text to an Image',
      description: 'Place editable text over a still PNG locally, then export a new PNG.',
      eyebrow: 'Local canvas tool',
      privacy: 'Your image stays in this browser. Text rendering uses the browser canvas.',
      choose: 'Choose a still PNG',
      limits: 'Still PNG only; up to 16 MiB and 6 megapixels.',
      ready: 'Choose a PNG to place text.',
      download: 'Download PNG',
      clear: 'Clear text',
      add: 'Add text',
      text: 'Text',
      top: 'Top caption',
      bottom: 'Bottom caption',
      size: 'Font size',
      colour: 'Colour',
      opacity: 'Opacity',
      x: 'X position',
      y: 'Y position',
      shape: 'Shape',
      sticker: 'Sticker',
      brush: 'Brush width',
      faq: 'About this tool',
      faqAnswer: 'Text is drawn locally into the exported PNG.',
      error: {
        unsupported: 'Choose a valid PNG image.',
        'too-large': 'The PNG exceeds the 16 MiB file limit.',
        'too-many-pixels': 'The image exceeds the 6 megapixel limit.',
        decode: 'The browser could not decode this PNG.',
        canvas: 'This browser could not process the image locally.',
      },
    },
    watermark: {
      title: 'Watermark an Image',
      description: 'Place a translucent text watermark over a still PNG locally.',
      eyebrow: 'Local canvas tool',
      privacy: 'Your image stays in this browser. No upload or network service is used.',
      choose: 'Choose a still PNG',
      limits: 'Still PNG only; up to 16 MiB and 6 megapixels.',
      ready: 'Choose a PNG to place a watermark.',
      download: 'Download PNG',
      clear: 'Clear watermark',
      add: 'Add watermark',
      text: 'Watermark text',
      top: 'Top caption',
      bottom: 'Bottom caption',
      size: 'Font size',
      colour: 'Colour',
      opacity: 'Opacity',
      x: 'X position',
      y: 'Y position',
      shape: 'Shape',
      sticker: 'Sticker',
      brush: 'Brush width',
      faq: 'About this tool',
      faqAnswer: 'Watermark pixels are rendered locally with the selected opacity.',
      error: {
        unsupported: 'Choose a valid PNG image.',
        'too-large': 'The PNG exceeds the 16 MiB file limit.',
        'too-many-pixels': 'The image exceeds the 6 megapixel limit.',
        decode: 'The browser could not decode this PNG.',
        canvas: 'This browser could not process the image locally.',
      },
    },
    meme: {
      title: 'Make a Meme',
      description: 'Add top and bottom captions to a still PNG locally.',
      eyebrow: 'Local canvas tool',
      privacy: 'Your image stays in this browser. No upload or network service is used.',
      choose: 'Choose a still PNG',
      limits: 'Still PNG only; up to 16 MiB and 6 megapixels.',
      ready: 'Choose a PNG to make a meme.',
      download: 'Download PNG',
      clear: 'Clear captions',
      add: 'Apply captions',
      text: 'Text',
      top: 'Top caption',
      bottom: 'Bottom caption',
      size: 'Caption size',
      colour: 'Colour',
      opacity: 'Opacity',
      x: 'X position',
      y: 'Y position',
      shape: 'Shape',
      sticker: 'Sticker',
      brush: 'Brush width',
      faq: 'About this tool',
      faqAnswer: 'Caption text is drawn locally with an outline for contrast.',
      error: {
        unsupported: 'Choose a valid PNG image.',
        'too-large': 'The PNG exceeds the 16 MiB file limit.',
        'too-many-pixels': 'The image exceeds the 6 megapixel limit.',
        decode: 'The browser could not decode this PNG.',
        canvas: 'This browser could not process the image locally.',
      },
    },
    draw: {
      title: 'Draw, Shapes, and Stickers',
      description: 'Draw freehand marks, shapes, or a simple sticker on a still PNG locally.',
      eyebrow: 'Local canvas tool',
      privacy: 'Your image stays in this browser. Drawing uses local pointer events and canvas.',
      choose: 'Choose a still PNG',
      limits: 'Still PNG only; up to 16 MiB and 6 megapixels.',
      ready: 'Choose a PNG to draw on.',
      download: 'Download PNG',
      clear: 'Clear marks',
      add: 'Add',
      text: 'Text',
      top: 'Top caption',
      bottom: 'Bottom caption',
      size: 'Font size',
      colour: 'Colour',
      opacity: 'Opacity',
      x: 'X position',
      y: 'Y position',
      shape: 'Shape',
      sticker: 'Sticker',
      brush: 'Brush width',
      faq: 'About this tool',
      faqAnswer: 'Pointer marks are rendered locally into the downloaded PNG.',
      error: {
        unsupported: 'Choose a valid PNG image.',
        'too-large': 'The PNG exceeds the 16 MiB file limit.',
        'too-many-pixels': 'The image exceeds the 6 megapixel limit.',
        decode: 'The browser could not decode this PNG.',
        canvas: 'This browser could not process the image locally.',
      },
    },
    signature: {
      title: 'Sign an Image',
      description: 'Draw a signature locally and export it as a PNG.',
      eyebrow: 'Local canvas tool',
      privacy: 'Your signature remains in this browser. Nothing is uploaded.',
      choose: 'Choose a background PNG (optional)',
      limits: 'Optional still PNG; up to 16 MiB and 6 megapixels.',
      ready: 'Draw your signature in the canvas.',
      download: 'Download signature PNG',
      clear: 'Clear signature',
      add: 'Add',
      text: 'Text',
      top: 'Top caption',
      bottom: 'Bottom caption',
      size: 'Pen size',
      colour: 'Pen colour',
      opacity: 'Opacity',
      x: 'X position',
      y: 'Y position',
      shape: 'Shape',
      sticker: 'Sticker',
      brush: 'Brush width',
      faq: 'About this tool',
      faqAnswer: 'The signature is drawn locally and exported as a PNG.',
      error: {
        unsupported: 'Choose a valid PNG image.',
        'too-large': 'The PNG exceeds the 16 MiB file limit.',
        'too-many-pixels': 'The image exceeds the 6 megapixel limit.',
        decode: 'The browser could not decode this PNG.',
        canvas: 'This browser could not process the image locally.',
      },
    },
  };

  let { locale = 'en', mode = 'text' }: { locale?: Locale; mode?: ToolMode } = $props();
  let input = $state<HTMLInputElement>();
  let canvas = $state<HTMLCanvasElement>();
  let bitmap = $state<ImageBitmap>();
  let sourceName = $state('');
  let dimensions = $state<{ width: number; height: number }>();
  let error = $state<ErrorKind>();
  let notice = $state('');
  let sourceReady = $state(false);
  let textValue = $state('');
  let topText = $state('');
  let bottomText = $state('');
  let textSize = $state(48);
  let colour = $state('#17243a');
  let opacity = $state(0.72);
  let positionX = $state(32);
  let positionY = $state(72);
  let shape = $state<DrawShape>('brush');
  let sticker = $state('⭐');
  let brushWidth = $state(8);
  let textLayers = $state<TextLayer[]>([]);
  let strokes = $state<Stroke[]>([]);
  let activeStroke = $state<Stroke>();
  let drawing = $state(false);

  const pseudo = (value: string) =>
    `⟦${value.replace(/[aeiou]/giu, (vowel) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[vowel.toLowerCase()] ?? vowel)}⟧`;
  const AR: Record<ToolMode, Copy> = Object.fromEntries(
    modes.map((tool) => [
      tool,
      {
        ...EN[tool],
        title: `أداة ${EN[tool].title}`,
        description: `حرر الصورة محلياً باستخدام ${EN[tool].title}.`,
        eyebrow: 'أداة Canvas محلية',
        privacy: 'تبقى الصورة في هذا المتصفح. لا يتم الرفع أو الاتصال بخدمة شبكة.',
        choose: tool === 'signature' ? 'اختر خلفية PNG (اختياري)' : 'اختر PNG ثابتة',
        download: 'تنزيل PNG',
        clear: 'مسح',
        faq: 'حول هذه الأداة',
        faqAnswer: 'تعمل العملية محلياً داخل المتصفح.',
      },
    ]),
  ) as Record<ToolMode, Copy>;
  const copy = $derived((locale === 'ar' ? AR : EN)[mode]);
  const localized = (value: string) => (locale === 'en-XA' ? pseudo(value) : value);
  const title = $derived(localized(copy.title));
  const description = $derived(localized(copy.description));
  const slug = $derived(
    {
      text: 'add-text',
      watermark: 'watermark',
      meme: 'meme-generator',
      draw: 'draw',
      signature: 'signature',
    }[mode],
  );
  const prefix = $derived(locale === 'en' ? '' : `/${locale}`);
  const canonical = $derived(`${ORIGIN}${prefix}/${slug}`);
  const testPrefix = $derived(
    `t${mode === 'text' ? '49' : mode === 'watermark' ? '50' : mode === 'meme' ? '51' : mode === 'draw' ? '52' : '53'}`,
  );

  onMount(() => {
    if (mode === 'signature') {
      dimensions = { width: 640, height: 240 };
      sourceReady = true;
      void tick().then(render);
    }
  });

  async function inspect(file: File) {
    if (file.size > MAX_FILE_BYTES) throw new Error('too-large');
    const header = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (header.length < 24 || !PNG_SIGNATURE.every((value, index) => header[index] === value))
      throw new Error('unsupported');
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (!width || !height || width * height > MAX_PIXELS) throw new Error('too-many-pixels');
    return { width, height };
  }

  async function choose(event: Event) {
    const picker = event.currentTarget as HTMLInputElement;
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    bitmap?.close();
    bitmap = undefined;
    error = undefined;
    notice = '';
    try {
      const size = await inspect(file);
      const decoded = await createImageBitmap(file);
      if (decoded.width !== size.width || decoded.height !== size.height) throw new Error('decode');
      bitmap = decoded;
      dimensions = size;
      sourceName = file.name;
      sourceReady = true;
      positionX = Math.round(size.width * 0.08);
      // Keep the default layer inside the visible corner even for tiny fixtures. This also makes
      // the first preview pixel useful as a deterministic change signal in functional tests.
      positionY = Math.round(size.height * 0.08);
      await tick();
      render();
    } catch (cause) {
      bitmap?.close();
      bitmap = undefined;
      sourceReady = mode === 'signature';
      error =
        cause instanceof Error && cause.message in copy.error
          ? (cause.message as ErrorKind)
          : 'decode';
    }
  }

  function render() {
    if (!canvas || !dimensions) return;
    const context = canvas.getContext('2d');
    if (!context) {
      error = 'canvas';
      return;
    }
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (bitmap) context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    else {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    for (const layer of textLayers) {
      context.save();
      context.globalAlpha = layer.opacity;
      context.font = `700 ${layer.size}px sans-serif`;
      context.textBaseline = 'top';
      if (layer.stroke) {
        context.lineWidth = Math.max(2, layer.size / 10);
        context.strokeStyle = '#000';
        context.strokeText(layer.text, layer.x, layer.y);
      }
      context.fillStyle = layer.colour;
      context.fillText(layer.text, layer.x, layer.y);
      context.restore();
    }
    for (const stroke of [...strokes, ...(activeStroke ? [activeStroke] : [])])
      drawStroke(context, stroke);
  }

  function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
    const first = stroke.points[0];
    const last = stroke.points.at(-1);
    if (!first || !last) return;
    context.save();
    context.globalAlpha = opacity;
    context.strokeStyle = stroke.colour;
    context.fillStyle = stroke.colour;
    context.lineWidth = stroke.width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (stroke.shape === 'sticker') {
      context.globalAlpha = 1;
      context.font = `${Math.max(24, stroke.width * 4)}px sans-serif`;
      context.fillText(stroke.sticker ?? '⭐', first.x, first.y);
    } else if (stroke.shape === 'rectangle')
      context.strokeRect(first.x, first.y, last.x - first.x, last.y - first.y);
    else if (stroke.shape === 'circle') {
      const radius = Math.hypot(last.x - first.x, last.y - first.y);
      context.beginPath();
      context.arc(first.x, first.y, radius, 0, Math.PI * 2);
      context.stroke();
    } else {
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
    context.restore();
  }

  function point(event: PointerEvent): Point | undefined {
    if (!canvas) return undefined;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  }

  function pointerDown(event: PointerEvent) {
    if (mode !== 'draw' && mode !== 'signature') return;
    const current = point(event);
    if (!current) return;
    drawing = true;
    canvas?.setPointerCapture(event.pointerId);
    activeStroke = {
      colour,
      width: brushWidth,
      shape: mode === 'signature' ? 'brush' : shape,
      points: [current],
      sticker,
    };
    render();
  }
  function pointerMove(event: PointerEvent) {
    if (!drawing || !activeStroke) return;
    const current = point(event);
    if (!current) return;
    activeStroke = { ...activeStroke, points: [...activeStroke.points, current] };
    render();
  }
  function pointerUp(event: PointerEvent) {
    if (!drawing || !activeStroke) return;
    try {
      canvas?.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer may already be released */
    }
    strokes = [...strokes, activeStroke];
    activeStroke = undefined;
    drawing = false;
    render();
  }

  function addLayer() {
    if (!dimensions) return;
    if (mode === 'text' && textValue.trim())
      textLayers = [
        ...textLayers,
        {
          text: textValue.trim(),
          x: positionX,
          y: positionY,
          size: textSize,
          colour,
          opacity: 1,
          stroke: false,
        },
      ];
    if (mode === 'watermark' && textValue.trim())
      textLayers = [
        ...textLayers,
        {
          text: textValue.trim(),
          x: positionX,
          y: positionY,
          size: textSize,
          colour,
          opacity,
          stroke: false,
        },
      ];
    if (mode === 'meme') {
      if (topText.trim())
        textLayers = [
          ...textLayers,
          {
            text: topText.trim(),
            x: canvas!.width / 2,
            y: 12,
            size: textSize,
            colour: '#fff',
            opacity: 1,
            stroke: true,
          },
        ];
      if (bottomText.trim())
        textLayers = [
          ...textLayers,
          {
            text: bottomText.trim(),
            x: canvas!.width / 2,
            y: Math.max(12, canvas!.height - textSize - 12),
            size: textSize,
            colour: '#fff',
            opacity: 1,
            stroke: true,
          },
        ];
    }
    render();
    notice = '';
  }
  function clearMarks() {
    textLayers = [];
    strokes = [];
    activeStroke = undefined;
    render();
  }
  function download() {
    if (!canvas || (mode !== 'signature' && !bitmap)) {
      notice = copy.ready;
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        error = 'canvas';
        return;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${sourceName.replace(/\.png$/iu, '') || mode}-${slug}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, 'image/png');
  }

  const schema = $derived({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: title,
    description,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    inLanguage: locale,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  });
  onDestroy(() => bitmap?.close());
</script>

<svelte:head>
  <title>{title} — ctimg</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${ORIGIN}/${slug}`} />
  <link rel="alternate" hreflang="en-XA" href={`${ORIGIN}/en-XA/${slug}`} />
  <link rel="alternate" hreflang="ar" href={`${ORIGIN}/ar/${slug}`} />
  <link rel="alternate" hreflang="x-default" href={`${ORIGIN}/${slug}`} />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(schema)}</svelte:element
  >
</svelte:head>

<main class="canvas-tool" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <section class="intro" aria-labelledby="canvas-heading">
    <p class="eyebrow">{localized(copy.eyebrow)}</p>
    <h1 id="canvas-heading">{title}</h1>
    <p>{description}</p>
    <p class="privacy">{localized(copy.privacy)}</p>
  </section>
  <section class="workspace" aria-label={localized('Image editing workspace')}>
    <label class="button choose"
      >{localized(copy.choose)}<input
        bind:this={input}
        data-testid={`${testPrefix}-input`}
        type="file"
        accept="image/png,.png"
        aria-label={localized(copy.choose)}
        onchange={choose}
      /></label
    >
    <p class="limits">{localized(copy.limits)}</p>
    {#if sourceReady}
      <canvas
        bind:this={canvas}
        data-testid={`${testPrefix}-canvas`}
        aria-label={localized('Canvas preview')}
        tabindex="0"
        onpointerdown={pointerDown}
        onpointermove={pointerMove}
        onpointerup={pointerUp}
        onpointercancel={pointerUp}
      ></canvas>
      {#if mode === 'text' || mode === 'watermark'}<label
          >{localized(copy.text)}<input
            data-testid={`${testPrefix}-text`}
            type="text"
            bind:value={textValue}
          /></label
        ><label
          >{localized(copy.size)}<input
            data-testid={`${testPrefix}-size`}
            type="number"
            min="8"
            max="240"
            bind:value={textSize}
          /></label
        ><label
          >{localized(copy.colour)}<input
            data-testid={`${testPrefix}-colour`}
            type="color"
            bind:value={colour}
          /></label
        >{#if mode === 'watermark'}<label
            >{localized(copy.opacity)}<input
              data-testid="t50-opacity"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              bind:value={opacity}
            /></label
          >{/if}<button
          class="button"
          data-testid={`${testPrefix}-add`}
          type="button"
          onclick={addLayer}>{localized(copy.add)}</button
        >{/if}
      {#if mode === 'meme'}<label
          >{localized(copy.top)}<input
            data-testid="t51-top"
            type="text"
            bind:value={topText}
          /></label
        ><label
          >{localized(copy.bottom)}<input
            data-testid="t51-bottom"
            type="text"
            bind:value={bottomText}
          /></label
        ><label
          >{localized(copy.size)}<input
            data-testid="t51-size"
            type="number"
            min="8"
            max="240"
            bind:value={textSize}
          /></label
        ><button class="button" data-testid="t51-add" type="button" onclick={addLayer}
          >{localized(copy.add)}</button
        >{/if}
      {#if mode === 'draw' || mode === 'signature'}<label
          >{localized(copy.colour)}<input
            data-testid={`${testPrefix}-colour`}
            type="color"
            bind:value={colour}
          /></label
        ><label
          >{localized(copy.brush)}<input
            data-testid={`${testPrefix}-brush`}
            type="range"
            min="1"
            max="64"
            bind:value={brushWidth}
          /></label
        >{#if mode === 'draw'}<label
            >{localized(copy.shape)}<select data-testid="t52-shape" bind:value={shape}
              ><option value="brush">{localized(copy.brush)}</option><option value="line"
                >Line</option
              ><option value="rectangle">Rectangle</option><option value="circle">Circle</option
              ><option value="sticker">{localized(copy.sticker)}</option></select
            ></label
          ><label
            >{localized(copy.sticker)}<select data-testid="t52-sticker" bind:value={sticker}
              ><option>⭐</option><option>❤️</option><option>🔥</option></select
            ></label
          >{/if}{/if}
      <div class="actions">
        <button
          class="button"
          data-testid={`${testPrefix}-clear`}
          type="button"
          onclick={clearMarks}>{localized(copy.clear)}</button
        ><button
          class="button primary"
          data-testid={`${testPrefix}-download`}
          type="button"
          onclick={download}>{localized(copy.download)}</button
        >
      </div>
    {:else}<p data-testid={`${testPrefix}-ready`}>{localized(copy.ready)}</p>{/if}
    {#if error}<p class="error" role="alert" data-error-kind={error}>
        {localized(copy.error[error])}
      </p>{/if}{#if notice}<p class="notice" role="status">{localized(notice)}</p>{/if}
  </section>
  <section class="faq">
    <h2>{localized(copy.faq)}</h2>
    <details>
      <summary>{localized(copy.faq)}</summary>
      <p>{localized(copy.faqAnswer)}</p>
    </details>
  </section>
</main>

<style>
  .canvas-tool {
    max-width: 1080px;
    margin: 0 auto;
    padding: 24px 16px 64px;
    color: #17243a;
  }
  .intro {
    max-width: 760px;
    margin: 0 auto 28px;
  }
  .eyebrow {
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .privacy,
  .notice,
  .error {
    padding: 10px 12px;
    border-radius: 6px;
  }
  .privacy {
    font-weight: 650;
    background: #eef7f1;
  }
  .notice {
    background: #fff7e6;
  }
  .error {
    background: #fff0f0;
    color: #8c1d18;
  }
  .workspace {
    padding: 20px;
    border: 1px solid #d6dbe3;
    border-radius: 12px;
    background: #fff;
  }
  .button {
    min-height: 42px;
    padding: 8px 14px;
    border: 1px solid #46536a;
    border-radius: 7px;
    background: #fff;
    color: #17243a;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }
  .button.primary {
    background: #174ea6;
    color: #fff;
  }
  .choose input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  canvas {
    display: block;
    width: min(100%, 760px);
    height: auto;
    min-height: 160px;
    margin: 18px auto;
    border: 1px solid #9ba6b7;
    background: #fff;
    touch-action: none;
  }
  label {
    display: inline-flex;
    flex-direction: column;
    gap: 4px;
    margin: 8px 12px 8px 0;
    font-weight: 650;
  }
  input,
  select {
    min-height: 38px;
    padding: 6px 8px;
    font: inherit;
  }
  input[type='color'] {
    min-width: 56px;
    padding: 2px;
  }
  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 18px;
  }
  .faq {
    max-width: 800px;
    margin: 56px auto;
  }
  details {
    padding: 12px;
    border: 1px solid #d6dbe3;
    border-radius: 8px;
  }
  summary {
    cursor: pointer;
    font-weight: 650;
  }
</style>
