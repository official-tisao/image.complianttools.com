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
    'svg-to-png': {
      title: ['SVG to PNG', 'تحويل SVG إلى PNG'],
      description: [
        'Rasterize safe SVG files to exact-size PNG locally.',
        'حوّل ملفات SVG الآمنة إلى PNG بحجم دقيق محليًا.',
      ],
      note: [
        'External references, scripts, event handlers, and unsafe nested content are rejected before rasterization. PNG output replaces scalable vector geometry with a fixed pixel grid.',
        'تُرفض المراجع الخارجية والبرامج النصية ومعالجات الأحداث والمحتوى المتداخل غير الآمن قبل التحويل. يستبدل PNG هندسة المتجهات القابلة للتكبير بشبكة بكسلات ثابتة.',
      ],
      faqs: [
        ['Why are external SVG resources refused?', 'لماذا تُرفض موارد SVG الخارجية؟'],
        [
          'The local sanitizer prevents network access and removes active content before any renderer receives the document.',
          'يمنع المطهّر المحلي الوصول إلى الشبكة ويزيل المحتوى النشط قبل وصول المستند إلى العارض.',
        ],
        ['How is the PNG size chosen?', 'كيف يُختار حجم PNG؟'],
        [
          'Intrinsic SVG dimensions are used by default; explicit width and height controls generate the requested pixel dimensions.',
          'تُستخدم أبعاد SVG الأصلية افتراضيًا؛ وتنتج عناصر العرض والارتفاع الأبعاد المطلوبة بالبكسل.',
        ],
      ],
    },
    'image-to-svg': {
      title: ['Image to SVG Vectorizer', 'تحويل الصورة إلى SVG'],
      description: [
        'Trace raster pixels into editable SVG paths locally.',
        'تتبّع البكسلات النقطية إلى مسارات SVG قابلة للتحرير محليًا.',
      ],
      note: [
        'Vectorization approximates raster edges and colours with paths. Fine photographic texture may be simplified, while increasing detail produces a larger SVG.',
        'يقرب التحويل المتجهي الحواف والألوان النقطية بمسارات. قد تُبسّط تفاصيل الصور الدقيقة، بينما تزيد التفاصيل الأعلى حجم SVG.',
      ],
      faqs: [
        [
          'Does vectorization recover the original artwork?',
          'هل يستعيد التحويل المتجهي العمل الأصلي؟',
        ],
        [
          'No. It creates a new path approximation from pixels; it cannot recover layers, fonts, or source control points.',
          'لا. ينشئ تقريبًا جديدًا للمسارات من البكسلات ولا يمكنه استعادة الطبقات أو الخطوط أو نقاط التحكم الأصلية.',
        ],
        ['What changes SVG file size?', 'ما الذي يغيّر حجم ملف SVG؟'],
        [
          'More colours, tighter path fitting, and less simplification preserve detail but create more path data.',
          'تحافظ الألوان الأكثر وملاءمة المسارات الأدق والتبسيط الأقل على التفاصيل لكنها تنشئ بيانات مسار أكثر.',
        ],
      ],
    },
    'pdf-to-image': {
      title: ['PDF to Image', 'تحويل PDF إلى صورة'],
      description: [
        'Render selected PDF pages to PNG locally.',
        'حوّل صفحات PDF المحددة إلى PNG محليًا.',
      ],
      note: [
        'Rendering flattens text, vectors, transparency, and annotations into pixels at the chosen scale. Password-protected or unsupported PDFs fail with a named remedy.',
        'يدمج العرض النص والمتجهات والشفافية والتعليقات في بكسلات وفق المقياس المختار. تفشل ملفات PDF المحمية أو غير المدعومة مع حل واضح.',
      ],
      faqs: [
        ['Will text remain selectable?', 'هل يبقى النص قابلاً للتحديد؟'],
        [
          'No. Each exported page is a PNG raster image, so text and vector objects become pixels.',
          'لا. كل صفحة مصدّرة هي صورة PNG نقطية، لذلك يصبح النص والكائنات المتجهية بكسلات.',
        ],
        ['How does render scale affect output?', 'كيف يؤثر مقياس العرض في الناتج؟'],
        [
          'A higher scale produces more pixels and sharper detail, but increases memory use and file size.',
          'ينتج المقياس الأعلى بكسلات أكثر وتفاصيل أوضح لكنه يزيد استخدام الذاكرة وحجم الملف.',
        ],
      ],
    },
    'image-to-pdf': {
      title: ['Image to PDF', 'تحويل الصورة إلى PDF'],
      description: [
        'Place local images onto deterministic PDF pages.',
        'ضع الصور المحلية على صفحات PDF حتمية.',
      ],
      note: [
        'Images are embedded on pages using the selected paper, margins, fit, and orientation. The PDF does not recreate editable source layers or searchable text.',
        'تُضمّن الصور في الصفحات باستخدام الورق والهوامش والملاءمة والاتجاه المحددة. لا يعيد PDF إنشاء طبقات قابلة للتحرير أو نص قابل للبحث.',
      ],
      faqs: [
        ['Are images cropped when fitted to a page?', 'هل تُقص الصور عند ملاءمتها للصفحة؟'],
        [
          'Contain preserves the whole image with possible whitespace; cover fills the area and may crop edges.',
          'يحافظ الاحتواء على الصورة كاملة مع مساحة فارغة محتملة؛ أما التغطية فتملأ المساحة وقد تقص الحواف.',
        ],
        ['Is the PDF generated on a server?', 'هل يُنشأ PDF على خادم؟'],
        [
          'No. Page layout, image embedding, and download all happen in this browser.',
          'لا. يجري تخطيط الصفحات وتضمين الصور والتنزيل داخل هذا المتصفح.',
        ],
      ],
    },
    'favicon-generator': {
      title: ['Favicon Generator', 'منشئ الأيقونة المفضلة'],
      description: [
        'Generate a deterministic favicon package locally.',
        'أنشئ حزمة أيقونات مفضلة حتمية محليًا.',
      ],
      note: [
        'The package includes exact browser and manifest sizes derived from one source image. Small icons necessarily discard detail; transparent padding and edge contrast should be reviewed.',
        'تتضمن الحزمة أحجام المتصفح والبيان الدقيقة المشتقة من صورة مصدر واحدة. تفقد الأيقونات الصغيرة بعض التفاصيل، لذا راجع الحشو الشفاف وتباين الحواف.',
      ],
      faqs: [
        ['Which files are included?', 'ما الملفات المضمنة؟'],
        [
          'The ZIP contains ICO and PNG icon sizes plus the web manifest and HTML link snippet required by the page.',
          'تحتوي ZIP على أحجام ICO وPNG إضافة إلى بيان الويب ومقتطف روابط HTML المطلوب.',
        ],
        [
          'Why can a detailed logo look unclear at 16 px?',
          'لماذا قد يبدو الشعار المفصل غير واضح عند 16 بكسل؟',
        ],
        [
          'Very small favicons cannot retain fine lines; use a simplified high-contrast source and inspect the generated preview.',
          'لا تحتفظ الأيقونات الصغيرة جدًا بالخطوط الدقيقة؛ استخدم مصدرًا مبسطًا عالي التباين وافحص المعاينة.',
        ],
      ],
    },
    'gif-converter': {
      title: ['GIF Frame Splitter', 'مقسّم إطارات GIF'],
      description: [
        'Decode GIF frames and export exact composed PNGs locally.',
        'فك إطارات GIF وتصدير PNG مركبة بدقة محليًا.',
      ],
      note: [
        'Frames are composited with source/over blending and none/background/previous disposal before PNG export. Timing and loop metadata are reported but PNG frames are not animated.',
        'تُركّب الإطارات بمزج المصدر/فوق ومعالجة التخلص قبل تصدير PNG. تُعرض بيانات التوقيت والتكرار لكن إطارات PNG غير متحركة.',
      ],
      faqs: [
        [
          'Why do exported frames include earlier pixels?',
          'لماذا تتضمن الإطارات المصدّرة بكسلات سابقة؟',
        ],
        [
          'GIF frames can update only a rectangle; the splitter applies disposal and blending to produce each complete displayed frame.',
          'قد يحدّث إطار GIF مستطيلاً فقط؛ يطبق المقسّم التخلص والمزج لإنتاج كل إطار معروض كامل.',
        ],
        ['Are frame delays preserved?', 'هل تُحفظ مدد الإطارات؟'],
        [
          'The delay and loop count are reported in the interface; individual PNG downloads contain pixels, not animation timing.',
          'تُعرض المدة وعدد التكرارات في الواجهة؛ تحتوي ملفات PNG الفردية على البكسلات لا توقيت الحركة.',
        ],
      ],
    },
    'embedded-converter': {
      title: ['Embedded Image Converter', 'محول الصور للأنظمة المضمنة'],
      description: [
        'Export pixels for LVGL, Arduino, ESP32, and raw targets locally.',
        'صدّر البكسلات لـ LVGL وArduino وESP32 والأهداف الخام محليًا.',
      ],
      note: [
        'Colour depth, byte order, alpha layout, stride, and target descriptor fields affect the emitted bytes. Generated bindings are compiled against pinned target headers in CI.',
        'يؤثر عمق اللون وترتيب البايت وتخطيط ألفا والخطوة وحقول واصف الهدف في البايتات الناتجة. تُجمع الروابط المولدة مقابل رؤوس أهداف مثبتة في CI.',
      ],
      faqs: [
        ['Why can colours differ on the target display?', 'لماذا قد تختلف الألوان على شاشة الهدف؟'],
        [
          'RGB565 and other reduced-depth layouts quantize channels; byte order and display configuration must also match the export.',
          'تكمّم تخطيطات RGB565 وغيرها القنوات؛ ويجب أن يطابق ترتيب البايت وإعداد الشاشة التصدير.',
        ],
        ['Are generated C descriptors compile-checked?', 'هل تُفحص واصفات C المولدة بالتجميع؟'],
        [
          'Yes. Production fixtures compile against pinned LVGL, Adafruit GFX, and TFT_eSPI target headers.',
          'نعم. تُجمع تجهيزات الإنتاج مقابل رؤوس LVGL وAdafruit GFX وTFT_eSPI المثبتة.',
        ],
      ],
    },
    'base64-image': {
      title: ['Image to Base64', 'تحويل الصورة إلى Base64'],
      description: [
        'Encode images as data URLs or decode data URLs locally.',
        'رمّز الصور كعناوين بيانات أو فك عناوين البيانات محليًا.',
      ],
      note: [
        'Base64 preserves the source bytes but expands them by roughly one third before the data-URL prefix. It is convenient for small inline assets, not large photographs.',
        'يحافظ Base64 على بايتات المصدر لكنه يزيد حجمها بنحو الثلث قبل بادئة عنوان البيانات. يناسب الأصول الصغيرة المضمنة لا الصور الكبيرة.',
      ],
      faqs: [
        ['Does Base64 change image quality?', 'هل يغيّر Base64 جودة الصورة؟'],
        [
          'No. Encoding and decoding round-trip the exact bytes; only the textual representation changes.',
          'لا. يعيد الترميز وفك الترميز البايتات نفسها؛ يتغير التمثيل النصي فقط.',
        ],
        ['Why is the Base64 text larger?', 'لماذا يكون نص Base64 أكبر؟'],
        [
          'Four text characters represent each three source bytes, plus a short MIME prefix.',
          'تمثل أربعة محارف نصية كل ثلاثة بايتات مصدر إضافة إلى بادئة MIME قصيرة.',
        ],
      ],
    },
    'cbz-converter': {
      title: ['CBZ Converter', 'محول CBZ'],
      description: [
        'Pack ordered images into CBZ or extract pages locally.',
        'احزم الصور المرتبة في CBZ أو استخرج الصفحات محليًا.',
      ],
      note: [
        'CBZ is a ZIP container of image pages. Natural filename sorting controls reading order; image bytes are preserved and unsafe archive paths are rejected.',
        'CBZ حاوية ZIP لصفحات الصور. يتحكم ترتيب أسماء الملفات الطبيعي في ترتيب القراءة؛ تُحفظ بايتات الصور وتُرفض مسارات الأرشيف غير الآمنة.',
      ],
      faqs: [
        ['How is page order determined?', 'كيف يُحدد ترتيب الصفحات؟'],
        [
          'Names are sorted naturally, so page2 precedes page10. Rename files before packing when a different order is required.',
          'تُرتب الأسماء طبيعيًا، لذلك تسبق page2 ملف page10. أعد تسمية الملفات قبل الحزم لترتيب مختلف.',
        ],
        [
          'Can a CBZ write outside the extraction folder?',
          'هل يمكن لـ CBZ الكتابة خارج مجلد الاستخراج؟',
        ],
        [
          'No. Absolute paths and parent-directory traversal are rejected before entries are exposed.',
          'لا. تُرفض المسارات المطلقة واجتياز المجلد الأب قبل إظهار العناصر.',
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
  <link rel="canonical" href={canonical} />
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
