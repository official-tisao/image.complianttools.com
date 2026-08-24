<script lang="ts">
  import { translate, type Locale } from './i18n';

  type Pair = readonly [english: string, arabic: string];
  type Completion = {
    readonly title: Pair;
    readonly description: Pair;
    readonly note: Pair;
    readonly faqs: readonly [Pair, Pair, Pair, Pair];
  };

  const copy: Readonly<Record<string, Completion>> = {
    'heic-converter': {
      title: ['HEIC / HEIF Converter', 'محول HEIC / HEIF'],
      description: [
        'Convert HEIC and HEIF to PNG locally when your browser provides a platform decoder.',
        'حوّل HEIC وHEIF إلى PNG محليًا عندما يوفر متصفحك مفكك ترميز على المنصة.',
      ],
      note: [
        'HEIC decoding depends on the decoder installed by the operating system and browser. HEIC encoding is deliberately unavailable because HEVC has active patent pools.',
        'يعتمد فك HEIC على مفكك الترميز المثبت في نظام التشغيل والمتصفح. ترميز HEIC غير متاح عمدًا بسبب مجمعات براءات HEVC النشطة.',
      ],
      faqs: [
        [
          'Why can HEIC work on one device but not another?',
          'لماذا يعمل HEIC على جهاز ولا يعمل على آخر؟',
        ],
        [
          'The tool probes WebCodecs and the browser image pipeline; support follows the platform decoder rather than the filename.',
          'تفحص الأداة WebCodecs ومسار الصور في المتصفح؛ ويعتمد الدعم على مفكك المنصة لا على اسم الملف.',
        ],
        ['Can this tool create HEIC files?', 'هل يمكن لهذه الأداة إنشاء ملفات HEIC؟'],
        [
          'No. HEIC encoding is deliberately excluded; export PNG and convert to another local format if needed.',
          'لا. ترميز HEIC مستبعد عمدًا؛ صدّر PNG ثم حوّله إلى صيغة محلية أخرى عند الحاجة.',
        ],
      ],
    },
    'raw-converter': {
      title: ['RAW Preview Converter', 'محول معاينة RAW'],
      description: [
        'Extract embedded camera previews or develop supported DNG sensor data locally.',
        'استخرج معاينات الكاميرا المضمنة أو طوّر بيانات مستشعر DNG المدعومة محليًا.',
      ],
      note: [
        'Most proprietary RAW files expose an embedded camera-rendered preview. Full sensor-data development is limited to the verified DNG path; unsupported extensions are named before processing.',
        'تعرض معظم ملفات RAW الخاصة معاينة مضمّنة عالجتها الكاميرا. يقتصر تطوير بيانات المستشعر الكامل على مسار DNG المتحقق، وتُسمّى الامتدادات غير المدعومة قبل المعالجة.',
      ],
      faqs: [
        [
          'Is the exported preview the original sensor data?',
          'هل المعاينة المصدّرة هي بيانات المستشعر الأصلية؟',
        ],
        [
          'No. Stage 1 preserves the embedded JPEG or exports an embedded RGB preview; only the verified DNG path develops sensor samples.',
          'لا. تحافظ المرحلة الأولى على JPEG المضمّن أو تصدّر معاينة RGB مضمّنة؛ ولا يطوّر عينات المستشعر إلا مسار DNG المتحقق.',
        ],
        ['Which RAW extensions are unavailable?', 'ما امتدادات RAW غير المتاحة؟'],
        [
          'The page names unsupported legacy extensions before processing and explains how to export a rendered JPEG or DNG from camera software.',
          'تسمّي الصفحة الامتدادات القديمة غير المدعومة قبل المعالجة وتشرح كيفية تصدير JPEG معالج أو DNG من برنامج الكاميرا.',
        ],
      ],
    },
    'avif-converter': {
      title: ['AVIF Converter', 'محول AVIF'],
      description: [
        'Encode still images to lossy or lossless AVIF and decode the result locally.',
        'رمّز الصور الثابتة إلى AVIF بضياع أو دون ضياع وفك النتيجة محليًا.',
      ],
      note: [
        'Lossy AVIF can discard fine colour and texture detail. Lossless mode preserves decoded pixels but may not preserve the original container metadata.',
        'قد يتخلص AVIF الضائع من تفاصيل اللون والملمس الدقيقة. يحافظ الوضع دون ضياع على البكسلات المفكوكة لكنه قد لا يحافظ على بيانات الحاوية الأصلية.',
      ],
      faqs: [
        ['What does AVIF quality control?', 'ما الذي تتحكم فيه جودة AVIF؟'],
        [
          'Quality changes the lossy encoder target. Lossless mode bypasses that trade-off and is independently decoded for verification.',
          'تغيّر الجودة هدف المرمّز الضائع. يتجاوز الوضع دون ضياع هذه المقايضة ويُفك بصورة مستقلة للتحقق.',
        ],
        ['Does the tool support animated AVIF?', 'هل تدعم الأداة AVIF المتحرك؟'],
        [
          'No. This tool currently verifies still-image AVIF encoding and decoding only.',
          'لا. تتحقق هذه الأداة حاليًا من ترميز صور AVIF الثابتة وفكها فقط.',
        ],
      ],
    },
    'webp-converter': {
      title: ['WebP Converter', 'محول WebP'],
      description: [
        'Create lossy, lossless, or animated WebP locally in your browser.',
        'أنشئ WebP بضياع أو دون ضياع أو متحركًا محليًا في متصفحك.',
      ],
      note: [
        'Lossy WebP may discard fine detail. Lossless and animated exports are decoded after encoding so dimensions, frames, and pixels can be checked.',
        'قد يتخلص WebP الضائع من التفاصيل الدقيقة. تُفك الصادرات دون ضياع والمتحركة بعد الترميز للتحقق من الأبعاد والإطارات والبكسلات.',
      ],
      faqs: [
        ['When should I choose lossless WebP?', 'متى أختار WebP دون ضياع؟'],
        [
          'Use lossless mode for graphics, transparency, or exact decoded pixels; use lossy mode when a smaller photographic file matters more.',
          'استخدم الوضع دون ضياع للرسومات والشفافية أو البكسلات الدقيقة؛ واستخدم الضائع عندما يكون حجم الصورة الفوتوغرافية الأصغر أهم.',
        ],
        ['How is WebP animation timing handled?', 'كيف تُعالج أزمنة حركة WebP؟'],
        [
          'Each frame duration and loop count is written to the animation container and checked after decoding the export.',
          'تُكتب مدة كل إطار وعدد التكرارات في حاوية الحركة ويجري التحقق منها بعد فك الملف المصدّر.',
        ],
      ],
    },
    'jxl-converter': {
      title: ['JPEG XL Converter', 'محول JPEG XL'],
      description: [
        'Encode and decode JPEG XL locally using the pinned browser codec.',
        'رمّز JPEG XL وفكّه محليًا باستخدام ترميز المتصفح المثبت.',
      ],
      note: [
        'The current codec accepts decoded raster pixels. It can produce lossy or pixel-lossless JXL, but it cannot perform a lossless JPEG bitstream transcode.',
        'يقبل الترميز الحالي بكسلات نقطية مفكوكة. يمكنه إنتاج JXL بضياع أو دون فقد البكسلات، لكنه لا يستطيع تحويل تدفق JPEG دون ضياع.',
      ],
      faqs: [
        [
          'Is pixel-lossless JXL the same as JPEG bitstream transcoding?',
          'هل JXL دون فقد البكسلات هو نفسه تحويل تدفق JPEG؟',
        ],
        [
          'No. Pixel-lossless encoding preserves decoded pixels; reversible JPEG transcoding would also preserve the original JPEG representation and is not available in this codec.',
          'لا. يحافظ الترميز دون فقد البكسلات على البكسلات المفكوكة؛ أما تحويل JPEG العكسي فيحافظ أيضًا على تمثيل JPEG الأصلي وهو غير متاح في هذا الترميز.',
        ],
        ['How is a JXL export verified?', 'كيف يجري التحقق من تصدير JXL؟'],
        [
          'The produced bytes are decoded with an independent decoder path and checked for dimensions and expected pixel tolerance.',
          'تُفك البايتات الناتجة عبر مسار فك مستقل وتُفحص الأبعاد وسماحية البكسلات المتوقعة.',
        ],
      ],
    },
  };

  let { route, locale = 'en' }: { route: string; locale?: Locale } = $props();
  const content = $derived(copy[route]!);
  const pick = (pair: Pair, key: string) =>
    locale === 'ar' ? pair[1] : translate(locale, `completion.${route}.${key}`, pair[0]);
  const origin = 'https://image.complianttools.com';
  const canonical = $derived(`${origin}${locale === 'en' ? '' : `/${locale}`}/${route}`);
  const localized = (path: string) => (locale === 'en' ? path : `/${locale}${path}`);
  const jsonLd = $derived({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: pick(content.title, 'title'),
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: pick(content.faqs[0], 'faq0.question'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: pick(content.faqs[1], 'faq0.answer'),
            },
          },
          {
            '@type': 'Question',
            name: pick(content.faqs[2], 'faq1.question'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: pick(content.faqs[3], 'faq1.answer'),
            },
          },
          {
            '@type': 'Question',
            name: translate(locale, 'seo.localQuestion', 'Does my file leave this device?'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: translate(
                locale,
                'seo.localAnswer',
                'No. The file is read and processed locally in your browser without an upload.',
              ),
            },
          },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Tools', item: origin },
          {
            '@type': 'ListItem',
            position: 2,
            name: pick(content.title, 'title'),
            item: canonical,
          },
        ],
      },
    ],
  });
</script>

<svelte:head>
  <link rel="alternate" hreflang="en" href={`${origin}/${route}`} />
  <link rel="alternate" hreflang="en-XA" href={`${origin}/en-XA/${route}`} />
  <link rel="alternate" hreflang="ar" href={`${origin}/ar/${route}`} />
  <link rel="alternate" hreflang="x-default" href={`${origin}/${route}`} />
  <meta property="og:title" content={pick(content.title, 'title')} />
  <meta property="og:description" content={pick(content.description, 'description')} />
  <meta property="og:image" content={`${origin}/og/tools.svg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={`${origin}/og/tools.svg`} />
  <svelte:element this={"script"} type="application/ld+json"
    >{JSON.stringify(jsonLd)}</svelte:element
  >
</svelte:head>
<section class="format-completion" aria-labelledby={`${route}-questions`}>
  <h2 id={`${route}-questions`}>
    {translate(locale, 'seo.questions', 'Questions about this tool')}
  </h2>
  <p>{pick(content.note, 'note')}</p>
  <details>
    <summary>{pick(content.faqs[0], 'faq0.question')}</summary>
    <p>{pick(content.faqs[1], 'faq0.answer')}</p>
  </details>
  <details>
    <summary>{pick(content.faqs[2], 'faq1.question')}</summary>
    <p>{pick(content.faqs[3], 'faq1.answer')}</p>
  </details>
  <details>
    <summary>{translate(locale, 'seo.localQuestion', 'Does my file leave this device?')}</summary>
    <p>
      {translate(
        locale,
        'seo.localAnswer',
        'No. The file is read and processed locally in your browser without an upload.',
      )}
    </p>
  </details>
  <nav aria-label={translate(locale, 'seo.related', 'Related tools and guides')}>
    <a href={localized('/convert')}>{translate(locale, 'nav.convert', 'Convert')}</a>
    <a href={localized('/avif-converter')}>AVIF</a>
    <a href={localized('/webp-converter')}>WebP</a>
    <a href={localized('/jxl-converter')}>JPEG XL</a>
    <a href={localized('/raw-converter')}>RAW</a>
    <a href="/docs/formats/jpeg">{translate(locale, 'nav.jpegGuide', 'JPEG guide')}</a>
  </nav>
</section>

<style>
  .format-completion {
    margin-block: 2rem;
  }
  details {
    margin-block: 0.75rem;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    margin-block-start: 1.25rem;
  }
</style>
