<script lang="ts">
  /**
   * T74 Folder Watcher — README §4.10, §7.2, PLAN.md P6-01 / P6-02.
   *
   * This is a real watch loop, not a snapshot. On a browser with the File System Access API it
   * takes a directory handle, re-reads it on an interval (the API exposes no change event for a
   * folder), diffs against the previous scan, and writes every newly-seen image into a chosen
   * output folder using the format and quality below.
   *
   * Where the API is absent the watch controls are hidden rather than shown-but-broken, and the
   * ordinary multi-file picker does the same processing so the tool is still useful.
   */
  import { onDestroy } from 'svelte';
  import {
    T74FolderWatchOptionsSchema,
    t74FolderWatchOptionDescriptions,
    type T74FolderWatchOptions,
  } from '@complianttools/image-engine/schemas/p6-01-options';
  import {
    FALLBACK_ACCEPT,
    batchEntries,
    diffSnapshots,
    engineErrorMessage,
    isEngineError,
    isProcessableImage,
    outputFileName,
    scanFolder,
    supportsDirectoryAccess,
    type FolderSnapshot,
    type WatchedDirectoryHandle,
    type WatchEntry,
  } from '@complianttools/image-engine';
  import GeneratedControls from './GeneratedControls.svelte';
  import { localizeOptions, type Locale } from './i18n';

  type ErrorKind =
    | 'folder-picker-unavailable'
    | 'folder-picker-cancelled'
    | 'output-picker-unavailable'
    | 'output-picker-cancelled'
    | 'permission-denied'
    | 'read-failed'
    | 'write-failed'
    | 'decode-failed'
    | 'encoding-failed';

  type Processed = {
    readonly source: string;
    readonly output: string;
    readonly bytes: number;
  };

  const MAX_PIXELS = 20_000_000;
  const WRITE_BATCH = 8;
  const ORIGIN = 'https://image.complianttools.com';

  const enText = {
    title: 'Folder Watcher',
    eyebrow: 'Local batch and developer',
    description:
      'Pick a folder and an output folder, and every image that appears in the watched folder is re-encoded into the output folder on the next poll. The browser exposes no change event for a folder, so the watch is a timed re-read that diffs against what it last saw. Nothing is uploaded.',
    metaDescription:
      'Watch a local folder and re-encode new images into an output folder automatically, using the File System Access API. Everything runs locally.',
    privacy:
      'Files are read and written between two folders you choose on this device. Nothing is uploaded.',
    supportedHeading: 'Folder watch',
    unsupportedHeading: 'Folder watch is unavailable in this browser',
    unsupportedBody:
      'This browser does not implement the File System Access directory API, so a folder cannot be watched. The watch controls are hidden rather than shown broken. Choose the images directly below instead — the same re-encoding runs, there is just no automatic folder watch and no output folder.',
    chooseFolder: 'Watch this folder',
    chooseOutput: 'Choose output folder',
    changeOutput: 'Change output folder',
    watched: 'Watching',
    outputTo: 'Writing into',
    start: 'Start watching',
    stop: 'Stop watching',
    started: 'Watching {name}. {count} file(s) already present.',
    stopped: 'Stopped watching {name} after {count} processed file(s).',
    outputSet: 'Output folder set to {name}.',
    lastPoll: 'Last sweep: {value} new file(s), {total} total.',
    processed: 'Processed {value}: {name} ({bytes} bytes).',
    batchNote: 'Wrote {value} file(s) in this sweep.',
    fallbackHeading: 'Or choose images directly',
    fallbackHelp:
      'These are processed once, with the same format and quality as the watch. There is no output folder: the results are offered as downloads.',
    processNow: 'Process selected files',
    resultsHeading: 'Results',
    download: 'Download',
    batchDownloads: 'Download all',
    noResults: 'Nothing has been processed yet.',
    errors: {
      'folder-picker-unavailable':
        'This browser does not implement the File System Access directory API.',
      'folder-picker-cancelled': 'No folder was chosen.',
      'output-picker-unavailable':
        'This browser does not implement the File System Access directory API.',
      'output-picker-cancelled': 'No output folder was chosen.',
      'permission-denied': 'Permission to read or write that folder was not granted.',
      'read-failed': 'The watched folder could not be read.',
      'write-failed': 'The processed file could not be written to the output folder.',
      'decode-failed': 'One of the images could not be decoded.',
      'encoding-failed': 'One of the images could not be re-encoded.',
    },
    remedies: {
      'folder-picker-unavailable':
        'Use a current Chromium-based browser, or choose the images directly with the picker below.',
      'folder-picker-cancelled': 'Reopen the tool and choose a folder to watch.',
      'output-picker-unavailable':
        'Use a current Chromium-based browser, or process the chosen images directly with downloads.',
      'output-picker-cancelled': 'Choose an output folder, then start the watch.',
      'permission-denied':
        'Re-grant read and write access to the folder, and avoid a folder held by another application.',
      'read-failed':
        'Check that the folder still exists and is readable, then start the watch again.',
      'write-failed': 'Check the output folder is writable and has free space, then try again.',
      'decode-failed': 'Remove the file that failed and let the watch continue with the rest.',
      'encoding-failed': 'Choose a smaller image or a different output format.',
    },
    faqHeading: 'Questions about the folder watcher',
    faqHow: 'How does it detect new files?',
    faqHowAnswer:
      'The File System Access API gives a folder handle, not a change feed, so the folder is re-read on an interval and diffed against the previous scan. A file is treated as new when it is absent, or when its size or modified time changed — which is how a re-saved edit is noticed.',
    faqSupport: 'Which browsers support it?',
    faqSupportAnswer:
      'Browsers implementing the File System Access directory API: current Chromium-based ones. Elsewhere the watch controls are hidden and the tool falls back to picking images directly, which still re-encodes them with the same settings.',
    faqLoop: 'Does it stop on its own?',
    faqLoopAnswer:
      'No. The watch runs until you stop it or close the tab, because a background folder watch is only possible while the page is open.',
    faqPrivacy: 'Are files uploaded?',
    faqPrivacyAnswer:
      'No. Files are read from one local folder and written to another, entirely on your device.',
    related: 'Related tools',
    batch: 'Batch runner',
  } as const;

  type TextKey = Exclude<keyof typeof enText, 'errors' | 'remedies'>;
  type LocalizedCopy = Record<TextKey, string> & {
    errors: Record<ErrorKind, string>;
    remedies: Record<ErrorKind, string>;
  };

  const arText: LocalizedCopy = {
    title: 'مراقب المجلد',
    eyebrow: 'دفعي ومطوّر محلي',
    description:
      'اختر مجلدًا ومجلد إخراج، وتُعاد ترميز كل صورة تظهر في المجلد المراقب داخل مجلد الإخراج في المسح التالي. لا يعرض المتصفح أي حدث تغيير للمجلد، لذا المراقبة هي إعادة قراءة موقوتة تقارن بما قرأته آخر مرة. لا يُرفع شيء.',
    metaDescription:
      'راقب مجلدًا محليًا وأعد ترميز الصور الجديدة تلقائيًا إلى مجلد إخراج باستخدام واجهة نظام الملفات. كل شيء يعمل محليًا.',
    privacy: 'تُقرأ الملفات وتُكتب بين مجلدين تختارهما على هذا الجهاز. لا يُرفع شيء.',
    supportedHeading: 'مراقبة المجلد',
    unsupportedHeading: 'مراقبة المجلد غير متاحة في هذا المتصفح',
    unsupportedBody:
      'لا ينفّذ هذا المتصفح واجهة مجلدات نظام الملفات، لذا لا يمكن مراقبة مجلد. تُخفى عناصر المراقبة بدلًا من عرضها معطلة. اختر الصور مباشرة أدناه بدلًا من ذلك — تجري إعادة الترميز نفسها، لكن بلا مراقبة تلقائية وبلا مجلد إخراج.',
    chooseFolder: 'راقب هذا المجلد',
    chooseOutput: 'اختر مجلد الإخراج',
    changeOutput: 'غيّر مجلد الإخراج',
    watched: 'تُراقَب',
    outputTo: 'تُكتب في',
    start: 'ابدأ المراقبة',
    stop: 'أوقف المراقبة',
    started: 'تُراقَب {name}. {count} ملف موجود مسبقًا.',
    stopped: 'أُوقفت مراقبة {name} بعد معالجة {count} ملف.',
    outputSet: 'تم ضبط مجلد الإخراج على {name}.',
    lastPoll: 'آخر مسح: {value} ملف جديد، {total} إجمالًا.',
    processed: 'تمت معالجة {value}: {name} ({bytes} بايت).',
    batchNote: 'كُتب {value} ملف في هذا المسح.',
    fallbackHeading: 'أو اختر الصور مباشرة',
    fallbackHelp:
      'تُعالَج هذه الصور مرة واحدة، بالصيغة والجودة نفسها التي تستخدمها المراقبة. لا يوجد مجلد إخراج: تُعرض النتائج للتنزيل.',
    processNow: 'عالج الملفات المختارة',
    resultsHeading: 'النتائج',
    download: 'تنزيل',
    batchDownloads: 'تنزيل الكل',
    noResults: 'لم تُعالَج أي ملفات بعد.',
    errors: {
      'folder-picker-unavailable': 'لا ينفّذ هذا المتصفح واجهة مجلدات نظام الملفات.',
      'folder-picker-cancelled': 'لم يُختَر أي مجلد.',
      'output-picker-unavailable': 'لا ينفّذ هذا المتصفح واجهة مجلدات نظام الملفات.',
      'output-picker-cancelled': 'لم يُختَر أي مجلد إخراج.',
      'permission-denied': 'لم يُمنح إذن القراءة أو الكتابة لذلك المجلد.',
      'read-failed': 'تعذرت قراءة المجلد المراقب.',
      'write-failed': 'تعذرت كتابة الملف المعالج في مجلد الإخراج.',
      'decode-failed': 'تعذر فك ترميز إحدى الصور.',
      'encoding-failed': 'تعذرت إعادة ترميز إحدى الصور.',
    },
    remedies: {
      'folder-picker-unavailable':
        'استخدم متصفحًا حديثًا مبنيًا على Chromium، أو اختر الصور مباشرة من المنتقي أدناه.',
      'folder-picker-cancelled': 'أعد فتح الأداة واختر مجلدًا للمراقبة.',
      'output-picker-unavailable':
        'استخدم متصفحًا حديثًا مبنيًا على Chromium، أو عالج الصور المختارة مباشرة مع التنزيل.',
      'output-picker-cancelled': 'اختر مجلد إخراج ثم ابدأ المراقبة.',
      'permission-denied':
        'أعد منح صلاحية القراءة والكتابة للمجلد، وتجنب مجلدًا محتجزًا من تطبيق آخر.',
      'read-failed': 'تحقق من أن المجلد موجود وقابل للقراءة ثم ابدأ المراقبة مجددًا.',
      'write-failed': 'تحقق من أن مجلد الإخراج قابل للكتابة وأن فيه مساحة حرة ثم أعد المحاولة.',
      'decode-failed': 'أزل الملف الذي فشل ودع المراقبة تكمل الباقي.',
      'encoding-failed': 'اختر صورة أصغر أو صيغة إخراج مختلفة.',
    },
    faqHeading: 'أسئلة حول مراقب المجلد',
    faqHow: 'كيف يكتشف الملفات الجديدة؟',
    faqHowAnswer:
      'تمنح واجهة نظام الملفات مقبض مجلد لا تغذية تغييرات، لذا يُعاد قراءة المجلد على فترات وتُقارن بما قرأته آخر مرة. ويُعد الملف جديدًا إذا كان غائبًا أو تغيّر حجمه أو وقت تعديله — وهكذا يُلاحظ التعديل المحفوظ من جديد.',
    faqSupport: 'أي المتصفحات تدعمه؟',
    faqSupportAnswer:
      'المتصفحات التي تنفّذ واجهة مجلدات نظام الملفات: الحديثة المبنية على Chromium. وفي غيرها تُخفى عناصر المراقبة وتسقط الأداة إلى اختيار الصور مباشرة، وهو ما يعيد ترميزها بالإعدادات نفسها.',
    faqLoop: 'هل يتوقف من تلقاء نفسه؟',
    faqLoopAnswer:
      'لا. تستمر المراقبة حتى توقفها أو تغلق التبويب، لأن مراقبة مجلد في الخلفية لا تتاح إلا أثناء فتح الصفحة.',
    faqPrivacy: 'هل تُرفع الملفات؟',
    faqPrivacyAnswer: 'لا. تُقرأ الملفات من مجلد محلي وتُكتب في مجلد آخر، بالكامل على جهازك.',
    related: 'أدوات ذات صلة',
    batch: 'التشغيل الدفعي',
  };

  let { locale = 'en' }: { locale?: Locale } = $props();

  let options = $state<T74FolderWatchOptions>(T74FolderWatchOptionsSchema.parse({}));
  let watching = $state(false);
  let watchedName = $state('');
  let outputName = $state('');
  let processedCount = $state(0);
  let lastAdded = $state(0);
  let totalSeen = $state(0);
  let results = $state<readonly Processed[]>([]);
  let downloadUrls = $state<readonly { name: string; url: string }[]>([]);
  let busy = $state(false);
  let status = $state('');
  let error = $state<ErrorKind>();

  let sourceHandle = $state<WatchedDirectoryHandle>();
  let outputHandle = $state<WatchedDirectoryHandle>();
  let previousSnapshot = $state<FolderSnapshot>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let swept = false;

  /** Probed once on mount; the controls are hidden rather than shown-but-dead where it is false. */
  const directorySupported = supportsDirectoryAccess();

  const pseudo = (value: string) =>
    `［${value.replace(/[aeiou]/giu, (vowel) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[vowel.toLowerCase()] ?? vowel)}］`;
  const tr = (key: TextKey) => {
    const value = locale === 'ar' ? arText[key] : enText[key];
    return locale === 'en-XA' ? pseudo(value) : value;
  };
  const localized = (value: string): string => (locale === 'en-XA' ? pseudo(value) : value);
  const path = $derived(locale === 'en' ? '/watch' : `/${locale}/watch`);
  const canonical = $derived(`${ORIGIN}${path}`);
  const faq = $derived([
    { question: tr('faqHow'), answer: tr('faqHowAnswer') },
    { question: tr('faqSupport'), answer: tr('faqSupportAnswer') },
    { question: tr('faqLoop'), answer: tr('faqLoopAnswer') },
    { question: tr('faqPrivacy'), answer: tr('faqPrivacyAnswer') },
  ]);
  const localizedOptionDescriptions = $derived(
    localizeOptions(locale, t74FolderWatchOptionDescriptions),
  );
  const optionValues = $derived({
    't74.format': options.format,
    't74.quality': options.quality,
    't74.recursive': options.recursive,
    't74.pollIntervalMs': options.pollIntervalMs,
    't74.skipExisting': options.skipExisting,
  } as const);
  const schema = $derived({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: tr('title'),
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: tr('related'), item: `${ORIGIN}/batch` },
          { '@type': 'ListItem', position: 2, name: tr('title'), item: canonical },
        ],
      },
    ],
  });

  function errorText(kind: ErrorKind): string {
    const dictionary = locale === 'ar' ? arText : enText;
    return `${localized(dictionary.errors[kind])} ${localized(
      locale === 'ar' ? 'جرّب هذا' : 'Try this',
    )}: ${localized(dictionary.remedies[kind])}`;
  }

  function updateOption(path: string, value: unknown) {
    const key = path.startsWith('t74.') ? path.slice(4) : path;
    const parsed = T74FolderWatchOptionsSchema.safeParse({ ...options, [key]: value });
    if (parsed.success) {
      options = parsed.data;
      // The interval and scope are part of the sweep itself, so a change re-reads the folder from
      // scratch rather than continuing with the old scope.
      previousSnapshot = undefined;
      swept = false;
    }
  }

  async function pickFolder(into: 'source' | 'output') {
    if (!supportsDirectoryAccess()) {
      error = into === 'source' ? 'folder-picker-unavailable' : 'output-picker-unavailable';
      return;
    }
    try {
      const picker = (
        globalThis as unknown as {
          showDirectoryPicker: (options: {
            mode?: string;
            id?: string;
          }) => Promise<WatchedDirectoryHandle>;
        }
      ).showDirectoryPicker;
      const handle = await picker({
        mode: 'readwrite',
        id: into === 'source' ? 'ct-watch' : 'ct-out',
      });
      if (into === 'source') {
        sourceHandle = handle;
        watchedName = handle.name;
        previousSnapshot = undefined;
        swept = false;
      } else {
        outputHandle = handle;
        outputName = handle.name;
        status = localized(tr('outputSet')).replace('{name}', handle.name);
      }
      error = undefined;
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        error = into === 'source' ? 'folder-picker-cancelled' : 'output-picker-cancelled';
        return;
      }
      error = 'permission-denied';
    }
  }

  /** Re-encodes one image and writes it into the output folder, or returns it as a download. */
  async function processOne(
    file: Blob,
    name: string,
    write: ((bytes: Blob, outputName: string) => Promise<void>) | undefined,
  ): Promise<Processed> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw 'decode-failed' satisfies ErrorKind;
    }
    let width: number;
    let height: number;
    let canvas: HTMLCanvasElement;
    try {
      if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > MAX_PIXELS)
        throw 'decode-failed' satisfies ErrorKind;
      width = bitmap.width;
      height = bitmap.height;
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw 'decode-failed' satisfies ErrorKind;
      // WebP and JPEG have no alpha channel, so transparency is composited onto white rather
      // than silently becoming black in the output folder.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0);
    } finally {
      bitmap.close();
    }

    const mime = options.format === 'webp' ? 'image/webp' : 'image/jpeg';
    const encoded = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject('encoding-failed' satisfies ErrorKind)),
        mime,
        options.quality / 100,
      );
    });

    const output = outputFileName(name, options.format === 'webp' ? 'webp' : 'jpg');
    if (write) await write(encoded, output);
    else {
      const url = URL.createObjectURL(encoded);
      downloadUrls = [...downloadUrls, { name: output, url }];
    }
    return { source: name, output, bytes: encoded.size };
  }

  async function writeIntoOutput(bytes: Blob, name: string): Promise<void> {
    const handle = outputHandle;
    if (!handle) throw 'output-picker-cancelled' satisfies ErrorKind;
    try {
      const fileHandle = await (
        handle as unknown as {
          getFileHandle: (
            name: string,
            options: { create: boolean },
          ) => Promise<{
            createWritable(): Promise<{
              write(data: Blob): Promise<void>;
              close(): Promise<void>;
            }>;
          }>;
        }
      ).getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
    } catch {
      throw 'write-failed' satisfies ErrorKind;
    }
  }

  /** One sweep: re-read the folder, diff it, and process whatever is new. */
  async function sweep(): Promise<void> {
    const handle = sourceHandle;
    if (!handle || busy) return;
    busy = true;
    try {
      const snapshot = await scanFolder(handle, { recursive: options.recursive });
      totalSeen = snapshot.entries.size;

      // The first sweep establishes the baseline. With "ignore existing files" off the baseline is
      // also processed, which is what someone who points the tool at a folder of existing photos
      // expects; with it on, only later additions are.
      if (!previousSnapshot || (!swept && options.skipExisting)) {
        previousSnapshot = snapshot;
        swept = true;
        status = localized(tr('started'))
          .replace('{name}', watchedName)
          .replace('{count}', String(snapshot.entries.size));
        return;
      }

      const diff = diffSnapshots(previousSnapshot, snapshot);
      previousSnapshot = snapshot;
      lastAdded = diff.added.length;

      const processable = diff.added.filter((entry) => isProcessableImage(entry.name));
      const written: Processed[] = [];
      // Bounded batches so a folder that filled up while the tab was closed does not block the
      // page in one long synchronous burst.
      for (const batch of batchEntries(processable, WRITE_BATCH)) {
        for (const entry of batch) {
          try {
            const fileHandle = await resolveHandle(handle, entry);
            if (!fileHandle) continue;
            const file = await fileHandle.getFile();
            written.push(await processOne(file, entry.path, writeIntoOutput));
          } catch (cause) {
            if (typeof cause === 'string' && cause in enText.errors) error = cause as ErrorKind;
            else if (isEngineError(cause)) {
              error = 'read-failed';
              status = engineErrorMessage(cause);
            } else error = 'read-failed';
          }
        }
      }

      if (written.length > 0) {
        results = [...written, ...results].slice(0, 50);
        processedCount += written.length;
        status = `${localized(tr('batchNote')).replace('{value}', String(written.length))} ${localized(
          tr('processed'),
        )
          .replace('{value}', String(processedCount))
          .replace('{name}', written[0]!.output)
          .replace('{bytes}', String(written[0]!.bytes))}`;
      } else {
        status = localized(tr('lastPoll'))
          .replace('{value}', String(diff.added.length))
          .replace('{total}', String(snapshot.entries.size));
      }
      error = undefined;
    } catch (cause) {
      error = 'read-failed';
      if (isEngineError(cause)) status = engineErrorMessage(cause);
    } finally {
      busy = false;
    }
  }

  /** Resolves a scan entry back to a readable file handle. */
  async function resolveHandle(
    root: WatchedDirectoryHandle,
    entry: WatchEntry,
  ): Promise<{ getFile(): Promise<Blob> } | undefined> {
    const segments = entry.path.split('/');
    let directory = root;
    for (const segment of segments.slice(0, -1)) {
      directory = (await (
        directory as unknown as {
          getDirectoryHandle: (name: string) => Promise<WatchedDirectoryHandle>;
        }
      ).getDirectoryHandle(segment)) as WatchedDirectoryHandle;
    }
    return (await (
      directory as unknown as {
        getFileHandle: (name: string) => Promise<{ getFile(): Promise<Blob> }>;
      }
    ).getFileHandle(segments[segments.length - 1]!)) as { getFile(): Promise<Blob> };
  }

  function startWatching() {
    if (!sourceHandle) {
      error = 'folder-picker-cancelled';
      return;
    }
    if (!outputHandle) {
      error = 'output-picker-cancelled';
      return;
    }
    stopWatching();
    watching = true;
    void sweep();
    timer = setInterval(() => void sweep(), options.pollIntervalMs);
  }

  function stopWatching() {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (watching) {
      status = localized(tr('stopped'))
        .replace('{name}', watchedName)
        .replace('{count}', String(processedCount));
    }
    watching = false;
  }

  async function processSelection(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const selected = [...(input.files ?? [])].filter((file) => isProcessableImage(file.name));
    if (selected.length === 0) {
      error = 'decode-failed';
      return;
    }
    busy = true;
    error = undefined;
    const written: Processed[] = [];
    try {
      for (const batch of batchEntries(selected, WRITE_BATCH)) {
        for (const file of batch) {
          try {
            written.push(await processOne(file, file.name, undefined));
          } catch (cause) {
            if (typeof cause === 'string' && cause in enText.errors) error = cause as ErrorKind;
            else error = 'encoding-failed';
          }
        }
      }
      results = [...written, ...results].slice(0, 50);
      processedCount += written.length;
      status = localized(tr('batchNote')).replace('{value}', String(written.length));
    } finally {
      input.value = '';
      busy = false;
    }
  }

  function downloadAll() {
    for (const entry of downloadUrls) {
      const anchor = document.createElement('a');
      anchor.href = entry.url;
      anchor.download = entry.name;
      anchor.click();
    }
  }

  onDestroy(() => {
    stopWatching();
    for (const entry of downloadUrls) URL.revokeObjectURL(entry.url);
  });
</script>

<svelte:head>
  <title>{tr('title')} — Image Compliant Tools</title>
  <meta name="description" content={tr('metaDescription')} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${ORIGIN}/watch`} />
  <link rel="alternate" hreflang="en-XA" href={`${ORIGIN}/en-XA/watch`} />
  <link rel="alternate" hreflang="ar" href={`${ORIGIN}/ar/watch`} />
  <link rel="alternate" hreflang="x-default" href={`${ORIGIN}/watch`} />
  <meta property="og:title" content={tr('title')} />
  <meta property="og:description" content={tr('metaDescription')} />
  <meta property="og:image" content={`${ORIGIN}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={`${ORIGIN}/og/tools.svg`} />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(schema)}</svelte:element
  >
</svelte:head>

<main class="tool-page t74-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <header class="tool-intro">
    <p class="eyebrow">{tr('eyebrow')}</p>
    <h1>{tr('title')}</h1>
    <p>{tr('description')}</p>
    <p class="privacy-copy">{tr('privacy')}</p>
  </header>

  <section class="t74-controls" aria-labelledby="t74-watch-heading">
    <h2 id="t74-watch-heading" data-testid="t74-watch-heading">
      {directorySupported ? tr('supportedHeading') : tr('unsupportedHeading')}
    </h2>

    {#if !directorySupported}
      <p class="t74-unavailable" data-testid="t74-unavailable">{tr('unsupportedBody')}</p>
    {:else}
      <div class="t74-folders">
        <div class="t74-folder">
          <button
            class="button"
            data-testid="t74-choose-source"
            type="button"
            onclick={() => void pickFolder('source')}>{tr('chooseFolder')}</button
          >
          {#if watchedName}
            <p class="t74-folder-name" data-testid="t74-source-name">
              {tr('watched')}: <strong>{watchedName}</strong>
            </p>
          {/if}
        </div>
        <div class="t74-folder">
          <button
            class="button"
            data-testid="t74-choose-output"
            type="button"
            onclick={() => void pickFolder('output')}
            >{outputName ? tr('changeOutput') : tr('chooseOutput')}</button
          >
          {#if outputName}
            <p class="t74-folder-name" data-testid="t74-output-name">
              {tr('outputTo')}: <strong>{outputName}</strong>
            </p>
          {/if}
        </div>
      </div>
    {/if}

    <GeneratedControls
      descriptions={localizedOptionDescriptions}
      values={{ ...optionValues }}
      onChange={updateOption}
      {locale}
    />

    {#if directorySupported}
      <div class="t74-actions">
        {#if watching}
          <button class="button primary" data-testid="t74-stop" type="button" onclick={stopWatching}
            >{tr('stop')}</button
          >
        {:else}
          <button
            class="button primary"
            data-testid="t74-start"
            type="button"
            disabled={!sourceHandle || !outputHandle}
            onclick={startWatching}>{tr('start')}</button
          >
        {/if}
      </div>
    {/if}

    {#if status}
      <p role="status" aria-live="polite" data-testid="t74-status">{status}</p>
    {/if}
    {#if error}
      <p class="t74-error" role="alert" data-error-kind={error} data-testid="t74-error">
        {errorText(error)}
      </p>
    {/if}
  </section>

  <section class="t74-controls" aria-labelledby="t74-fallback-heading">
    <h2 id="t74-fallback-heading">{tr('fallbackHeading')}</h2>
    <label class="t74-file-card">
      <span>{tr('fallbackHeading')}</span>
      <input
        data-testid="t74-input"
        type="file"
        accept={FALLBACK_ACCEPT}
        multiple
        onchange={(event) => void processSelection(event)}
      />
    </label>
    <p class="t74-help">{tr('fallbackHelp')}</p>
  </section>

  {#if results.length > 0}
    <section class="t74-result" aria-labelledby="t74-results-heading">
      <h2 id="t74-results-heading">{tr('resultsHeading')}</h2>
      <ul class="t74-results" data-testid="t74-results">
        {#each results as entry (entry.output)}
          <li>
            <span>{entry.output} ({entry.bytes} bytes)</span>
          </li>
        {/each}
      </ul>
      {#if downloadUrls.length > 0}
        <button class="button" data-testid="t74-download-all" type="button" onclick={downloadAll}
          >{tr('batchDownloads')}</button
        >
      {/if}
      {#if watching}
        <p class="t74-help" data-testid="t74-sweep">
          {tr('lastPoll')
            .replace('{value}', String(lastAdded))
            .replace('{total}', String(totalSeen))}
        </p>
      {/if}
    </section>
  {:else}
    <p class="t74-help" data-testid="t74-no-results">{tr('noResults')}</p>
  {/if}

  <section class="tool-completion t74-faq" aria-labelledby="t74-faq-heading">
    <h2 id="t74-faq-heading">{tr('faqHeading')}</h2>
    {#each faq as item (item.question)}<details>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>{/each}
    <nav aria-label={tr('related')}>
      <a href={locale === 'en' ? '/batch' : `/${locale}/batch`}>{tr('batch')}</a>
    </nav>
  </section>
</main>

<style>
  .t74-controls,
  .t74-result,
  .t74-faq {
    width: min(1080px, calc(100% - 32px));
    margin: 0 auto 40px;
  }
  .t74-controls {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: white;
  }
  .t74-controls h2,
  .t74-result h2 {
    margin-block-start: 0;
  }
  .t74-folders {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
    margin-block-end: 24px;
  }
  .t74-folder {
    display: grid;
    gap: 8px;
    justify-items: start;
    padding: 16px;
    border: 1px solid #1c1a1720;
    border-radius: 8px;
  }
  .t74-folder-name,
  .t74-help {
    margin: 0;
    color: #5c5a56;
    font-size: 13px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
  .t74-unavailable {
    padding: 12px;
    border-inline-start: 4px solid #8a6a1f;
    color: #6b5216;
    background: #fffaf0;
  }
  .t74-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .t74-file-card {
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    border: 1px solid #1c1a1720;
    border-radius: 8px;
  }
  .t74-file-card > span:first-child {
    font-weight: 600;
  }
  .t74-file-card input {
    max-width: 100%;
  }
  .t74-result {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: #fff;
  }
  .t74-results {
    margin: 0 0 16px;
    padding: 0;
    list-style: none;
    font-variant-numeric: tabular-nums;
  }
  .t74-results li {
    padding-block: 6px;
    border-block-end: 1px solid #1c1a1714;
  }
  .t74-error {
    padding: 12px;
    border-inline-start: 4px solid #a21f17;
    color: #7c1711;
    background: #fff1ef;
  }
  @media (max-width: 700px) {
    .t74-controls,
    .t74-result {
      padding: 16px;
    }
  }
</style>
