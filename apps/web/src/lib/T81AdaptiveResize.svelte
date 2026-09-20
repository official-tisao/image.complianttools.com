<script lang="ts">
  import { onDestroy, tick } from 'svelte';

  type Locale = 'en' | 'en-XA' | 'ar';
  type ErrorKind =
    | 'unsupported-file'
    | 'file-too-large'
    | 'image-too-large'
    | 'animated-image'
    | 'invalid-png'
    | 'decode-failed'
    | 'canvas-unavailable'
    | 'invalid-dimensions'
    | 'output-too-large'
    | 'mask-does-not-fit'
    | 'processing-failed'
    | 'cancelled';
  type Dimensions = { readonly width: number; readonly height: number };
  type SelectedImage = { readonly file: File; readonly url: string; readonly dimensions: Dimensions };
  type WorkerResult =
    | { readonly type: 'result'; readonly width: number; readonly height: number; readonly data: ArrayBuffer; readonly fallback: boolean }
    | { readonly type: 'error'; readonly kind: 'invalid-payload' | 'mask-does-not-fit' | 'processing-failed' };

  const MAX_FILE_BYTES = 16 * 1024 * 1024;
  const MAX_AXIS = 320;
  const MAX_PIXELS = MAX_AXIS * MAX_AXIS;
  const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
  const ORIGIN = 'https://image.complianttools.com';

  const enText = {
    title: 'Adaptive Resize',
    description: 'Retarget a small still PNG with local saliency-weighted continuous warping. This method redistributes scaling across rows and columns; it does not remove seams and can visibly distort image content.',
    metaDescription: 'Locally retarget a still PNG with saliency-weighted continuous warping. Adjust its size, paint an approximate mask, preview, and download.',
    eyebrow: 'Local image tool',
    privacy: 'Your image stays in this browser. No model, upload, or network service is used.',
    inputHeading: 'Choose an image and output size',
    inputLabel: 'Still PNG image',
    chooseImage: 'Choose a still PNG image',
    inputHelp: 'PNG only, up to 16 MiB, 320 pixels on either side, and 102,400 pixels total. Animated PNG is not supported.',
    width: 'Target width in pixels',
    height: 'Target height in pixels',
    maskToggle: 'Use an approximate protection mask (optional)',
    maskHelp: 'When enabled, paint over an area to bias sampling density around its rows and columns. This is not a hard content lock: pixels can still change or move, and downsizing may fail when too many rows or columns are protected.',
    maskKeyboard: 'Keyboard: focus the image area, use arrow keys to move the brush, press Space or Enter to paint, and press Delete to clear the mask.',
    maskCanvasLabel: 'Protection mask drawing area. Arrow keys move the brush; Space or Enter paints; Delete clears.',
    clearMask: 'Clear protection mask',
    maskCount: 'Marked pixels',
    apply: 'Resize image',
    cancel: 'Cancel',
    busy: 'Retargeting locally…',
    ready: 'Choose an image and target dimensions to begin.',
    selected: 'Image selected',
    before: 'Before',
    after: 'After',
    resultHeading: 'Resize preview',
    download: 'Download resized PNG',
    done: 'Preview ready. Inspect the result before downloading.',
    dimensions: 'Output dimensions',
    fallback: 'The saliency profile was too uniform, so the engine returned the original image unchanged. No resized output was created. Try an image with more visible detail or use ordinary resize instead.',
    faqHeading: 'Questions about adaptive resize',
    faqMethod: 'Does this remove seams?',
    faqMethodAnswer: 'No. This is saliency-weighted continuous warping: it changes sampling density across image rows and columns. It does not remove seams and can distort content.',
    faqMask: 'What does the protection mask do?',
    faqMaskAnswer: 'Painted regions bias row and column sampling density. The mask is approximate: it does not guarantee unchanged pixels, and a protected mask that does not fit the requested dimensions is rejected.',
    faqPrivacy: 'Are images uploaded?',
    faqPrivacyAnswer: 'No. PNG decoding, retargeting, preview, and export run locally in your browser. No model or network service is used.',
    related: 'Related tools',
    ordinaryResize: 'Ordinary resize',
    errors: {
      'unsupported-file': 'Choose a valid PNG image.',
      'file-too-large': 'The PNG exceeds the 16 MiB file limit.',
      'image-too-large': 'The image must be at most 320 pixels on either side and 102,400 pixels total.',
      'animated-image': 'Animated PNG is not supported.',
      'invalid-png': 'The PNG structure is incomplete or invalid.',
      'decode-failed': 'The browser could not decode this PNG.',
      'canvas-unavailable': 'The browser could not create a local image canvas.',
      'invalid-dimensions': 'Enter a positive whole-number width and height, each no greater than 320 pixels.',
      'output-too-large': 'The PNG output exceeds the 2 MiB export limit.',
      'mask-does-not-fit': 'The protected rows or columns do not fit the requested target size.',
      'processing-failed': 'Local adaptive resize could not finish this image.',
      cancelled: 'Adaptive resize was cancelled.',
    } satisfies Record<ErrorKind, string>,
    remedies: {
      'unsupported-file': 'Export the image as a still PNG and choose it again.',
      'file-too-large': 'Choose a PNG smaller than 16 MiB.',
      'image-too-large': 'Choose a smaller image within the stated side and pixel limits.',
      'animated-image': 'Export one still frame as a regular PNG.',
      'invalid-png': 'Export a valid PNG and choose it again.',
      'decode-failed': 'Export a valid, non-animated PNG and try again.',
      'canvas-unavailable': 'Try a browser with local 2D canvas support.',
      'invalid-dimensions': 'Set both target dimensions to whole numbers from 1 through 320.',
      'output-too-large': 'Choose smaller target dimensions and try again.',
      'mask-does-not-fit': 'Increase the target size or clear/reduce the protected area.',
      'processing-failed': 'Try a smaller still PNG. Your original file is unchanged.',
      cancelled: 'Choose the image and start resizing again when ready.',
    } satisfies Record<ErrorKind, string>,
  } as const;

  type TextKey = Exclude<keyof typeof enText, 'errors' | 'remedies'>;
  type LocalizedCopy = Record<TextKey, string> & {
    errors: Record<ErrorKind, string>;
    remedies: Record<ErrorKind, string>;
  };

  const arText: LocalizedCopy = {
    title: 'تغيير الحجم التكيفي',
    description: 'أعد تهيئة أبعاد صورة PNG ثابتة صغيرة باستخدام تشويه مستمر محلي موزون بالبروز البصري. يوزع هذا الأسلوب التحجيم على الصفوف والأعمدة؛ ولا يزيل المسارات، وقد يشوه محتوى الصورة بوضوح.',
    metaDescription: 'أعد تهيئة صورة PNG ثابتة صغيرة محليًا بتشويه مستمر موزون بالبروز. اضبط الأبعاد، وارسم قناع حماية تقريبيًا اختياريًا، وافحص المعاينة ثم نزّل PNG.',
    eyebrow: 'أداة صور محلية',
    privacy: 'تبقى صورتك في هذا المتصفح. لا يُستخدم نموذج أو رفع أو خدمة شبكة.',
    inputHeading: 'اختر صورة وحجم الإخراج',
    inputLabel: 'صورة PNG ثابتة',
    chooseImage: 'اختر صورة PNG ثابتة',
    inputHelp: 'PNG فقط، حتى 16 ميبيبايت و320 بكسل لكل جانب و102,400 بكسل إجمالًا. لا يدعم PNG المتحرك.',
    width: 'عرض الإخراج بالبكسل',
    height: 'ارتفاع الإخراج بالبكسل',
    maskToggle: 'استخدم قناع حماية تقريبيًا (اختياري)',
    maskHelp: 'عند التفعيل، ارسم فوق منطقة لتوجيه كثافة أخذ العينات حول صفوفها وأعمدتها. هذا ليس قفلًا للمحتوى: قد تتغير البكسلات أو تتحرك، وقد يفشل التصغير إذا حُميت صفوف أو أعمدة كثيرة.',
    maskKeyboard: 'لوحة المفاتيح: ركّز على مساحة الصورة، واستخدم الأسهم لتحريك الفرشاة، واضغط مسافة أو Enter للرسم، واضغط Delete لمسح القناع.',
    maskCanvasLabel: 'مساحة رسم قناع الحماية. تحرك الأسهم الفرشاة، ويرسم Space أو Enter، ويمسح Delete القناع.',
    clearMask: 'امسح قناع الحماية',
    maskCount: 'البكسلات المحددة',
    apply: 'غيّر حجم الصورة',
    cancel: 'إلغاء',
    busy: 'جارٍ تغيير الأبعاد محليًا…',
    ready: 'اختر صورة وأبعاد الإخراج للبدء.',
    selected: 'تم اختيار الصورة',
    before: 'قبل',
    after: 'بعد',
    resultHeading: 'معاينة تغيير الحجم',
    download: 'تنزيل PNG بعد تغيير الحجم',
    done: 'المعاينة جاهزة. افحص النتيجة قبل التنزيل.',
    dimensions: 'أبعاد الإخراج',
    fallback: 'كان ملف البروز متجانسًا جدًا، لذلك أعاد المحرك الصورة الأصلية دون تغيير. لم يُنشأ إخراج بأبعاد جديدة. جرّب صورة ذات تفاصيل أوضح أو استخدم تغيير الحجم العادي.',
    faqHeading: 'أسئلة حول تغيير الحجم التكيفي',
    faqMethod: 'هل تزيل هذه الطريقة المسارات؟',
    faqMethodAnswer: 'لا. هذا تشويه مستمر موزون بالبروز: يغير كثافة أخذ العينات عبر صفوف الصورة وأعمدتها. لا يزيل المسارات وقد يشوه المحتوى.',
    faqMask: 'ماذا يفعل قناع الحماية؟',
    faqMaskAnswer: 'توجه المناطق المرسومة كثافة أخذ العينات في الصفوف والأعمدة. القناع تقريبي ولا يضمن بقاء البكسلات دون تغيير، ويُرفض إذا لم يتسع القناع للأبعاد المطلوبة.',
    faqPrivacy: 'هل تُرفع الصور؟',
    faqPrivacyAnswer: 'لا. يجري فك PNG وإعادة التهيئة والمعاينة والتصدير محليًا في المتصفح. لا يُستخدم نموذج أو خدمة شبكة.',
    related: 'أدوات ذات صلة',
    ordinaryResize: 'تغيير الحجم العادي',
    errors: {
      'unsupported-file': 'اختر صورة PNG صالحة.',
      'file-too-large': 'يتجاوز ملف PNG حد الحجم البالغ 16 ميبيبايت.',
      'image-too-large': 'يجب ألا يتجاوز كل جانب 320 بكسل ولا أن يتجاوز الإجمالي 102,400 بكسل.',
      'animated-image': 'لا يدعم PNG المتحرك.',
      'invalid-png': 'بنية PNG غير مكتملة أو غير صالحة.',
      'decode-failed': 'تعذر على المتصفح فك ترميز صورة PNG.',
      'canvas-unavailable': 'تعذر على المتصفح إنشاء لوحة صور محلية.',
      'invalid-dimensions': 'أدخل عرضًا وارتفاعًا صحيحين موجبين، على ألا يتجاوز أي منهما 320 بكسل.',
      'output-too-large': 'يتجاوز إخراج PNG حد التصدير البالغ 2 ميبيبايت.',
      'mask-does-not-fit': 'الصفوف أو الأعمدة المحمية لا تتسع ضمن الحجم المطلوب.',
      'processing-failed': 'تعذرت إعادة تهيئة أبعاد الصورة محليًا.',
      cancelled: 'تم إلغاء تغيير الحجم التكيفي.',
    },
    remedies: {
      'unsupported-file': 'صدّر الصورة بصيغة PNG ثابتة ثم اخترها مجددًا.',
      'file-too-large': 'اختر صورة PNG أصغر من 16 ميبيبايت.',
      'image-too-large': 'اختر صورة أصغر ضمن حدود الأبعاد المذكورة.',
      'animated-image': 'صدّر إطارًا ثابتًا واحدًا بصيغة PNG عادية.',
      'invalid-png': 'صدّر صورة PNG صالحة ثم اخترها مجددًا.',
      'decode-failed': 'صدّر PNG صالحة غير متحركة ثم أعد المحاولة.',
      'canvas-unavailable': 'جرّب متصفحًا يدعم لوحة 2D محلية.',
      'invalid-dimensions': 'اجعل كلا البعدين عددًا صحيحًا من 1 إلى 320.',
      'output-too-large': 'اختر أبعاد إخراج أصغر ثم أعد المحاولة.',
      'mask-does-not-fit': 'زد حجم الإخراج أو امسح جزءًا من المنطقة المحمية.',
      'processing-failed': 'جرّب صورة PNG ثابتة أصغر. يبقى الملف الأصلي دون تغيير.',
      cancelled: 'اختر الصورة وابدأ تغيير الحجم مجددًا عند الاستعداد.',
    },
  };

  let { locale = 'en' }: { locale?: Locale } = $props();
  let selected = $state<SelectedImage>();
  let targetWidth = $state(1);
  let targetHeight = $state(1);
  let protectEnabled = $state(false);
  let protectionMask = $state<Uint8ClampedArray>();
  let protectedPixelCount = $state(0);
  let outputUrl = $state('');
  let outputBytes = $state(0);
  let outputDimensions = $state<Dimensions>();
  let busy = $state(false);
  let status = $state('');
  let error = $state<ErrorKind>();
  let maskCanvas: HTMLCanvasElement | undefined;
  let maskCursor = $state({ x: 0, y: 0 });
  let drawing = false;
  let activeWorker: Worker | undefined;
  let rejectWorker: ((reason: ErrorKind) => void) | undefined;
  let operationId = 0;

  const pseudo = (value: string) =>
    `⟦${value.replace(/[aeiou]/giu, (vowel) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[vowel.toLowerCase()] ?? vowel)}⟧`;
  const tr = (key: TextKey) => {
    const value = locale === 'ar' ? arText[key] : enText[key];
    return locale === 'en-XA' ? pseudo(value) : value;
  };
  const title = $derived(tr('title'));
  const description = $derived(tr('metaDescription'));
  const path = $derived(locale === 'en' ? '/adaptive-resize' : `/${locale}/adaptive-resize`);
  const canonical = $derived(`${ORIGIN}${path}`);
  const faq = $derived([
    { question: tr('faqMethod'), answer: tr('faqMethodAnswer') },
    { question: tr('faqMask'), answer: tr('faqMaskAnswer') },
    { question: tr('faqPrivacy'), answer: tr('faqPrivacyAnswer') },
  ]);
  const schema = $derived({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'SoftwareApplication', name: title, applicationCategory: 'MultimediaApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' } },
      { '@type': 'FAQPage', mainEntity: faq.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: tr('related'), item: `${ORIGIN}/resize` }, { '@type': 'ListItem', position: 2, name: title, item: canonical }] },
    ],
  });

  function localized(value: string): string {
    return locale === 'en-XA' ? pseudo(value) : value;
  }

  function errorText(kind: ErrorKind): string {
    const dictionary = locale === 'ar' ? arText : enText;
    const main = dictionary.errors[kind];
    const remedy = dictionary.remedies[kind];
    return `${localized(main)} ${localized(locale === 'ar' ? 'جرّب هذا' : 'Try this')}: ${localized(remedy)}`;
  }

  function clearOutput() {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = '';
    outputBytes = 0;
    outputDimensions = undefined;
  }

  function clearResult() {
    clearOutput();
    error = undefined;
    status = '';
  }

  function cancelWorker() {
    operationId += 1;
    const reject = rejectWorker;
    const worker = activeWorker;
    activeWorker = undefined;
    rejectWorker = undefined;
    worker?.terminate();
    reject?.('cancelled');
    busy = false;
  }

  async function inspectPng(file: File): Promise<Dimensions> {
    if (file.size > MAX_FILE_BYTES) throw new Error('file-too-large');
    const header = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (
      header.length < 24 ||
      !PNG_SIGNATURE.every((byte, index) => header[index] === byte) ||
      String.fromCharCode(...header.slice(12, 16)) !== 'IHDR'
    ) throw new Error('unsupported-file');

    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (!width || !height || width > MAX_AXIS || height > MAX_AXIS || width * height > MAX_PIXELS) {
      throw new Error('image-too-large');
    }

    let offset = 8;
    let foundImageData = false;
    for (let count = 0; count < 128 && offset + 8 <= file.size; count += 1) {
      const chunk = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      if (chunk.length !== 8) break;
      const length = new DataView(chunk.buffer, chunk.byteOffset, 4).getUint32(0);
      const type = String.fromCharCode(...chunk.slice(4, 8));
      if (type === 'acTL') throw new Error('animated-image');
      if (type === 'IDAT') {
        foundImageData = true;
        break;
      }
      if (type === 'IEND' || offset + length + 12 > file.size) break;
      offset += length + 12;
    }
    if (!foundImageData) throw new Error('invalid-png');
    return { width, height };
  }

  function typedKind(cause: unknown): ErrorKind | undefined {
    if (cause instanceof Error && cause.message in enText.errors) return cause.message as ErrorKind;
    return undefined;
  }

  function clearMask() {
    protectionMask?.fill(0);
    protectedPixelCount = 0;
    const context = maskCanvas?.getContext('2d');
    if (context && maskCanvas) context.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    clearResult();
  }

  async function chooseImage(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    cancelWorker();
    clearOutput();
    if (selected) URL.revokeObjectURL(selected.url);
    selected = undefined;
    protectionMask = undefined;
    protectedPixelCount = 0;
    protectEnabled = false;
    status = '';
    error = undefined;
    try {
      const dimensions = await inspectPng(file);
      const next: SelectedImage = { file, dimensions, url: URL.createObjectURL(file) };
      selected = next;
      targetWidth = dimensions.width;
      targetHeight = dimensions.height;
      status = tr('selected');
      maskCursor = { x: Math.floor(dimensions.width / 2), y: Math.floor(dimensions.height / 2) };
    } catch (cause) {
      error = typedKind(cause) ?? 'unsupported-file';
    }
  }

  async function toggleProtection(event: Event) {
    protectEnabled = (event.currentTarget as HTMLInputElement).checked;
    clearResult();
    if (!protectEnabled || !selected) return;
    await tick();
    if (!maskCanvas || !selected) return;
    const { width, height } = selected.dimensions;
    maskCanvas.width = width;
    maskCanvas.height = height;
    protectionMask ??= new Uint8ClampedArray(width * height);
    const context = maskCanvas.getContext('2d');
    if (!context) {
      error = 'canvas-unavailable';
      return;
    }
    const painted = context.createImageData(width, height);
    for (let index = 0; index < protectionMask.length; index += 1) {
      if (protectionMask[index] !== 0) {
        const offset = index * 4;
        painted.data[offset] = 72;
        painted.data[offset + 1] = 40;
        painted.data[offset + 2] = 145;
        painted.data[offset + 3] = 110;
      }
    }
    context.putImageData(painted, 0, 0);
  }

  async function decode(file: File): Promise<{ readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }> {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      if (!bitmap.width || !bitmap.height || bitmap.width > MAX_AXIS || bitmap.height > MAX_AXIS || bitmap.width * bitmap.height > MAX_PIXELS) {
        throw new Error('image-too-large');
      }
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('canvas-unavailable');
      context.drawImage(bitmap, 0, 0);
      return {
        width: bitmap.width,
        height: bitmap.height,
        data: new Uint8ClampedArray(context.getImageData(0, 0, bitmap.width, bitmap.height).data),
      };
    } catch (cause) {
      if (typedKind(cause)) throw cause;
      throw new Error('decode-failed');
    } finally {
      bitmap?.close();
    }
  }

  function runWorker(
    image: Awaited<ReturnType<typeof decode>>,
    width: number,
    height: number,
    mask?: Uint8ClampedArray,
  ): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('../workers/t81-adaptive-resize-worker.ts', import.meta.url), { type: 'module' });
      } catch {
        reject('processing-failed' satisfies ErrorKind);
        return;
      }
      activeWorker = worker;
      const finish = () => {
        worker.terminate();
        if (activeWorker === worker) activeWorker = undefined;
        if (rejectWorker === cancel) rejectWorker = undefined;
      };
      const cancel = (reason: ErrorKind) => {
        finish();
        reject(reason);
      };
      rejectWorker = cancel;
      worker.onmessage = (event: MessageEvent<WorkerResult>) => {
        finish();
        if (event.data.type === 'result') resolve(event.data);
        else reject(event.data.kind === 'mask-does-not-fit' ? 'mask-does-not-fit' : 'processing-failed');
      };
      worker.onerror = () => {
        finish();
        reject('processing-failed' satisfies ErrorKind);
      };
      try {
        const sourceBuffer = image.data.buffer as ArrayBuffer;
        const maskBuffer = mask?.buffer as ArrayBuffer | undefined;
        const transfer: Transferable[] = [sourceBuffer];
        if (maskBuffer) transfer.push(maskBuffer);
        worker.postMessage(
          { width: image.width, height: image.height, targetWidth: width, targetHeight: height, data: sourceBuffer, protectMask: maskBuffer },
          transfer,
        );
      } catch {
        finish();
        reject('processing-failed' satisfies ErrorKind);
      }
    });
  }

  async function pngBlob(width: number, height: number, data: Uint8ClampedArray): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas-unavailable');
    const imageData = context.createImageData(width, height);
    imageData.data.set(data);
    context.putImageData(imageData, 0, 0);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('processing-failed')), 'image/png');
      });
      if (blob.size > MAX_OUTPUT_BYTES) throw new Error('output-too-large');
      return blob;
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  async function resizeImage() {
    if (!selected) {
      error = 'unsupported-file';
      return;
    }
    if (
      !Number.isInteger(targetWidth) || !Number.isInteger(targetHeight) ||
      targetWidth < 1 || targetHeight < 1 || targetWidth > MAX_AXIS || targetHeight > MAX_AXIS
    ) {
      error = 'invalid-dimensions';
      return;
    }
    if (targetWidth * targetHeight > MAX_PIXELS) {
      error = 'image-too-large';
      return;
    }

    cancelWorker();
    const task = ++operationId;
    const sourceFile = selected.file;
    const mask = protectEnabled && protectedPixelCount > 0 ? protectionMask?.slice() : undefined;
    clearOutput();
    error = undefined;
    status = '';
    busy = true;
    try {
      const image = await decode(sourceFile);
      if (task !== operationId) return;
      const result = await runWorker(image, targetWidth, targetHeight, mask);
      if (task !== operationId || result.type !== 'result') return;
      if (result.fallback) {
        status = tr('fallback');
        return;
      }
      const blob = await pngBlob(result.width, result.height, new Uint8ClampedArray(result.data));
      if (task !== operationId) return;
      outputUrl = URL.createObjectURL(blob);
      outputBytes = blob.size;
      outputDimensions = { width: result.width, height: result.height };
      status = tr('done');
    } catch (cause) {
      if (task !== operationId) return;
      error = typeof cause === 'string' && cause in enText.errors
        ? cause as ErrorKind
        : typedKind(cause) ?? 'processing-failed';
    } finally {
      if (task === operationId) busy = false;
    }
  }

  function cancelResize() {
    cancelWorker();
    clearOutput();
    error = 'cancelled';
  }

  function downloadName(file: File): string {
    const stem = file.name.replace(/\.[^.]+$/u, '').replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '_').slice(0, 100) || 'image';
    return `${stem}-adaptive-resized.png`;
  }

  function drawAt(x: number, y: number) {
    if (!selected || !protectionMask || !maskCanvas) return;
    const radius = Math.max(2, Math.round(Math.max(selected.dimensions.width, selected.dimensions.height) * 0.018));
    const centerX = Math.max(0, Math.min(selected.dimensions.width - 1, Math.round(x)));
    const centerY = Math.max(0, Math.min(selected.dimensions.height - 1, Math.round(y)));
    for (let py = Math.max(0, centerY - radius); py <= Math.min(selected.dimensions.height - 1, centerY + radius); py += 1) {
      for (let px = Math.max(0, centerX - radius); px <= Math.min(selected.dimensions.width - 1, centerX + radius); px += 1) {
        if ((px - centerX) ** 2 + (py - centerY) ** 2 > radius ** 2) continue;
        const index = py * selected.dimensions.width + px;
        if (protectionMask[index] === 0) {
          protectionMask[index] = 255;
          protectedPixelCount += 1;
        }
      }
    }
    const context = maskCanvas.getContext('2d');
    if (context) {
      context.fillStyle = 'rgba(72, 40, 145, 0.42)';
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();
    }
    maskCursor = { x: centerX, y: centerY };
    clearResult();
  }

  function pointerPoint(event: PointerEvent): { readonly x: number; readonly y: number } | undefined {
    if (!maskCanvas || !selected) return undefined;
    const rect = maskCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return undefined;
    return {
      x: ((event.clientX - rect.left) / rect.width) * selected.dimensions.width,
      y: ((event.clientY - rect.top) / rect.height) * selected.dimensions.height,
    };
  }

  function pointerDown(event: PointerEvent) {
    const point = pointerPoint(event);
    if (!point || !maskCanvas) return;
    drawing = true;
    maskCanvas.setPointerCapture(event.pointerId);
    drawAt(point.x, point.y);
  }

  function pointerMove(event: PointerEvent) {
    const point = pointerPoint(event);
    if (point && drawing) drawAt(point.x, point.y);
  }

  function pointerUp() {
    drawing = false;
  }

  function maskKeydown(event: KeyboardEvent) {
    if (!selected) return;
    const step = 8;
    if (event.key === 'ArrowLeft') maskCursor = { ...maskCursor, x: Math.max(0, maskCursor.x - step) };
    else if (event.key === 'ArrowRight') maskCursor = { ...maskCursor, x: Math.min(selected.dimensions.width - 1, maskCursor.x + step) };
    else if (event.key === 'ArrowUp') maskCursor = { ...maskCursor, y: Math.max(0, maskCursor.y - step) };
    else if (event.key === 'ArrowDown') maskCursor = { ...maskCursor, y: Math.min(selected.dimensions.height - 1, maskCursor.y + step) };
    else if (event.key === ' ' || event.key === 'Enter') drawAt(maskCursor.x, maskCursor.y);
    else if (event.key === 'Delete') clearMask();
    else return;
    event.preventDefault();
  }

  onDestroy(() => {
    cancelWorker();
    if (selected) URL.revokeObjectURL(selected.url);
    clearOutput();
  });
</script>

<svelte:head>
  <title>{title} — Image Compliant Tools</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${ORIGIN}/adaptive-resize`} />
  <link rel="alternate" hreflang="en-XA" href={`${ORIGIN}/en-XA/adaptive-resize`} />
  <link rel="alternate" hreflang="ar" href={`${ORIGIN}/ar/adaptive-resize`} />
  <link rel="alternate" hreflang="x-default" href={`${ORIGIN}/adaptive-resize`} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={`${ORIGIN}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={`${ORIGIN}/og/tools.svg`} />
  <svelte:element this={'script'} type="application/ld+json">{JSON.stringify(schema)}</svelte:element>
</svelte:head>

<main class="tool-page t81-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <header class="tool-intro">
    <p class="eyebrow">{tr('eyebrow')}</p>
    <h1>{title}</h1>
    <p>{tr('description')}</p>
    <p class="privacy-copy">{tr('privacy')}</p>
  </header>

  <section class="t81-controls" aria-labelledby="t81-input-heading">
    <h2 id="t81-input-heading">{tr('inputHeading')}</h2>
    <label class="t81-file-card">
      <span>{tr('inputLabel')}</span>
      <input data-testid="t81-input" type="file" accept="image/png,.png" aria-label={tr('chooseImage')} onchange={chooseImage} />
      {#if selected}<span class="t81-selected">{selected.file.name} · {selected.dimensions.width} × {selected.dimensions.height}</span>{/if}
    </label>
    <p class="t81-help">{tr('inputHelp')}</p>

    <fieldset class="t81-dimensions">
      <legend>{tr('dimensions')}</legend>
      <label>
        <span>{tr('width')}</span>
        <input data-testid="t81-width" type="number" min="1" max={MAX_AXIS} step="1" value={targetWidth} oninput={(event) => { targetWidth = (event.currentTarget as HTMLInputElement).value === '' ? 0 : Number((event.currentTarget as HTMLInputElement).value); clearResult(); }} />
      </label>
      <label>
        <span>{tr('height')}</span>
        <input data-testid="t81-height" type="number" min="1" max={MAX_AXIS} step="1" value={targetHeight} oninput={(event) => { targetHeight = (event.currentTarget as HTMLInputElement).value === '' ? 0 : Number((event.currentTarget as HTMLInputElement).value); clearResult(); }} />
      </label>
    </fieldset>

    <div class="t81-mask-controls">
      <label class="t81-mask-toggle">
        <input data-testid="t81-mask-toggle" type="checkbox" checked={protectEnabled} disabled={!selected} onchange={toggleProtection} />
        <span>{tr('maskToggle')}</span>
      </label>
      <p id="t81-mask-help" class="t81-help">{tr('maskHelp')}</p>
      {#if protectEnabled && selected}
        <p id="t81-mask-keyboard" class="t81-help">{tr('maskKeyboard')}</p>
        <div class="t81-mask-actions">
          <button class="button" data-testid="t81-clear-mask" type="button" onclick={clearMask}>{tr('clearMask')}</button>
          <span>{tr('maskCount')}: {protectedPixelCount}</span>
        </div>
        <div class="t81-mask-stage" style={`aspect-ratio: ${selected.dimensions.width} / ${selected.dimensions.height}`}>
          <img src={selected.url} alt={tr('before')} draggable="false" />
          <canvas
            bind:this={maskCanvas}
            data-testid="t81-mask-canvas"
            aria-label={tr('maskCanvasLabel')}
            aria-describedby="t81-mask-help t81-mask-keyboard"
            tabindex="0"
            onpointerdown={pointerDown}
            onpointermove={pointerMove}
            onpointerup={pointerUp}
            onpointercancel={pointerUp}
            onkeydown={maskKeydown}
          ></canvas>
        </div>
      {/if}
    </div>

    <div class="t81-actions">
      <button class="button primary" data-testid="t81-run" type="button" disabled={busy || !selected} onclick={resizeImage}>{tr('apply')}</button>
      {#if busy}<button class="button" data-testid="t81-cancel" type="button" onclick={cancelResize}>{tr('cancel')}</button>{/if}
    </div>
    {#if busy}<p role="status" aria-live="polite">{tr('busy')}</p>
    {:else if status}<p role="status" aria-live="polite" data-testid="t81-status">{status}</p>
    {:else}<p role="status" aria-live="polite">{tr('ready')}</p>{/if}
    {#if error}<p class="t81-error" role="alert" data-error-kind={error}>{errorText(error)}</p>{/if}
  </section>

  {#if selected && outputUrl && outputDimensions}
    <section class="t81-result" aria-labelledby="t81-result-heading">
      <h2 id="t81-result-heading">{tr('resultHeading')}</h2>
      <div class="t81-preview-grid">
        <figure><figcaption>{tr('before')}</figcaption><img data-testid="t81-before" src={selected.url} alt={tr('before')} /></figure>
        <figure><figcaption>{tr('after')}</figcaption><img data-testid="t81-after" src={outputUrl} alt={tr('after')} /></figure>
      </div>
      <p>{tr('dimensions')}: {outputDimensions.width} × {outputDimensions.height} · {Math.ceil(outputBytes / 1024)} KiB PNG</p>
      <a class="button primary t81-download" data-testid="t81-download" href={outputUrl} download={downloadName(selected.file)}>{tr('download')}</a>
    </section>
  {/if}

  <section class="tool-completion t81-faq" aria-labelledby="t81-faq-heading">
    <h2 id="t81-faq-heading">{tr('faqHeading')}</h2>
    {#each faq as item (item.question)}<details><summary>{item.question}</summary><p>{item.answer}</p></details>{/each}
    <nav aria-label={tr('related')}><a href={locale === 'en' ? '/resize' : `/${locale}/resize`}>{tr('ordinaryResize')}</a></nav>
  </section>
</main>

<style>
  .t81-controls, .t81-result, .t81-faq { width: min(1080px, calc(100% - 32px)); margin: 0 auto 40px; }
  .t81-controls { padding: 24px; border: 1px solid #1c1a171a; border-radius: 12px; background: white; }
  .t81-controls h2, .t81-result h2 { margin-block-start: 0; }
  .t81-file-card { display: grid; gap: 12px; min-width: 0; padding: 16px; border: 1px solid #1c1a1720; border-radius: 8px; }
  .t81-file-card > span:first-child, .t81-dimensions legend { font-weight: 600; }
  .t81-file-card input { max-width: 100%; }
  .t81-selected, .t81-help { color: #5c5a56; font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
  .t81-dimensions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 24px 0; padding: 16px; border: 1px solid #1c1a1720; border-radius: 8px; }
  .t81-dimensions legend { grid-column: 1 / -1; padding-inline: 4px; }
  .t81-dimensions label { display: grid; gap: 8px; }
  .t81-dimensions input { width: 100%; padding: 8px; border: 1px solid #1c1a1730; border-radius: 6px; }
  .t81-mask-controls { margin: 24px 0; padding: 16px; border: 1px solid #1c1a1720; border-radius: 8px; }
  .t81-mask-toggle { display: flex; align-items: flex-start; gap: 10px; font-weight: 600; cursor: pointer; }
  .t81-mask-toggle input { margin-block-start: 4px; }
  .t81-mask-actions, .t81-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .t81-mask-stage { position: relative; width: min(100%, 720px); margin-block-start: 12px; overflow: hidden; background: #eee; touch-action: none; }
  .t81-mask-stage img, .t81-mask-stage canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: contain; }
  .t81-mask-stage canvas { cursor: crosshair; outline-offset: 3px; touch-action: none; }
  .t81-result { padding: 24px; border: 1px solid #1c1a171a; border-radius: 12px; background: #fff; }
  .t81-preview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .t81-preview-grid figure { min-width: 0; margin: 0; padding: 12px; border: 1px solid #1c1a171a; border-radius: 8px; background: #f5f3f0; }
  .t81-preview-grid figcaption { margin-block-end: 8px; font-weight: 600; }
  .t81-preview-grid img { display: block; width: 100%; height: min(420px, 55vw); object-fit: contain; background: #eee; }
  .t81-download { display: inline-block; margin-block-start: 8px; }
  .t81-error { padding: 12px; border-inline-start: 4px solid #a21f17; color: #7c1711; background: #fff1ef; }
  @media (max-width: 700px) { .t81-preview-grid { grid-template-columns: 1fr; } .t81-controls, .t81-result { padding: 16px; } }
</style>
