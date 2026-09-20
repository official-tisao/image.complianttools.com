<script lang="ts">
  import { onDestroy } from 'svelte';
  import { tessdataRegistry } from '@complianttools/image-engine/ocr-tessdata-catalog';
  import {
    type OcrErrorKind,
    type OcrHelperResult,
    type OcrOptions,
    type OcrWorkerHandle,
    type OcrWorkerOut,
  } from '@complianttools/image-engine/ocr';
  import {
    ocrToolOptionDescriptions,
    OcrToolOptionsSchema,
    type OcrToolOptions,
  } from '@complianttools/image-engine/schemas/ocr';
  import type { OptionDescription } from '@complianttools/image-engine/schemas/options';
  import GeneratedControls from './GeneratedControls.svelte';
  import ToolPageCompletion from './ToolPageCompletion.svelte';
  import { localizeOptions, translate, type Locale } from './i18n';

  type OcrRuntime = typeof import('@complianttools/image-engine/ocr');

  const MAX_FILE_BYTES = 50 * 1024 * 1024;
  const MAX_IMAGE_PIXELS = 20_000_000;
  const allowedTypes = new Set([
    'image/avif',
    'image/bmp',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);
  const allowedExtensions = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.webp']);
  let { locale = 'en' }: { locale?: Locale } = $props();
  const languageEntries = tessdataRegistry.filter(
    (entry) => entry.kind === 'language' || entry.kind === 'alias',
  );
  const languageTagOverrides: Readonly<Record<string, string>> = {
    chi_sim: 'zh-Hans',
    chi_tra: 'zh-Hant',
  };
  // Translators: keep the Tesseract model IDs unchanged; these names fill gaps in some browsers' CLDR data.
  const arabicLanguageNameOverrides: Readonly<Record<string, string>> = {
    bod: 'التبتية',
    dzo: 'دزونكا',
    enm: 'الإنجليزية الوسطى',
    frm: 'الفرنسية الوسطى',
    grc: 'اليونانية القديمة',
    iku: 'الإينكتيتت',
    syr: 'السريانية',
  };
  const scriptTagByTesseractName: Readonly<Record<string, string>> = {
    Arabic: 'Arab',
    Armenian: 'Armn',
    Bengali: 'Beng',
    Canadian_Aboriginal: 'Cans',
    Cherokee: 'Cher',
    Cyrillic: 'Cyrl',
    Devanagari: 'Deva',
    Ethiopic: 'Ethi',
    Fraktur: 'Latf',
    Georgian: 'Geor',
    Greek: 'Grek',
    Gujarati: 'Gujr',
    Gurmukhi: 'Guru',
    Hangul: 'Hang',
    HanS: 'Hans',
    HanT: 'Hant',
    Hebrew: 'Hebr',
    Japanese: 'Jpan',
    Kannada: 'Knda',
    Khmer: 'Khmr',
    Lao: 'Laoo',
    Latin: 'Latn',
    Malayalam: 'Mlym',
    Myanmar: 'Mymr',
    Oriya: 'Orya',
    Sinhala: 'Sinh',
    Syriac: 'Syrc',
    Tamil: 'Taml',
    Telugu: 'Telu',
    Thaana: 'Thaa',
    Thai: 'Thai',
    Tibetan: 'Tibt',
  };

  function displayName(names: Intl.DisplayNames, code: string, fallback: string): string {
    try {
      const name = names.of(code);
      return name && name.toLowerCase() !== code.toLowerCase() ? name : fallback;
    } catch {
      return fallback;
    }
  }

  function localizedLanguageLabel(
    entry: (typeof languageEntries)[number],
    names: Intl.DisplayNames,
  ): string {
    if (entry.kind === 'alias') {
      const target = languageEntries.find((candidate) => candidate.lang === entry.aliasTarget);
      const targetLabel = target
        ? localizedLanguageLabel(target, names)
        : (entry.aliasTarget ?? entry.lang);
      return locale === 'ar'
        ? `${targetLabel} — اسم مستعار قديم (${entry.lang})`
        : `${targetLabel} — deprecated alias (${entry.lang})`;
    }

    const isVertical = entry.lang.endsWith('_vert');
    const isLegacy = entry.lang.endsWith('_old');
    const baseCode = entry.lang.replace(/_(?:vert|old)$/u, '');
    const languageTag = languageTagOverrides[baseCode] ?? baseCode.replace('_', '-');
    const languageName =
      locale === 'ar'
        ? (arabicLanguageNameOverrides[baseCode] ??
          displayName(names, languageTag, entry.displayName))
        : displayName(names, languageTag, entry.displayName);
    const qualifier = isVertical
      ? locale === 'ar'
        ? ' (نص عمودي)'
        : ' (vertical text)'
      : isLegacy
        ? locale === 'ar'
          ? ' (نموذج قديم)'
          : ' (legacy model)'
        : '';
    return `${languageName}${qualifier}`;
  }

  const languageLabels = $derived.by(() => {
    const names = new Intl.DisplayNames([locale === 'en-XA' ? 'en' : locale], {
      type: 'language',
    });
    return Object.fromEntries(
      languageEntries.map((entry) => [entry.lang, localizedLanguageLabel(entry, names)]),
    );
  });
  const scriptLabels = $derived.by(() => {
    const localeForNames = locale === 'en-XA' ? 'en' : locale;
    const scriptNames = new Intl.DisplayNames([localeForNames], { type: 'script' });
    const languageNames = new Intl.DisplayNames([localeForNames], { type: 'language' });
    return Object.fromEntries(
      tessdataRegistry
        .filter((entry) => entry.kind === 'script')
        .map((entry) => {
          const scriptName = entry.lang.slice('script/'.length);
          const isVertical = scriptName.endsWith('_vert');
          const baseName = scriptName.replace(/_vert$/u, '');
          const localizedName =
            baseName === 'Vietnamese'
              ? displayName(languageNames, 'vi', baseName)
              : displayName(scriptNames, scriptTagByTesseractName[baseName] ?? baseName, baseName);
          const verticalQualifier = isVertical
            ? locale === 'ar'
              ? ' (نص عمودي)'
              : ' (vertical text)'
            : '';
          const label =
            locale === 'ar'
              ? `نموذج OCR للكتابة ${localizedName}${verticalQualifier}`
              : `${localizedName} script OCR model${verticalQualifier}`;
          const sizeNote =
            entry.lang === 'script/Latin'
              ? ` (${new Intl.NumberFormat(localeForNames, { maximumFractionDigits: 1 }).format(entry.sizeBytes / 1_048_576)} MiB)`
              : '';
          return [entry.lang, `${label}${sizeNote}`];
        }),
    );
  });

  const t = (key: string, fallback: string, value?: string | number) =>
    translate(locale, key, fallback, value);
  const title = $derived(t('ocr.title', 'OCR Text Extractor'));
  const metaDescription = $derived(
    t(
      'ocr.metaDescription',
      'Extract text from images locally with Tesseract language, script, orientation, and equation models.',
    ),
  );
  const seoFaqs = $derived([
    {
      question: t('ocr.faqLocal', 'Is my image uploaded?'),
      answer: t(
        'ocr.faqLocalAnswer',
        'No. Your image is read and processed in this browser. The worker and runtime are served by this application; if a selected model is not cached locally, only that pinned model file is fetched from its registered official source (jsDelivr for most files, GitHub raw for the oversized Latin script model). Image pixels are never sent to either source.',
      ),
    },
    {
      question: t('ocr.faqModels', 'Which models are available?'),
      answer: t(
        'ocr.faqModelsAnswer',
        'The selector includes the pinned official language and script models plus orientation and equation helpers. Hausa is not in this pinned model set.',
      ),
    },
    {
      question: t('ocr.faqAccuracy', 'Has every model been accuracy tested?'),
      answer: t(
        'ocr.faqAccuracyAnswer',
        'No. Current accuracy measurements cover one synthetic print fixture for each of the eight initial languages only; the other models are not measured.',
      ),
    },
  ]);

  let options = $state<OcrToolOptions>(OcrToolOptionsSchema.parse({}));
  let file = $state<File>();
  let previewUrl = $state('');
  let error = $state('');
  let status = $state('');
  let isBusy = $state(false);
  let resultReady = $state(false);
  let resultText = $state('');
  let resultConfidence = $state<number | null>(null);
  let resultModel = $state('');
  let helperResult = $state<OcrHelperResult>();
  let worker: OcrWorkerHandle | undefined;
  let ocrRuntime: OcrRuntime | undefined;
  let activeJobId = '';
  let jobStartedAt = 0;

  const optionDescriptions = $derived.by(() => {
    const descriptions: Record<string, OptionDescription> = {
      'ocr.mode': {
        ...ocrToolOptionDescriptions['ocr.mode']!,
        options: ['language', 'script', 'orientation', 'equation'],
        optionLabels: {
          language: 'Language or variant',
          script: 'Script model',
          orientation: 'Page orientation',
          equation: 'Equation recognition',
        },
      },
    };

    if (options.mode === 'language' || options.mode === 'equation') {
      const base = ocrToolOptionDescriptions['ocr.language']!;
      const languageDescription: OptionDescription = {
        ...base,
        options: languageEntries.map((entry) => entry.lang),
        optionLabels: languageLabels,
      };
      if (options.mode === 'equation') {
        descriptions['ocr.baseLanguage'] = {
          ...languageDescription,
          label: 'Base language',
          help: 'The selected language is loaded with the equation helper.',
          defaultValue: options.language,
        };
      } else {
        descriptions['ocr.language'] = languageDescription;
      }
    } else if (options.mode === 'script') {
      descriptions['ocr.script'] = {
        ...ocrToolOptionDescriptions['ocr.script']!,
        label: t('option.ocr.script.label', 'Script model'),
        help: t(
          'option.ocr.script.help',
          'A script model may cover more than one language and is separate from language models.',
        ),
        options: tessdataRegistry
          .filter((entry) => entry.kind === 'script')
          .map((entry) => entry.lang),
        optionLabels: scriptLabels,
      };
    }

    if (options.mode !== 'orientation') {
      descriptions['ocr.psm'] = {
        ...ocrToolOptionDescriptions['ocr.psm']!,
        label: t('option.ocr.psm.label', 'Page layout mode'),
        help: t(
          'option.ocr.psm.help',
          'Automatic page layout is the default; choose another mode for a known text arrangement.',
        ),
      };
    }

    return localizeOptions(locale, descriptions);
  });
  const optionValues = $derived({
    'ocr.mode': options.mode,
    'ocr.language': options.language,
    'ocr.baseLanguage': options.language,
    'ocr.script': options.script,
    'ocr.psm': options.psm,
  });

  function updateOption(path: string, value: unknown) {
    const field = (
      path === 'ocr.baseLanguage' ? 'language' : path.slice('ocr.'.length)
    ) as keyof OcrToolOptions;
    const parsed = OcrToolOptionsSchema.safeParse({ ...options, [field]: value });
    if (!parsed.success) {
      error = t('ocr.error.title', 'OCR options are invalid.');
      return;
    }
    options = parsed.data;
    error = '';
  }

  function selectFile(selected: File | undefined) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    file = selected;
    previewUrl = selected ? URL.createObjectURL(selected) : '';
    error = '';
    status = '';
    resultReady = false;
    resultText = '';
    resultConfidence = null;
    helperResult = undefined;
  }

  function engineOptions(): OcrOptions {
    switch (options.mode) {
      case 'language':
        return { language: options.language, psm: options.psm };
      case 'script':
        return { mode: 'script', script: options.script, psm: options.psm };
      case 'orientation':
        return { mode: 'helper', helper: 'osd' };
      case 'equation':
        return { mode: 'helper', helper: 'equ', language: options.language, psm: options.psm };
    }
  }

  const errorKinds: readonly OcrErrorKind[] = [
    'unsupported-language',
    'unsupported-model',
    'tessdata-not-registered',
    'tessdata-download-failed',
    'worker-terminated',
    'offline-unavailable',
    'recognition-failed',
  ];

  function showEngineError(message: string | undefined) {
    const prefix = message?.split(':', 1)[0] as OcrErrorKind | undefined;
    const kind = prefix && errorKinds.includes(prefix) ? prefix : 'recognition-failed';
    const remedy = ocrRuntime?.ocrError(kind).remedy ?? 'Try a clearer image or a different model.';
    const description = t(`ocr.error.${kind}`, remedy);
    const localizedRemedy = t(`ocr.remedy.${kind}`, remedy);
    error = `${t('ocr.error.title', 'OCR could not finish')}: ${description} ${t(
      'ocr.remedy.title',
      'Remedy',
    )}: ${localizedRemedy}`;
  }

  async function ensureWorker(): Promise<OcrWorkerHandle> {
    if (worker) return worker;
    ocrRuntime ??= await import('@complianttools/image-engine/ocr');
    worker = ocrRuntime.createOcrWorker();
    worker.addEventListener('message', ({ data }: { data: OcrWorkerOut }) => {
      if (data.jobId !== activeJobId) return;
      if (data.type === 'ocr-progress') {
        const percent = Math.round(data.progress?.percent ?? 0);
        status = t('ocr.progress', 'Loading model and recognizing text ({value}%)…', percent);
        return;
      }
      isBusy = false;
      if (data.type === 'ocr-error') {
        showEngineError(data.error);
        status = '';
        return;
      }
      resultReady = true;
      resultConfidence = null;
      helperResult = undefined;
      if (data.type === 'ocr-result' && data.result) {
        resultText = data.result.text;
        resultConfidence = data.result.confidence ?? null;
        resultModel = data.result.language;
      } else if (data.type === 'ocr-helper-result' && data.helperResult) {
        helperResult = data.helperResult;
        if (data.helperResult.helper === 'equ') {
          resultText = data.helperResult.text;
          resultConfidence = data.helperResult.confidence ?? null;
          resultModel = `${options.language}+equ`;
        } else {
          resultText = '';
          resultModel = 'osd';
        }
      }
      status = t(
        'ocr.finished',
        'Recognition finished in {value} ms',
        Math.round(performance.now() - jobStartedAt),
      );
    });
    worker.addEventListener('error', ({ message }: { message: string }) => {
      if (!isBusy) return;
      isBusy = false;
      showEngineError(message);
      status = '';
    });
    return worker;
  }

  function failInput(message: string) {
    error = message;
    status = '';
    isBusy = false;
  }

  async function recognize() {
    if (!file) {
      failInput(t('ocr.error.fileRequired', 'Choose an image first.'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      failInput(t('ocr.error.fileSize', 'The file exceeds the 50 MiB limit.'));
      return;
    }
    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!allowedTypes.has(file.type.toLowerCase()) && !allowedExtensions.has(extension)) {
      failInput(t('ocr.error.fileType', 'This image type is not supported by this browser.'));
      return;
    }
    const parsed = OcrToolOptionsSchema.safeParse(options);
    if (!parsed.success) {
      failInput(
        t('ocr.error.options', 'Choose a registered OCR model and valid page layout mode.'),
      );
      return;
    }

    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      if (
        bitmap.width <= 0 ||
        bitmap.height <= 0 ||
        bitmap.width * bitmap.height > MAX_IMAGE_PIXELS
      ) {
        failInput(t('ocr.error.imageSize', 'The image exceeds the 20 megapixel limit.'));
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        failInput(t('ocr.error.decode', 'The image could not be decoded locally.'));
        return;
      }
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const jobId = `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeJobId = jobId;
      jobStartedAt = performance.now();
      isBusy = true;
      resultReady = false;
      resultText = '';
      helperResult = undefined;
      error = '';
      status = t('ocr.working', 'Loading the model and recognizing text…');
      (await ensureWorker()).postMessage({
        type: 'ocr',
        jobId,
        imageData: { width: image.width, height: image.height, data: image.data },
        options: engineOptions(),
      });
    } catch {
      failInput(t('ocr.error.decode', 'The image could not be decoded locally.'));
    } finally {
      bitmap?.close();
    }
  }

  function downloadText() {
    if (!resultText) return;
    const basename = (file?.name ?? 'ocr-result').replace(/\.[^.]+$/u, '') || 'ocr-result';
    const url = URL.createObjectURL(new Blob([resultText], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${basename}.txt`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  onDestroy(() => {
    worker?.terminate();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });
</script>

<main lang={locale === 'en-XA' ? 'en-XA' : locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a href={locale === 'en' ? '/' : `/${locale}/convert`}>{t('ocr.back', '← Tools')}</a>
  <h1>{title}</h1>
  <p>
    {t(
      'ocr.description',
      'Extract text locally with Tesseract language, script, orientation, and equation models.',
    )}
  </p>
  <p>
    {t(
      'ocr.orientationGuidance',
      'Rotate the image upright for the best result. If orientation is uncertain or OCR is poor, run Page orientation to load the optional OSD model. OSD and Script models are not loaded by default.',
    )}
  </p>
  <p>
    {t(
      'ocr.offlineNote',
      'A first model load requires a connection. Previously loaded models may be reused locally, but offline availability of the app, worker, and core is not guaranteed.',
    )}
  </p>

  <section aria-label={t('ocr.input', 'Image and recognition options')}>
    <label for="ocr-image">{t('ocr.choose', 'Choose a raster image')}</label>
    <input
      id="ocr-image"
      data-testid="ocr-file-input"
      type="file"
      accept="image/avif,image/bmp,image/gif,image/jpeg,image/png,image/webp,.avif,.bmp,.gif,.jpeg,.jpg,.png,.webp"
      aria-describedby="ocr-file-help"
      disabled={isBusy}
      onchange={(event) => selectFile(event.currentTarget.files?.[0])}
    />
    <p id="ocr-file-help">
      {t('ocr.fileHelp', 'PNG, JPEG, WebP, GIF, BMP, or AVIF. Maximum 50 MiB and 20 megapixels.')}
    </p>
    {#if previewUrl && file}
      <figure>
        <img src={previewUrl} alt={t('ocr.previewAlt', 'Selected image for OCR')} />
        <figcaption>{file.name}</figcaption>
      </figure>
    {/if}

    <GeneratedControls
      descriptions={optionDescriptions}
      values={optionValues}
      onChange={updateOption}
      {locale}
    />
    <button type="button" disabled={!file || isBusy} onclick={() => void recognize()}>
      {t('ocr.run', 'Recognize text')}
    </button>
    {#if status}<p role="status" aria-live="polite">{status}</p>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </section>

  {#if resultReady}
    <section aria-labelledby="ocr-result-heading" data-testid="ocr-result">
      <h2 id="ocr-result-heading">{t('ocr.result', 'OCR result')}</h2>
      {#if helperResult?.helper === 'osd'}
        <dl>
          <dt>{t('ocr.orientation', 'Page orientation')}</dt>
          <dd>{helperResult.orientationDegrees ?? t('inspector.unknown', 'Unknown')}°</dd>
          <dt>{t('ocr.orientationConfidence', 'Orientation confidence')}</dt>
          <dd>{helperResult.orientationConfidence ?? t('inspector.unknown', 'Unknown')}</dd>
          <dt>{t('ocr.script', 'Detected script')}</dt>
          <dd>{helperResult.script ?? t('inspector.unknown', 'Unknown')}</dd>
          <dt>{t('ocr.scriptConfidence', 'Script confidence')}</dt>
          <dd>{helperResult.scriptConfidence ?? t('inspector.unknown', 'Unknown')}</dd>
        </dl>
      {:else}
        <p>{t('ocr.modelUsed', 'Model used')}: {resultModel}</p>
        {#if resultConfidence !== null}
          <p>{t('ocr.confidence', 'Confidence')}: {resultConfidence}</p>
        {/if}
        <h3>{t('ocr.recognizedText', 'Recognized text')}</h3>
        <pre data-testid="ocr-output">{resultText ||
            t('ocr.noText', 'No text was recognized.')}</pre>
        {#if resultText}
          <button type="button" onclick={downloadText}>{t('ocr.download', 'Download text')}</button>
        {/if}
      {/if}
    </section>
  {/if}

  <ToolPageCompletion
    {locale}
    route="ocr"
    {title}
    description={metaDescription}
    formatNote={t(
      'ocr.formatNote',
      'This page exposes the pinned language and script models plus orientation and equation helpers. Only the selected model is requested when OCR runs: from the local static cache when available, otherwise from its registered pinned tessdata_fast source (jsDelivr for most files; GitHub raw for the oversized Latin script model). OSD and Script models stay unloaded unless selected.',
    )}
    faqs={seoFaqs}
  />
</main>
