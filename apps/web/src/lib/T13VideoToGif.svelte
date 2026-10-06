<script lang="ts">
  /**
   * T13 Video → GIF — README §4.1, §5.6, §6.10, PLAN.md P6-01.
   *
   * Decoding stays exactly where it was approved: the browser's WebCodecs `VideoDecoder` reads
   * bytes that `mediabunny` pulls out of the container. No codec is bundled, no FFmpeg fallback
   * is added, and no request ever leaves the page.
   *
   * What this adds is the whole of the catalog promise the old single-frame route lacked —
   * trim range, frame rate, frame skipping, an output scale, and a real animation — plus a
   * capability probe run *before* decoding, so an unsupported codec produces a specific remedy
   * instead of a generic failure.
   */
  import { onDestroy } from 'svelte';
  import {
    T13VideoGifOptionsSchema,
    t13VideoGifOptionDescriptions,
    type T13VideoGifOptions,
  } from '@complianttools/image-engine/schemas/p6-01-options';
  import {
    buildVideoGifFrames,
    containerSupport,
    demuxContainerFirstVideoPacket,
    encodeGif,
    engineErrorMessage,
    extractContainerVideoFrame,
    generateGifFrames,
    isEngineError,
    probeVideoCodec,
    readContainerVideoDuration,
    selectVideoTimestamps,
    videoGifRaster,
    type RasterImage,
    type VideoGifOptions,
  } from '@complianttools/image-engine';
  import GeneratedControls from './GeneratedControls.svelte';
  import { localizeOptions, type Locale } from './i18n';

  type ErrorKind =
    | 'unsupported-container'
    | 'no-video-track'
    | 'codec-unavailable'
    | 'no-webcodecs'
    | 'decode-failed'
    | 'trim-outside-clip'
    | 'no-frames-in-range'
    | 'frame-size-mismatch'
    | 'too-many-frames'
    | 'output-too-large'
    | 'canvas-unavailable'
    | 'encode-failed';

  const MAX_FILE_BYTES = 512 * 1024 * 1024;
  const MAX_FRAMES = 5000;
  const MAX_OUTPUT_BYTES = 48 * 1024 * 1024;
  const ORIGIN = 'https://image.complianttools.com';

  const enText = {
    title: 'Video to GIF',
    eyebrow: 'Local convert and export',
    description:
      'Turn a local video clip into an animated GIF. Trim the range, choose how many frames per second to sample, set the output width, and pick the palette, dithering, and loop behaviour. Decoding uses your browser’s WebCodecs video decoder — no codec is downloaded and no FFmpeg fallback exists.',
    metaDescription:
      'Convert a local video to an animated GIF with trim, frame-rate, scale, and palette controls. Decoded locally with your browser’s own WebCodecs decoder.',
    privacy:
      'Your video stays on this device. Decoding, sampling, and GIF encoding run locally; nothing is uploaded.',
    inputHeading: 'Choose a video',
    inputLabel: 'Video file',
    chooseVideo: 'Choose a local video file',
    inputHelp:
      'MP4, M4V, MOV, 3GP, WebM, MKV, and OGV are read by the pinned local container reader. AVI, WMV, FLV, MTS, and M2TS are named as unavailable because that reader does not parse them and a bundled or network codec fallback is deliberately excluded.',
    run: 'Create GIF',
    busy: 'Decoding and encoding locally…',
    ready: 'Choose a video to begin.',
    probing: 'Checking whether this browser can decode the video…',
    previewHeading: 'Animated preview',
    previewAlt: 'The created animation, playing at the same speed as the download',
    download: 'Download GIF',
    dimensions: 'Dimensions',
    size: 'Size',
    frames: 'Frames',
    skipped: 'Skipped samples',
    created:
      'Created a {width}×{height} GIF with {frames} frame(s) from {source} sample(s) between {start}s and {end}s ({bytes} bytes, {rate} fps, scale {scale}px). {note}',
    noteSkipped: '{value} sample(s) were skipped or dropped by the frame limit.',
    fidelity: 'The preview and the download are the same encoded GIF bytes.',
    codecNote:
      'Codec support is whatever your browser provides. A codec this browser cannot decode is reported by name with a remedy, rather than being downloaded.',
    faqHeading: 'Questions about video to GIF',
    faqCodec: 'Which videos work?',
    faqCodecAnswer:
      'The container must be one the local reader parses — MP4, M4V, MOV, 3GP, WebM, MKV, or OGV — and the codec inside it must be one your browser can decode. This tool checks both and tells you which one is missing.',
    faqWhy: 'Why can’t it open my AVI?',
    faqWhyAnswer:
      'The pinned local container reader does not parse AVI, WMV, FLV, MTS, or M2TS. Adding FFmpeg or downloading a codec was deliberately excluded, so the tool names the container and asks you to re-export instead.',
    faqPrivacy: 'Is the video uploaded?',
    faqPrivacyAnswer:
      'No. The container is read, the frames are decoded, and the GIF is encoded entirely in your browser.',
    related: 'Related tools',
    maker: 'GIF maker',
    errors: {
      'unsupported-container':
        'This tool cannot read that video container with its pinned local reader.',
      'no-video-track': 'The file has no video track to sample.',
      'codec-unavailable': 'Your browser cannot decode this video codec.',
      'no-webcodecs': 'This browser has no WebCodecs video decoder.',
      'decode-failed': 'The video could not be decoded to frames.',
      'trim-outside-clip': 'The trim range falls entirely outside this clip.',
      'no-frames-in-range':
        'No video frame falls inside the trim range at that frame rate and frame skip.',
      'frame-size-mismatch': 'The decoded frames are not all the same size.',
      'too-many-frames': `This tool samples at most ${MAX_FRAMES} frames from one clip.`,
      'output-too-large': 'The encoded GIF exceeds the 48 MiB export limit.',
      'canvas-unavailable': 'The browser could not create a local image canvas.',
      'encode-failed': 'The GIF encoder could not produce a valid file from these frames.',
    },
    remedies: {
      'unsupported-container':
        'Re-export the video as MP4, WebM, MOV, MKV, OGV, or 3GP, then choose it again.',
      'no-video-track': 'Choose a file that contains a video stream, not an audio-only recording.',
      'codec-unavailable':
        'Re-export the video as H.264 in MP4 or VP8/VP9 in WebM, which every current browser decodes.',
      'no-webcodecs':
        'Use a current Chromium, Firefox, or Safari build, or export the frames yourself as images.',
      'decode-failed':
        'Try a shorter clip, or re-encode it in a format your browser is known to decode.',
      'trim-outside-clip': 'Widen the trim range to cover part of the clip.',
      'no-frames-in-range':
        'Raise the frame rate, set the frame skip back to 1, or widen the trim range.',
      'frame-size-mismatch':
        'Re-encode the clip so every frame has the same dimensions, or pick a different clip.',
      'too-many-frames': 'Shorten the trim range, lower the frame rate, or raise the frame skip.',
      'output-too-large': 'Use fewer frames, a smaller output width, or a smaller palette.',
      'canvas-unavailable': 'Try a browser with local 2D canvas support.',
      'encode-failed': 'Reduce the frame count or output size and try again.',
    },
  } as const;

  type TextKey = Exclude<keyof typeof enText, 'errors' | 'remedies'>;
  type LocalizedCopy = Record<TextKey, string> & {
    errors: Record<ErrorKind, string>;
    remedies: Record<ErrorKind, string>;
  };

  const arText: LocalizedCopy = {
    title: 'فيديو إلى GIF',
    eyebrow: 'تحويل وتصدير محلي',
    description:
      'حوّل مقطع فيديو محليًا إلى GIF متحرك. حدّد نطاق القص، واختر عدد الإطارات في الثانية، وضبط عرض الإخراج، واختر سلوك اللوحة والتظليل والتكرار. يتم فك الترميز بفاكتر فيديو WebCodecs في متصفحك — لا يُنزَّل أي مرمز ولا يوجد بديل FFmpeg.',
    metaDescription:
      'حوّل فيديو محليًا إلى GIF متحرك مع تحكم في القص ومعدل الإطارات والمقاس واللوحة. يفك الترميز محليًا بفاكتر WebCodecs في متصفحك.',
    privacy:
      'يبقى الفيديو على جهازك. يجري فك الترميز وأخذ العينات وترميز GIF محليًا؛ لا يُرفع شيء.',
    inputHeading: 'اختر فيديو',
    inputLabel: 'ملف الفيديو',
    chooseVideo: 'اختر ملف فيديو محلي',
    inputHelp:
      'يقرأ القارئ المحلي المثبَّت MP4 وM4V وMOV و3GP وWebM وMKV وOGV. أما AVI وWMV وFLV وMTS وM2TS فهي غير متاحة لأن ذلك القارئ لا يحللها، واستُبعد عمدًا أي بديل بمرمز مضمّن أو يُنزَّل من الشبكة.',
    run: 'أنشئ GIF',
    busy: 'جارٍ فك الترميز والترميز محليًا…',
    ready: 'اختر فيديو للبدء.',
    probing: 'جارٍ التحقق مما إذا كان المتصفح يستطيع فك ترميز الفيديو…',
    previewHeading: 'معاينة متحركة',
    previewAlt: 'الحركة المُنشئة، تعمل بنفس سرعة التنزيل',
    download: 'تنزيل GIF',
    dimensions: 'الأبعاد',
    size: 'الحجم',
    frames: 'الإطارات',
    skipped: 'العينات المتخطاة',
    created:
      'أنشأ GIF بمقاس {width}×{height} مع {frames} إطار من {source} عينة بين {start}ث و{end}ث ({bytes} بايت، {rate} إطار/ث، مقاس {scale} بكسل). {note}',
    noteSkipped: 'تم تخطي {value} عينة أو إسقاطها بسبب حد الإطارات.',
    fidelity: 'المعاينة والتنزيل هما بايتات GIF المرمّزة نفسها.',
    codecNote:
      'دعم المرمزز هو ما يوفره متصفحك. أي مرمز لا يستطيع متصفحك فك ترميزه يُذكر باسمه مع حل، بدلًا من تنزيله.',
    faqHeading: 'أسئلة حول الفيديو إلى GIF',
    faqCodec: 'ما الفيديوهات التي تعمل؟',
    faqCodecAnswer:
      'يجب أن تكون الحاوية مما يقرأه القارئ المحلي — MP4 أو M4V أو MOV أو 3GP أو WebM أو MKV أو OGV — وأن يكون المرمز داخلها مما يفك متصفحك ترميزه. تتحقق الأداة من الاثنين وتخبرك أيهما مفقود.',
    faqWhy: 'لماذا لا تفتح ملف AVI؟',
    faqWhyAnswer:
      'لا يحلل القارئ المحلي المثبَّت AVI أو WMV أو FLV أو MTS أو M2TS. واستُبعد عمدًا إضافة FFmpeg أو تنزيل مرمز، لذا تسمّي الأداة الحاوية وتطلب منك إعادة التصدير بدلًا من ذلك.',
    faqPrivacy: 'هل يُرفع الفيديو؟',
    faqPrivacyAnswer: 'لا. تُقرأ الحاوية وتُفك الإطارات ويُرمَّز GIF بالكامل في متصفحك.',
    related: 'أدوات ذات صلة',
    maker: 'منشئ GIF',
    errors: {
      'unsupported-container':
        'لا تستطيع هذه الأداة قراءة حاوية الفيديو تلك بالقارئ المحلي المثبَّت.',
      'no-video-track': 'لا يحتوي الملف على مسار فيديو.',
      'codec-unavailable': 'لا يستطيع متصفحك فك ترميز مرمز الفيديو هذا.',
      'no-webcodecs': 'لا يوجد في هذا المتصفح فاكتر ترميز فيديو WebCodecs.',
      'decode-failed': 'تعذر فك ترميز الفيديو إلى إطارات.',
      'trim-outside-clip': 'يقع نطاق القص خارج هذا المقطع بالكامل.',
      'no-frames-in-range':
        'لا يقع أي إطار فيديو داخل نطاق القص عند معدل الإطارات وتخطّي الإطارات المحددَين.',
      'frame-size-mismatch': 'الإطارات المفكوكة ليست كلها بالحجم نفسه.',
      'too-many-frames': `تأخذ هذه الأداة عينة من ${MAX_FRAMES} إطار كحد أقصى من المقطع الواحد.`,
      'output-too-large': 'يتجاوز ملف GIF المرمّز حد التصدير البالغ 48 ميبيبايت.',
      'canvas-unavailable': 'تعذر على المتصفح إنشاء لوحة صور محلية.',
      'encode-failed': 'تعذر على مرمز GIF إنتاج ملف صالح من هذه الإطارات.',
    },
    remedies: {
      'unsupported-container':
        'أعد تصدير الفيديو بصيغة MP4 أو WebM أو MOV أو MKV أو OGV أو 3GP ثم اختره مجددًا.',
      'no-video-track': 'اختر ملفًا يحتوي على مسار فيديو لا تسجيلًا صوتيًا فقط.',
      'codec-unavailable':
        'أعد تصدير الفيديو بصيغة H.264 داخل MP4 أو VP8/VP9 داخل WebM، وهي صيغ يفكها كل متصفح حديث.',
      'no-webcodecs':
        'استخدم إصدارًا حديثًا من Chromium أو Firefox أو Safari، أو صدّر الإطارات صورًا.',
      'decode-failed': 'جرّب مقطعًا أقصر، أو أعد ترميزه بصيغة يعرف متصفحك فك ترميزها.',
      'trim-outside-clip': 'وسّع نطاق القص ليشمل جزءًا من المقطع.',
      'no-frames-in-range': 'ارفع معدل الإطارات، أو أعد تخطّي الإطارات إلى 1، أو وسّع نطاق القص.',
      'frame-size-mismatch':
        'أعد ترميز المقطع بحيث تكون كل الإطارات بالأبعاد نفسها، أو اختر مقطعًا آخر.',
      'too-many-frames': 'قصّر نطاق القص، أو اخفض معدل الإطارات، أو ارفع تخطّي الإطارات.',
      'output-too-large': 'استخدم إطارات أقل أو عرض إخراج أصغر أو لوحة ألوان أصغر.',
      'canvas-unavailable': 'جرّب متصفحًا يدعم لوحة 2D محلية.',
      'encode-failed': 'قلّل عدد الإطارات أو حجم الإخراج ثم أعد المحاولة.',
    },
  };

  let { locale = 'en' }: { locale?: Locale } = $props();

  let sourceFile = $state<File>();
  let options = $state<T13VideoGifOptions>(T13VideoGifOptionsSchema.parse({}));
  let previewUrl = $state('');
  let outputBytes = $state(0);
  let outputDimensions = $state({ width: 0, height: 0 });
  let outputFrames = $state(0);
  let skippedSamples = $state(0);
  let busy = $state(false);
  let status = $state('');
  let error = $state<ErrorKind>();
  /** Extra context from the engine, shown alongside the generic remedy when one exists. */
  let errorDetail = $state('');

  const pseudo = (value: string) =>
    `［${value.replace(/[aeiou]/giu, (vowel) => ({ a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü' })[vowel.toLowerCase()] ?? vowel)}］`;
  const tr = (key: TextKey) => {
    const value = locale === 'ar' ? arText[key] : enText[key];
    return locale === 'en-XA' ? pseudo(value) : value;
  };
  const localized = (value: string): string => (locale === 'en-XA' ? pseudo(value) : value);
  const path = $derived(locale === 'en' ? '/video-to-gif' : `/${locale}/video-to-gif`);
  const canonical = $derived(`${ORIGIN}${path}`);
  const faq = $derived([
    { question: tr('faqCodec'), answer: tr('faqCodecAnswer') },
    { question: tr('faqWhy'), answer: tr('faqWhyAnswer') },
    { question: tr('faqPrivacy'), answer: tr('faqPrivacyAnswer') },
  ]);
  const localizedOptionDescriptions = $derived(
    localizeOptions(locale, t13VideoGifOptionDescriptions),
  );
  const optionValues = $derived({
    't13.trimStart': options.trimStart,
    't13.trimEnd': options.trimEnd,
    't13.frameRate': options.frameRate,
    't13.skipFrames': options.skipFrames,
    't13.maxFrames': options.maxFrames,
    't13.scaleWidth': options.scaleWidth,
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
          { '@type': 'ListItem', position: 1, name: tr('related'), item: `${ORIGIN}/gif-maker` },
          { '@type': 'ListItem', position: 2, name: tr('title'), item: canonical },
        ],
      },
    ],
  });

  function errorText(kind: ErrorKind): string {
    const dictionary = locale === 'ar' ? arText : enText;
    const base = `${localized(dictionary.errors[kind])} ${localized(
      locale === 'ar' ? 'جرّب هذا' : 'Try this',
    )}: ${localized(dictionary.remedies[kind])}`;
    return errorDetail === '' ? base : `${base} ${localized(errorDetail)}`;
  }

  function clearOutput() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    outputBytes = 0;
    outputDimensions = { width: 0, height: 0 };
    outputFrames = 0;
  }

  function updateOption(path: string, value: unknown) {
    const key = path.startsWith('t13.') ? path.slice(4) : path;
    const parsed = T13VideoGifOptionsSchema.safeParse({ ...options, [key]: value });
    if (parsed.success) {
      options = parsed.data;
      clearOutput();
      status = '';
      error = undefined;
      errorDetail = '';
    }
  }

  function selectVideo(event: Event) {
    sourceFile = (event.currentTarget as HTMLInputElement).files?.[0];
    clearOutput();
    status = '';
    error = undefined;
    errorDetail = '';
  }

  async function createGif() {
    const file = sourceFile;
    if (!file) {
      error = 'unsupported-container';
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      error = 'unsupported-container';
      errorDetail = localized(`The file is ${file.size} bytes; the limit is ${MAX_FILE_BYTES}.`);
      return;
    }

    clearOutput();
    error = undefined;
    errorDetail = '';
    status = '';
    busy = true;

    // Step 1 — container. The pinned reader's coverage is a documented fact, so an unreadable
    // container is named here rather than surfacing later as an opaque decode failure.
    const support = containerSupport(file.name);
    if (!support.supported) {
      error = 'unsupported-container';
      errorDetail = localized(support.reason ?? '');
      busy = false;
      return;
    }

    try {
      status = localized(tr('probing'));

      // Step 2 — codec. Probing before decoding turns "some video failed" into a named codec
      // with a remedy, and it is the last honest moment to do so: after a partial decode the
      // failure is indistinguishable from a corrupt file.
      const bytes = new Uint8Array(await file.arrayBuffer());
      let codecNote = '';
      let packet;
      try {
        packet = await demuxContainerFirstVideoPacket(bytes, file.type);
      } catch (cause) {
        // Keep the engine's own reason: "no video track" and "no decodable packets" need
        // different remedies, and collapsing them would tell a user with a merely unseekable
        // clip to go looking for a video stream that is there.
        if (isEngineError(cause) && cause.remedy.includes('no video track'))
          throw 'no-video-track' satisfies ErrorKind;
        error = 'decode-failed';
        errorDetail = localized(isEngineError(cause) ? cause.remedy : String(cause));
        busy = false;
        return;
      }
      const probe = await probeVideoCodec({
        codec: packet.config.codec,
        ...(packet.config.codedWidth === undefined ? {} : { codedWidth: packet.config.codedWidth }),
        ...(packet.config.codedHeight === undefined
          ? {}
          : { codedHeight: packet.config.codedHeight }),
        ...(packet.config.description === undefined
          ? {}
          : { description: packet.config.description }),
      });
      if (!probe.supported) {
        if (probe.reason?.includes('does not implement WebCodecs'))
          throw 'no-webcodecs' satisfies ErrorKind;
        error = 'codec-unavailable';
        errorDetail = localized(`The container declares ${packet.config.codec}.`);
        busy = false;
        return;
      }
      codecNote = localized(tr('codecNote'));

      // Step 3 — sampling plan. A range that falls outside the clip is the user's mistake, not
      // a decode failure, so it is reported as its own kind.
      let duration: number;
      try {
        duration = await readContainerVideoDuration(file);
      } catch (cause) {
        // The duration read fails for two different reasons and they need different remedies:
        // a container with no video track at all, and a clip whose length cannot be determined
        // (a live stream carries no duration). Only the first is the user's missing stream.
        if (isEngineError(cause) && cause.remedy.includes('no video track'))
          throw 'no-video-track' satisfies ErrorKind;
        error = 'decode-failed';
        errorDetail = localized(
          isEngineError(cause)
            ? cause.remedy
            : 'The length of this clip could not be determined. A recorded or streamed video has no duration until it is finalised; re-export the file as a saved video and try again.',
        );
        busy = false;
        return;
      }
      const plan: VideoGifOptions = {
        trimStart: options.trimStart,
        trimEnd: options.trimEnd,
        frameRate: options.frameRate,
        skipFrames: options.skipFrames,
        maxFrames: options.maxFrames,
        scaleWidth: options.scaleWidth,
      };
      let selection;
      try {
        selection = selectVideoTimestamps(duration, plan);
      } catch {
        // A range that starts past the end of the clip is a different mistake from one that
        // simply contains no sample, and each deserves its own remedy.
        throw (
          options.trimStart >= duration ? 'trim-outside-clip' : 'no-frames-in-range'
        ) satisfies ErrorKind;
      }
      if (selection.timestamps.length > MAX_FRAMES) throw 'too-many-frames' satisfies ErrorKind;

      // Step 4 — decode only the sampled timestamps.
      status = localized(tr('busy'));
      const decoded: { timestamp: number; image: RasterImage }[] = [];
      for (const timestamp of selection.timestamps) {
        const image = await extractContainerVideoFrame(file, timestamp);
        decoded.push({ timestamp, image });
      }

      const animation = buildVideoGifFrames(decoded, plan);
      let raster: RasterImage;
      try {
        raster = videoGifRaster(animation.frames);
      } catch {
        throw 'frame-size-mismatch' satisfies ErrorKind;
      }
      const generated = generateGifFrames(raster, 'forward', 2);

      const bytesOut = encodeGif(generated, 0, {
        paletteSize: 256,
        paletteMode: 'adaptive',
        dither: 'floyd-steinberg',
        ditherAmount: 100,
        disposal: 'auto',
      });
      if (bytesOut.byteLength > MAX_OUTPUT_BYTES) throw 'output-too-large' satisfies ErrorKind;

      const blob = new Blob([bytesOut], { type: 'image/gif' });
      previewUrl = URL.createObjectURL(blob);
      outputBytes = blob.size;
      outputFrames = animation.frames.length;
      outputDimensions = { width: raster.width, height: raster.height };
      skippedSamples = selection.skipped.length;

      const summary = localized(tr('created'))
        .replace('{width}', String(raster.width))
        .replace('{height}', String(raster.height))
        .replace('{frames}', String(animation.frames.length))
        .replace('{source}', String(selection.totalSamples))
        .replace('{start}', String(selection.timestamps[0] ?? 0))
        .replace('{end}', String(selection.timestamps.at(-1) ?? 0))
        .replace('{bytes}', String(bytesOut.byteLength))
        .replace('{rate}', String(options.frameRate))
        .replace('{scale}', String(plan.scaleWidth === 0 ? raster.width : plan.scaleWidth))
        .replace(
          '{note}',
          selection.skipped.length === 0
            ? ''
            : localized(tr('noteSkipped')).replace('{value}', String(selection.skipped.length)),
        );
      status = `${summary} ${codecNote} ${localized(tr('fidelity'))}`;
    } catch (cause) {
      if (typeof cause === 'string' && cause in enText.errors) error = cause as ErrorKind;
      else if (isEngineError(cause)) {
        error = cause.kind === 'decode-failed' ? 'decode-failed' : 'encode-failed';
        errorDetail = engineErrorMessage(cause);
      } else error = 'decode-failed';
    } finally {
      busy = false;
    }
  }

  function downloadName(): string {
    const stem =
      sourceFile?.name
        .replace(/\.[^.]+$/u, '')
        .replace(/[\\/:*?"<>| -]/gu, '_')
        .slice(0, 80) || 'video';
    return `${stem}.gif`;
  }

  onDestroy(clearOutput);
</script>

<svelte:head>
  <title>{tr('title')} — Image Compliant Tools</title>
  <meta name="description" content={tr('metaDescription')} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="en" href={`${ORIGIN}/video-to-gif`} />
  <link rel="alternate" hreflang="en-XA" href={`${ORIGIN}/en-XA/video-to-gif`} />
  <link rel="alternate" hreflang="ar" href={`${ORIGIN}/ar/video-to-gif`} />
  <link rel="alternate" hreflang="x-default" href={`${ORIGIN}/video-to-gif`} />
  <meta property="og:title" content={tr('title')} />
  <meta property="og:description" content={tr('metaDescription')} />
  <meta property="og:image" content={`${ORIGIN}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={`${ORIGIN}/og/tools.svg`} />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(schema)}</svelte:element
  >
</svelte:head>

<main class="tool-page t13-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <header class="tool-intro">
    <p class="eyebrow">{tr('eyebrow')}</p>
    <h1>{tr('title')}</h1>
    <p>{tr('description')}</p>
    <p class="privacy-copy">{tr('privacy')}</p>
  </header>

  <section class="t13-controls" aria-labelledby="t13-input-heading">
    <h2 id="t13-input-heading">{tr('inputHeading')}</h2>
    <label class="t13-file-card">
      <span>{tr('inputLabel')}</span>
      <input
        data-testid="t13-input"
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.m4v,.mov,.3gp,.webm,.mkv,.ogv"
        aria-label={tr('chooseVideo')}
        onchange={selectVideo}
      />
      {#if sourceFile}<span class="t13-selected">{sourceFile.name}</span>{/if}
    </label>
    <p class="t13-help">{tr('inputHelp')}</p>

    <GeneratedControls
      descriptions={localizedOptionDescriptions}
      values={{ ...optionValues }}
      onChange={updateOption}
      {locale}
    />

    <div class="t13-actions">
      <button
        class="button primary"
        data-testid="t13-run"
        type="button"
        disabled={busy || !sourceFile}
        onclick={() => void createGif()}>{tr('run')}</button
      >
    </div>
    {#if busy}<p role="status" aria-live="polite" data-testid="t13-busy">{status}</p>
    {:else if status}<p role="status" aria-live="polite" data-testid="t13-status">{status}</p>
    {:else}<p role="status" aria-live="polite">{tr('ready')}</p>{/if}
    {#if error}
      <p class="t13-error" role="alert" data-error-kind={error} data-testid="t13-error">
        {errorText(error)}
      </p>
    {/if}
  </section>

  {#if previewUrl}
    <section class="t13-result" aria-labelledby="t13-preview-heading">
      <h2 id="t13-preview-heading">{tr('previewHeading')}</h2>
      <img data-testid="t13-preview" src={previewUrl} alt={tr('previewAlt')} />
      <p class="t13-metrics">
        {tr('dimensions')}: {outputDimensions.width} × {outputDimensions.height} · {tr('frames')}: {outputFrames}
        · {tr('size')}: {outputBytes} bytes · {tr('skipped')}: {skippedSamples}
      </p>
      <p class="t13-fidelity">{tr('fidelity')}</p>
      <a
        class="button primary t13-download"
        data-testid="t13-download"
        href={previewUrl}
        download={downloadName()}>{tr('download')}</a
      >
    </section>
  {/if}

  <section class="tool-completion t13-faq" aria-labelledby="t13-faq-heading">
    <h2 id="t13-faq-heading">{tr('faqHeading')}</h2>
    {#each faq as item (item.question)}<details>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>{/each}
    <nav aria-label={tr('related')}>
      <a href={locale === 'en' ? '/gif-maker' : `/${locale}/gif-maker`}>{tr('maker')}</a>
    </nav>
  </section>
</main>

<style>
  .t13-controls,
  .t13-result,
  .t13-faq {
    width: min(1080px, calc(100% - 32px));
    margin: 0 auto 40px;
  }
  .t13-controls {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: white;
  }
  .t13-controls h2,
  .t13-result h2 {
    margin-block-start: 0;
  }
  .t13-file-card {
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    border: 1px solid #1c1a1720;
    border-radius: 8px;
  }
  .t13-file-card > span:first-child {
    font-weight: 600;
  }
  .t13-file-card input {
    max-width: 100%;
  }
  .t13-selected,
  .t13-help,
  .t13-fidelity {
    color: #5c5a56;
    font-size: 13px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
  .t13-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-block-start: 16px;
  }
  .t13-result {
    padding: 24px;
    border: 1px solid #1c1a171a;
    border-radius: 12px;
    background: #fff;
  }
  .t13-result img {
    display: block;
    width: 100%;
    max-width: 480px;
    height: auto;
    max-height: 420px;
    object-fit: contain;
    background: repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 16px 16px;
  }
  .t13-metrics {
    font-variant-numeric: tabular-nums;
  }
  .t13-download {
    display: inline-block;
    margin-block-start: 8px;
  }
  .t13-error {
    padding: 12px;
    border-inline-start: 4px solid #a21f17;
    color: #7c1711;
    background: #fff1ef;
  }
  @media (max-width: 700px) {
    .t13-controls,
    .t13-result {
      padding: 16px;
    }
  }
</style>
