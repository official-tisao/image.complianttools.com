<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createRaster } from '@complianttools/image-engine/ops/raster';
  import {
    differenceHash,
    perceptualHash,
  } from '@complianttools/image-engine/cv/analysis-primitives';

  type Locale = 'en-XA' | 'ar';
  type FailureKind =
    | 'too-many'
    | 'too-large'
    | 'unsupported'
    | 'decode'
    | 'pixels'
    | 'hashing'
    | 'cancelled';
  type LocalImage = {
    id: number;
    file: File;
    width: number;
    height: number;
    sha256: string;
    averageHash: number[];
    differenceHash: number[];
    thumbnail: string;
  };
  type ExactGroup = { id: string; images: LocalImage[] };
  type NearPair = {
    id: string;
    first: LocalImage;
    second: LocalImage;
    averageDistance: number;
    differenceDistance: number;
  };
  type Failure = { kind: FailureKind; message: string; remedy: string };

  const MAX_FILES = 24;
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_BATCH_BYTES = 80 * 1024 * 1024;
  const MAX_PIXELS = 24_000_000;
  const HASH_SIZE = 8;
  const MAX_AVERAGE_DISTANCE = 6;
  const MAX_DIFFERENCE_DISTANCE = 6;
  const SUPPORTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

  const words = {
    'en-XA': {
      title: 'Find Duplicate Images — ctimg',
      description:
        'Find byte-identical and possible visually similar images in a local selection. Files stay on your device.',
      nav: 'Find duplicates',
      localOnly: 'Local only',
      eyebrow: 'P4-20 · T61',
      heading: 'Find Duplicate Images',
      intro: 'Compare a bounded selection of images to find exact copies and possible visual matches.',
      privacy: 'Files stay on your device. Images are not uploaded.',
      select: 'Choose images',
      input: 'Choose images to scan for duplicates',
      limits: 'Up to 24 PNG, JPEG, WebP, or GIF images; 20 MiB each, 80 MiB total.',
      scan: 'Scan images',
      scanning: 'Scanning locally…',
      cancel: 'Cancel scan',
      clear: 'Clear selection',
      ready: 'Choose at least two images, then scan them on this device.',
      progress: (done: number, total: number) => `Checking image ${done} of ${total}…`,
      empty: 'No exact or likely visual matches were found.',
      emptyRemedy: 'Try another selection. Similarity checks are conservative and can miss edits or crops.',
      exactHeading: 'Byte-identical copies',
      exactNote: 'These files have the same SHA-256 hash. Keep one copy if you choose; originals are untouched.',
      nearHeading: 'Possible visual matches',
      nearNote:
        'Perceptual hashes are approximate. Review these images yourself; a match does not prove identity. Animated images are checked using the browser-decoded first frame.',
      first: (name: string) => `Keep this copy: ${name}`,
      other: (name: string) => `Keep this copy: ${name}`,
      decision: 'Decision',
      keep: 'Keep',
      manual: 'Review for removal',
      report: 'Download review CSV',
      reportNote: 'The CSV is a review aid. This page never deletes or changes your original files.',
      file: 'File',
      dimensions: 'Dimensions',
      size: 'Size',
      match: 'Match type',
      exact: 'Exact byte match',
      visual: 'Possible visual match',
      difference: 'Hash distance',
      remedy: 'Remedy',
      errTooMany: 'Choose no more than 24 images.',
      remedyTooMany: 'Split the selection into smaller batches and scan each batch.',
      errTooLarge: 'The selected files exceed the size limits.',
      remedyTooLarge: 'Each image must be at most 20 MiB and the selection at most 80 MiB.',
      errUnsupported: 'One or more files are not a supported image type.',
      remedyUnsupported: 'Choose PNG, JPEG, WebP, or GIF files.',
      errDecode: 'The browser could not read one of the selected images.',
      remedyDecode: 'Re-export that file as a valid PNG, JPEG, WebP, or GIF and try again.',
      errPixels: 'One selected image exceeds the 24 megapixel limit.',
      remedyPixels: 'Resize that image or remove it from the selection, then scan again.',
      errHashing: 'This browser could not calculate a secure file hash.',
      remedyHashing: 'Use a current browser in a secure context (HTTPS or localhost), then retry.',
      errCancelled: 'The scan was cancelled.',
      remedyCancelled: 'Choose images and start a new scan when ready.',
    },
    ar: {
      title: 'العثور على الصور المكررة — ctimg',
      description: 'اعثر على الصور المتطابقة والمرشحة للتشابه ضمن اختيار محلي. تبقى الملفات على جهازك.',
      nav: 'العثور على المكررات',
      localOnly: 'محلي فقط',
      eyebrow: 'P4-20 · T61',
      heading: 'العثور على الصور المكررة',
      intro: 'قارن مجموعة محدودة من الصور للعثور على النسخ المطابقة والصور المحتمل تشابهها.',
      privacy: 'تبقى الملفات على جهازك. لا يتم رفع الصور.',
      select: 'اختر الصور',
      input: 'اختر الصور للبحث عن المكررات',
      limits: 'حتى 24 صورة PNG أو JPEG أو WebP أو GIF؛ 20 ميبيبايت لكل ملف و80 ميبيبايت إجمالاً.',
      scan: 'فحص الصور',
      scanning: 'جارٍ الفحص محلياً…',
      cancel: 'إلغاء الفحص',
      clear: 'مسح الاختيار',
      ready: 'اختر صورتين على الأقل، ثم افحصهما على هذا الجهاز.',
      progress: (done: number, total: number) => `جارٍ فحص الصورة ${done} من ${total}…`,
      empty: 'لم يتم العثور على نسخ مطابقة أو صور يُرجح تشابهها.',
      emptyRemedy: 'جرّب مجموعة أخرى. فحوص التشابه متحفظة وقد لا تكتشف التعديلات أو الاقتصاص.',
      exactHeading: 'نسخ متطابقة بالبايت',
      exactNote: 'تحمل هذه الملفات بصمة SHA-256 نفسها. يمكنك الاحتفاظ بنسخة واحدة؛ ولا يتم تغيير الملفات الأصلية.',
      nearHeading: 'صور محتمل تشابهها',
      nearNote: 'بصمات التشابه تقريبية. راجع الصور بنفسك؛ فالتطابق لا يثبت الهوية. تُفحص الصور المتحركة باستخدام الإطار الأول الذي يفكّه المتصفح.',
      first: (name: string) => `الاحتفاظ بهذه النسخة: ${name}`,
      other: (name: string) => `الاحتفاظ بهذه النسخة: ${name}`,
      decision: 'القرار',
      keep: 'الاحتفاظ',
      manual: 'مراجعة للإزالة',
      report: 'تنزيل تقرير CSV للمراجعة',
      reportNote: 'ملف CSV أداة للمراجعة. لا تحذف هذه الصفحة ملفاتك الأصلية ولا تعدلها.',
      file: 'الملف',
      dimensions: 'الأبعاد',
      size: 'الحجم',
      match: 'نوع التطابق',
      exact: 'تطابق البايتات',
      visual: 'تشابه بصري محتمل',
      difference: 'فرق البصمة',
      remedy: 'الحل',
      errTooMany: 'اختر 24 صورة كحد أقصى.',
      remedyTooMany: 'قسّم الاختيار إلى مجموعات أصغر وافحص كل مجموعة.',
      errTooLarge: 'الملفات المختارة تتجاوز حدود الحجم.',
      remedyTooLarge: 'يجب ألا يتجاوز كل ملف 20 ميبيبايت والمجموعة 80 ميبيبايت.',
      errUnsupported: 'نوع ملف واحد أو أكثر غير مدعوم.',
      remedyUnsupported: 'اختر ملفات PNG أو JPEG أو WebP أو GIF.',
      errDecode: 'تعذّر على المتصفح قراءة إحدى الصور المختارة.',
      remedyDecode: 'أعد تصدير الملف بصيغة PNG أو JPEG أو WebP أو GIF سليمة ثم أعد المحاولة.',
      errPixels: 'تتجاوز إحدى الصور المختارة حد 24 ميغابكسل.',
      remedyPixels: 'غيّر حجم الصورة أو أزلها من الاختيار ثم أعد الفحص.',
      errHashing: 'تعذّر على هذا المتصفح حساب بصمة آمنة للملف.',
      remedyHashing: 'استخدم متصفحاً حديثاً في سياق آمن (HTTPS أو localhost) ثم أعد المحاولة.',
      errCancelled: 'تم إلغاء الفحص.',
      remedyCancelled: 'اختر الصور وابدأ فحصاً جديداً عندما تكون مستعداً.',
    },
  } as const;

  let { locale = 'en-XA', canonicalPath = '/en-XA/find-duplicates' } = $props<{
    locale?: Locale;
    canonicalPath?: string;
  }>();
  let input = $state<HTMLInputElement>();
  let files = $state<File[]>([]);
  let exactGroups = $state<ExactGroup[]>([]);
  let nearPairs = $state<NearPair[]>([]);
  let keepers = $state<Record<string, number>>({});
  let failure = $state<Failure | undefined>();
  let scanning = $state(false);
  let progress = $state('');
  let task = 0;
  let reportUrl: string | undefined;
  const copy = $derived(words[locale]);
  const totalBytes = $derived(files.reduce((sum, file) => sum + file.size, 0));
  const matchCount = $derived(exactGroups.length + nearPairs.length);

  function failureFor(kind: FailureKind): Failure {
    const map: Record<FailureKind, [string, string]> = {
      'too-many': [copy.errTooMany, copy.remedyTooMany],
      'too-large': [copy.errTooLarge, copy.remedyTooLarge],
      unsupported: [copy.errUnsupported, copy.remedyUnsupported],
      decode: [copy.errDecode, copy.remedyDecode],
      pixels: [copy.errPixels, copy.remedyPixels],
      hashing: [copy.errHashing, copy.remedyHashing],
      cancelled: [copy.errCancelled, copy.remedyCancelled],
    };
    const [message, remedy] = map[kind];
    return { kind, message, remedy };
  }

  function revokeReport() {
    if (reportUrl) URL.revokeObjectURL(reportUrl);
    reportUrl = undefined;
  }

  function resetResults() {
    exactGroups = [];
    nearPairs = [];
    keepers = {};
    revokeReport();
  }

  function chooseFiles(event: Event) {
    const picker = event.currentTarget as HTMLInputElement;
    const selected = Array.from(picker.files ?? []);
    picker.value = '';
    task += 1;
    scanning = false;
    progress = '';
    failure = undefined;
    resetResults();
    files = selected;
    if (selected.length > MAX_FILES) failure = failureFor('too-many');
    else if (selected.some((file) => file.size > MAX_FILE_BYTES) || totalSize(selected) > MAX_BATCH_BYTES)
      failure = failureFor('too-large');
    else if (selected.some((file) => !SUPPORTED_MIME.has(file.type)))
      failure = failureFor('unsupported');
  }

  function totalSize(selected: File[]) {
    return selected.reduce((sum, file) => sum + file.size, 0);
  }

  function hamming(a: number[], b: number[]) {
    if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
    let distance = 0;
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) distance += 1;
    }
    return distance;
  }

  async function decodeHashes(file: File, id: number, sha256: string): Promise<LocalImage> {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS)
        throw failureFor('pixels');
      const canvas = document.createElement('canvas');
      canvas.width = HASH_SIZE;
      canvas.height = HASH_SIZE;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw failureFor('decode');
      context.drawImage(bitmap, 0, 0, HASH_SIZE, HASH_SIZE);
      const pixels = context.getImageData(0, 0, HASH_SIZE, HASH_SIZE).data;
      const raster = createRaster(HASH_SIZE, HASH_SIZE, pixels.slice());
      const previewCanvas = document.createElement('canvas');
      const previewScale = Math.min(1, 144 / Math.max(bitmap.width, bitmap.height));
      previewCanvas.width = Math.max(1, Math.round(bitmap.width * previewScale));
      previewCanvas.height = Math.max(1, Math.round(bitmap.height * previewScale));
      const previewContext = previewCanvas.getContext('2d');
      if (!previewContext) throw failureFor('decode');
      previewContext.drawImage(bitmap, 0, 0, previewCanvas.width, previewCanvas.height);
      return {
        id,
        file,
        width: bitmap.width,
        height: bitmap.height,
        sha256,
        averageHash: perceptualHash(raster),
        differenceHash: differenceHash(raster),
        thumbnail: previewCanvas.toDataURL('image/jpeg', 0.72),
      };
    } catch (cause) {
      if (cause && typeof cause === 'object' && 'kind' in cause) throw cause;
      throw failureFor('decode');
    } finally {
      bitmap?.close();
    }
  }

  async function scan() {
    if (files.length < 2 || failure) return;
    if (!globalThis.crypto?.subtle) {
      failure = failureFor('hashing');
      return;
    }
    resetResults();
    failure = undefined;
    scanning = true;
    const currentTask = ++task;
    const checked: LocalImage[] = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        if (currentTask !== task) return;
        const file = files[index]!;
        progress = copy.progress(index + 1, files.length);
        const bytes = await file.arrayBuffer();
        if (currentTask !== task) return;
        let digest: ArrayBuffer;
        try {
          digest = await crypto.subtle.digest('SHA-256', bytes);
        } catch {
          throw failureFor('hashing');
        }
        const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        const image = await decodeHashes(file, index, sha256);
        if (currentTask !== task) return;
        checked.push(image);
        // Give the browser a paint opportunity between bounded image decodes.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      const byDigest = new Map<string, LocalImage[]>();
      for (const image of checked) {
        const group = byDigest.get(image.sha256) ?? [];
        group.push(image);
        byDigest.set(image.sha256, group);
      }
      const exact = [...byDigest.entries()]
        .filter(([, images]) => images.length > 1)
        .map(([digest, images]) => ({ id: `exact-${digest}`, images }));
      const possible: NearPair[] = [];
      for (let firstIndex = 0; firstIndex < checked.length; firstIndex += 1) {
        const first = checked[firstIndex]!;
        for (let secondIndex = firstIndex + 1; secondIndex < checked.length; secondIndex += 1) {
          const second = checked[secondIndex]!;
          if (first.sha256 === second.sha256) continue;
          const firstRatio = first.width / first.height;
          const secondRatio = second.width / second.height;
          if (Math.abs(firstRatio - secondRatio) / Math.max(firstRatio, secondRatio) > 0.1) continue;
          const averageDistance = hamming(first.averageHash, second.averageHash);
          const differenceDistance = hamming(first.differenceHash, second.differenceHash);
          if (
            averageDistance <= MAX_AVERAGE_DISTANCE &&
            differenceDistance <= MAX_DIFFERENCE_DISTANCE
          ) {
            possible.push({
              id: `near-${first.id}-${second.id}`,
              first,
              second,
              averageDistance,
              differenceDistance,
            });
          }
        }
      }
      if (currentTask !== task) return;
      exactGroups = exact;
      nearPairs = possible;
      const defaults: Record<string, number> = {};
      for (const group of exact) defaults[group.id] = group.images[0]!.id;
      for (const pair of possible) defaults[pair.id] = pair.first.id;
      keepers = defaults;
    } catch (cause) {
      if (currentTask !== task) return;
      if (cause && typeof cause === 'object' && 'kind' in cause) {
        if (cause.kind === 'pixels') failure = failureFor('pixels');
        else if (cause.kind === 'hashing') failure = failureFor('hashing');
        else failure = failureFor('decode');
      } else failure = failureFor('decode');
      resetResults();
    } finally {
      if (currentTask === task) {
        scanning = false;
        progress = '';
      }
    }
  }

  function cancel() {
    if (!scanning) return;
    task += 1;
    scanning = false;
    progress = '';
    resetResults();
    failure = failureFor('cancelled');
  }

  function setKeeper(groupId: string, fileId: number) {
    keepers = { ...keepers, [groupId]: fileId };
    revokeReport();
  }

  function csvCell(value: string | number) {
    return `"${String(value).replaceAll('"', '""')}"`;
  }

  function downloadReport() {
    const rows = [[copy.match, copy.file, copy.dimensions, copy.size, copy.difference, copy.decision]];
    for (const group of exactGroups) {
      for (const image of group.images) {
        rows.push([
          copy.exact,
          image.file.name,
          `${image.width}x${image.height}`,
          String(image.file.size),
          image.sha256,
          keepers[group.id] === image.id ? copy.keep : copy.manual,
        ]);
      }
    }
    for (const pair of nearPairs) {
      for (const image of [pair.first, pair.second]) {
        rows.push([
          copy.visual,
          image.file.name,
          `${image.width}x${image.height}`,
          String(image.file.size),
          `aHash ${pair.averageDistance}/64; dHash ${pair.differenceDistance}/56`,
          keepers[pair.id] === image.id ? copy.keep : copy.manual,
        ]);
      }
    }
    const text = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
    revokeReport();
    reportUrl = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = reportUrl;
    link.download = 'duplicate-review.csv';
    link.click();
    setTimeout(revokeReport, 1000);
  }

  function clearSelection() {
    task += 1;
    scanning = false;
    progress = '';
    files = [];
    failure = undefined;
    resetResults();
    if (input) input.value = '';
  }

  function formatBytes(bytes: number) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MiB`;
  }

  onDestroy(() => {
    task += 1;
    revokeReport();
  });
</script>

<svelte:head>
  <title>{copy.title}</title>
  <meta name="description" content={copy.description} />
  <link rel="canonical" href={`https://image.complianttools.com${canonicalPath}`} />
  <link rel="alternate" hreflang="en-XA" href="https://image.complianttools.com/en-XA/find-duplicates" />
  <link rel="alternate" hreflang="ar" href="https://image.complianttools.com/ar/find-duplicates" />
  <link rel="alternate" hreflang="x-default" href="https://image.complianttools.com/find-duplicates" />
  <meta property="og:title" content={copy.title} />
  <meta property="og:description" content={copy.description} />
  <meta http-equiv="content-language" content={locale} />
</svelte:head>

<header class="tool-header duplicate-header" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <a class="logo" href={locale === 'en-XA' ? '/' : `/${locale}/find-duplicates`}>ctimg</a>
  <nav aria-label={locale === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}>
    <a aria-current="page" href={locale === 'en-XA' ? '/find-duplicates' : `/${locale}/find-duplicates`}>{copy.nav}</a>
  </nav>
  <span class="privacy">{copy.localOnly}</span>
</header>

<main class="tool-page t61-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <section class="tool-intro">
    <p class="eyebrow">{copy.eyebrow}</p>
    <h1>{copy.heading}</h1>
    <p>{copy.intro}</p>
    <p class="privacy-copy">{copy.privacy}</p>
    <label class="file-entry t61-picker">
      <span>{copy.select}</span>
      <input
        bind:this={input}
        data-testid="t61-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        aria-label={copy.input}
        onchange={chooseFiles}
        disabled={scanning}
      />
    </label>
    <p class="t61-limits">{copy.limits}</p>
    {#if files.length}
      <p data-testid="t61-selection">{files.length} · {formatBytes(totalBytes)}</p>
    {/if}
    <div class="t61-actions">
      <button class="button primary" data-testid="t61-scan" type="button" onclick={scan} disabled={scanning || files.length < 2 || Boolean(failure)}>{copy.scan}</button>
      <button class="button" data-testid="t61-clear" type="button" onclick={clearSelection} disabled={scanning && !files.length}>{copy.clear}</button>
    </div>
  </section>

  <section class="t61-results" aria-busy={scanning} aria-labelledby="t61-results-heading">
    <h2 id="t61-results-heading" class="t61-visually-hidden">{copy.match}</h2>
    <div class="t61-status" aria-live="polite" aria-atomic="true">
      {#if scanning}
        <p data-testid="t61-status">{progress || copy.scanning}</p>
        <button class="button" data-testid="t61-cancel" type="button" onclick={cancel}>{copy.cancel}</button>
      {:else if failure}
        <p role="alert" data-testid="t61-error" data-error-kind={failure.kind}>
          {failure.message}<br /><strong>{copy.remedy}:</strong> {failure.remedy}
        </p>
      {:else if exactGroups.length === 0 && nearPairs.length === 0 && files.length >= 2}
      <p data-testid="t61-empty">{copy.empty}<br /><strong>{copy.remedy}:</strong> {copy.emptyRemedy}</p>
      {:else if files.length < 2}
        <p data-testid="t61-status">{copy.ready}</p>
      {:else}
        <p data-testid="t61-status">{matchCount} {copy.match}</p>
      {/if}
    </div>

    {#if exactGroups.length || nearPairs.length}
      <h2>{copy.match}: {matchCount}</h2>
      {#if exactGroups.length}
        <section class="t61-section" aria-labelledby="t61-exact-heading">
          <h3 id="t61-exact-heading">{copy.exactHeading} ({exactGroups.length})</h3>
          <p>{copy.exactNote}</p>
          {#each exactGroups as group (group.id)}
            <fieldset class="t61-match" data-testid="t61-exact-group">
              <legend>{copy.exact}</legend>
              {#each group.images as image (image.id)}
                <div class="t61-file">
                  <img src={image.thumbnail} alt={image.file.name} width="144" height="144" />
                  <div>
                    <strong>{image.file.name}</strong>
                    <small>{copy.dimensions}: {image.width} × {image.height} · {copy.size}: {formatBytes(image.file.size)}</small>
                  </div>
                  <label>
                    <input type="radio" name={group.id} value={image.id} checked={keepers[group.id] === image.id} onchange={() => setKeeper(group.id, image.id)} />
                    {copy.first(image.file.name)}
                  </label>
                  {#if keepers[group.id] !== image.id}<span class="t61-review">{copy.manual}</span>{/if}
                </div>
              {/each}
            </fieldset>
          {/each}
        </section>
      {/if}

      {#if nearPairs.length}
        <section class="t61-section" aria-labelledby="t61-near-heading">
          <h3 id="t61-near-heading">{copy.nearHeading} ({nearPairs.length})</h3>
          <p>{copy.nearNote}</p>
          {#each nearPairs as pair (pair.id)}
            <fieldset class="t61-match" data-testid="t61-near-pair">
              <legend>{copy.visual} · {copy.difference}: aHash {pair.averageDistance}/64, dHash {pair.differenceDistance}/56</legend>
              {#each [pair.first, pair.second] as image (image.id)}
                <div class="t61-file">
                  <img src={image.thumbnail} alt={image.file.name} width="144" height="144" />
                  <div>
                    <strong>{image.file.name}</strong>
                    <small>{copy.dimensions}: {image.width} × {image.height} · {copy.size}: {formatBytes(image.file.size)}</small>
                  </div>
                  <label>
                    <input type="radio" name={pair.id} value={image.id} checked={keepers[pair.id] === image.id} onchange={() => setKeeper(pair.id, image.id)} />
                    {copy.other(image.file.name)}
                  </label>
                  {#if keepers[pair.id] !== image.id}<span class="t61-review">{copy.manual}</span>{/if}
                </div>
              {/each}
            </fieldset>
          {/each}
        </section>
      {/if}

      <div class="t61-report">
        <button class="button primary" data-testid="t61-report" type="button" onclick={downloadReport}>{copy.report}</button>
        <p>{copy.reportNote}</p>
      </div>
    {/if}
  </section>
</main>

<style>
  .duplicate-header { display: flex; align-items: center; justify-content: space-between; }
  .duplicate-header nav a[aria-current='page'] { font-weight: 700; text-decoration-thickness: 2px; }
  .t61-page { padding-bottom: 64px; }
  .t61-picker { max-width: 620px; flex-wrap: wrap; justify-content: center; }
  .t61-picker input { max-width: 100%; }
  .t61-limits { margin: 12px auto; font-size: 13px !important; }
  .t61-actions { display: flex; justify-content: center; gap: 12px; margin-top: 20px; }
  .t61-results { max-width: 1040px; margin: 0 auto; padding: 24px; }
  .t61-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .t61-results h2 { margin: 0 0 20px; font-size: 22px; }
  .t61-status { min-height: 56px; margin-bottom: 20px; }
  .t61-status p { line-height: 1.55; }
  .t61-section { margin: 28px 0; }
  .t61-section > h3 { margin-bottom: 8px; }
  .t61-section > p { color: #5c5a56; line-height: 1.55; }
  .t61-match { min-width: 0; margin: 16px 0; padding: 12px 18px 18px; border: 1px solid #1c1a1720; border-radius: 8px; background: white; }
  .t61-match legend { max-width: 100%; padding: 0 8px; font-weight: 650; overflow-wrap: anywhere; }
  .t61-file { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto auto; align-items: center; gap: 16px; padding: 12px 0; border-top: 1px solid #1c1a1712; }
  .t61-file img { width: 72px; height: 72px; object-fit: contain; background: #f0eeea; }
  .t61-file strong, .t61-file small { display: block; overflow-wrap: anywhere; }
  .t61-file small { margin-top: 4px; color: #5c5a56; }
  .t61-file label { display: inline-flex; align-items: center; gap: 6px; }
  .t61-review { border-radius: 999px; padding: 5px 10px; background: #eee9df; font-size: 12px; }
  .t61-report { margin-top: 32px; padding: 20px; border: 1px solid #1c1a171a; border-radius: 8px; background: white; text-align: center; }
  .t61-report p { margin-bottom: 0; color: #5c5a56; font-size: 13px; }
  @media (max-width: 767px) {
    .duplicate-header { padding-inline: 16px; }
    .duplicate-header .privacy { max-width: 46%; font-size: 11px; text-align: center; }
    .t61-picker { flex-direction: column; }
    .t61-results { padding: 16px; }
    .t61-file { grid-template-columns: 64px minmax(0, 1fr); align-items: start; gap: 8px; }
    .t61-file img { grid-row: span 3; width: 64px; height: 64px; }
  }
</style>
