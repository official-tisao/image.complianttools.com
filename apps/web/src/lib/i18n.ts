import type { OptionDescription } from '@complianttools/image-engine';

export type Locale = 'en' | 'en-XA' | 'ar';

// Translators: keep product and format names unchanged; preserve the {value} placeholders.
const arabic: Readonly<Record<string, string>> = {
  'nav.convert': 'تحويل',
  'nav.compress': 'ضغط',
  'nav.resize': 'تغيير الحجم',
  'privacy.badge': 'محلي فقط',
  'privacy.copy': 'تتم المعالجة على جهازك. لا يتم رفع أي ملف.',
  'workspace.eyebrow': 'أداة صور محلية',
  'workspace.choose': 'اختر صورة',
  'workspace.empty': 'ستظهر معاينة قبل وبعد هنا.',
  'workspace.options': 'الخيارات',
  'workspace.download': 'تنزيل',
  'workspace.questions': 'أسئلة',
  'faq.upload.title': 'هل يتم رفع الصور؟',
  'faq.upload.body': 'لا. يتم فك الترميز والمعالجة والمعاينة والتصدير محليًا في متصفحك.',
  'faq.preview.title': 'هل تطابق المعاينة الملف المصدّر؟',
  'faq.preview.body': 'تعمل الوصفة نفسها على المعاينة والملف كامل الدقة.',
  'faq.loss.title': 'ما الذي قد يُفقد أثناء المعالجة؟',
  'faq.loss.body':
    'قد تتخلص الصيغ الضائعة من بعض التفاصيل، ولا تُحذف البيانات الوصفية إلا عند اختيار ذلك.',
  'workspace.substance':
    'تعمل هذه الأداة بالكامل في متصفحك. افحص المقارنة ثم نزّل النتيجة المناسبة.',
  'nav.jpegGuide': 'دليل JPEG',
  'nav.editor': 'المحرر',
  'nav.connectAi': 'ربط الذكاء الاصطناعي',
  'compare.mode': 'وضع المقارنة',
  'compare.split': 'قبل وبعد',
  'compare.fit': 'ملاءمة',
  'compare.zoom': 'تكبير',
  'compare.panLeft': 'حرّك الصورة يسارًا',
  'compare.panRight': 'حرّك الصورة يمينًا',
  'compare.panUp': 'حرّك الصورة للأعلى',
  'compare.panDown': 'حرّك الصورة للأسفل',
  'control.advanced': 'متقدم',
  'control.reset': 'إعادة ضبط',
  'status.choose': 'اختر صورة للبدء',
  'status.updated': 'تم التحديث خلال {value} مللي ثانية',
  'error.process': 'تعذرت معالجة هذه الصورة.',
  'error.remedy': 'جرّب JPEG أو PNG أو WebP.',
  'error.remedyLabel': 'الحل',
  'inspector.back': '← تحويل',
  'inspector.title': 'فاحص الصور',
  'inspector.description':
    'افحص أبعاد الصورة ولونها وعمقها وشفافيتها وحركتها وبنية الحاوية وبياناتها الوصفية المدعومة محليًا. لا يُرفع ملفك مطلقًا.',
  'inspector.choose': 'اختر صورة',
  'inspector.name': 'الاسم',
  'inspector.type': 'النوع',
  'inspector.size': 'الحجم',
  'inspector.dimensions': 'الأبعاد',
  'inspector.aspect': 'نسبة العرض إلى الارتفاع',
  'inspector.dpi': 'دقة DPI',
  'inspector.colour': 'مساحة اللون',
  'inspector.depth': 'عمق البت',
  'inspector.channels': 'القنوات',
  'inspector.alpha': 'الشفافية',
  'inspector.animation': 'الحركة',
  'inspector.entropy': 'إنتروبيا البايت',
  'inspector.quality': 'جودة JPEG',
  'inspector.unknown': 'غير معروف',
  'inspector.notDeclared': 'غير مصرّح بها',
  'inspector.yes': 'نعم',
  'inspector.no': 'لا',
  'inspector.estimate': 'تقدير',
  'inspector.frames': '{value} إطارات',
  'inspector.bitsPerByte': 'بت/بايت',
  'inspector.notApplicable': 'غير منطبق أو غير متاح',
  'inspector.structure': 'تفريغ المقاطع / الأجزاء',
  'inspector.metadata': 'البيانات الوصفية المدعومة',
  'inspector.failure': 'فشل فحص الصورة',
  'inspector.remedy': 'اختر صورة PNG أو JPEG أو GIF أو WebP صالحة ثم حاول مجددًا.',
  'inspector.unable': 'تعذر فحص هذه الصورة.',
  'inspector.metaDescription':
    'افحص أبعاد الصورة ولونها وعمقها وشفافيتها وحركتها وبنيتها وبياناتها الوصفية محليًا.',
  'remover.back': '← عارض البيانات الوصفية',
  'remover.title': 'مزيل البيانات الوصفية',
  'remover.description':
    'تُزال بيانات PNG وJPEG وGIF وWebP الوصفية محليًا. لا تُعرض خيارات الإزالة الخاصة بالصيَغ الأخرى حتى تُنفذ وتُتحقق.',
  'remover.fields': 'حقول EXIF المراد إزالتها',
  'remover.choose': 'اختر ملف PNG أو JPEG أو GIF أو WebP',
  'remover.metaDescription': 'أزل بيانات PNG وJPEG وGIF وWebP الوصفية المدعومة محليًا في متصفحك.',
  'remover.failure': 'فشلت إزالة البيانات الوصفية',
  'remover.remedy': 'اختر ملف PNG أو JPEG أو GIF أو WebP صالحًا، أو اختر الاحتفاظ بكل شيء.',
  'remover.selectiveJpeg': 'هذا الإعداد الانتقائي متحقق حاليًا لملفات JPEG فقط.',
  'remover.unable': 'تعذرت إزالة البيانات الوصفية من هذا الملف.',
  'remover.kept': 'تم الاحتفاظ بكل بايت محليًا ({value} بايت).',
  'remover.removed': 'أُزيلت البيانات الوصفية محليًا.',
  'remover.artist': 'الفنان',
  'remover.copyright': 'حقوق النشر',
  'remover.descriptionField': 'وصف الصورة',
  'remover.comment': 'تعليق المستخدم',
  'remover.date': 'تاريخ الالتقاط الأصلي',
  'remover.software': 'البرنامج',
  'remover.rating': 'التقييم',
  'remover.keywords': 'الكلمات المفتاحية',
  'remover.gps': 'إحداثيات GPS',
  'remover.orientation': 'الاتجاه',
  'remover.makerNotes': 'ملاحظات الشركة المصنّعة',
  'option.metadata.preset.label': 'إعداد الإزالة',
  'option.metadata.preset.help':
    'الاحتفاظ بكل شيء هو الإعداد الافتراضي الآمن الذي لا يغيّر الملف. اختر سياسة إزالة صراحةً.',
  'option.metadata.preset.option.keep': 'الاحتفاظ بكل شيء',
  'option.metadata.preset.option.all': 'إزالة الكل',
  'option.metadata.preset.option.gps': 'إزالة GPS فقط',
  'option.metadata.preset.option.except-orientation-copyright': 'الاحتفاظ بالاتجاه وحقوق النشر',
  'option.metadata.preset.option.maker-notes': 'إزالة ملاحظات الشركة المصنّعة',
  'option.metadata.preset.option.custom': 'اختيار حقول EXIF',
  'viewer.back': '← تحويل',
  'viewer.title': 'عارض البيانات الوصفية',
  'viewer.description':
    'يبقى ملفك في هذا المتصفح. تُقرأ علامات البيانات الوصفية في PNG وJPEG وGIF وWebP وAVIF وHEIF محليًا.',
  'viewer.choose': 'اختر صورة',
  'viewer.none': 'لم يُعثر على بيانات وصفية قابلة للقراءة.',
  'viewer.namespace': 'مساحة الاسم',
  'viewer.field': 'الحقل',
  'viewer.value': 'القيمة',
  'viewer.editHeading': 'إضافة حقول EXIF أو تعديلها',
  'viewer.editDescription':
    'اختر الحقول المراد إضافتها أو تغييرها. تُلحق القيم الأطول والحقول الجديدة عبر بنية EXIF معاد بناؤها؛ وتبقى البيانات غير المحددة دون تغيير.',
  'viewer.download': 'تنزيل JPEG المعدّل',
  'viewer.metaDescription': 'اقرأ بيانات الصور الوصفية المدعومة وعدّلها محليًا في متصفحك.',
  'viewer.inspectFailure': 'فشل فحص البيانات الوصفية',
  'viewer.inspectRemedy':
    'اختر ملف PNG أو JPEG أو GIF أو WebP أو AVIF أو HEIF صالحًا ثم حاول مجددًا.',
  'viewer.inspectUnable': 'تعذر على قارئ البيانات الوصفية المحلي فحص الملف.',
  'viewer.selectField': 'اختر حقل EXIF موجودًا واحدًا على الأقل لتعديله.',
  'viewer.gpsPair': 'اختر خط العرض وخط الطول معًا عند إضافة الإحداثيات أو تعديلها.',
  'viewer.editFailure': 'فشل تعديل EXIF',
  'viewer.editRemedy': 'اختر حقولًا موجودة بقيم صالحة، أو استخدم مزيل البيانات الوصفية لحذفها.',
  'viewer.editUnable': 'تعذر تعديل حقول EXIF هذه.',
  'viewer.editedOne': 'عُدّل حقل EXIF موجود واحد محليًا؛ وحُفظت جميع البايتات الأخرى.',
  'viewer.editedMany': 'عُدّلت {value} حقول EXIF موجودة محليًا؛ وحُفظت جميع البايتات الأخرى.',
  'viewer.artist': 'الفنان',
  'viewer.copyright': 'حقوق النشر',
  'viewer.imageDescription': 'وصف الصورة',
  'viewer.userComment': 'تعليق المستخدم',
  'viewer.dateTimeOriginal': 'تاريخ الالتقاط الأصلي',
  'viewer.software': 'البرنامج',
  'viewer.rating': 'التقييم',
  'viewer.keywords': 'الكلمات المفتاحية',
  'viewer.orientation': 'الاتجاه',
  'viewer.latitude': 'خط عرض GPS',
  'viewer.longitude': 'خط طول GPS',
  'option.metadata.edit.artist.enabled.label': 'تعديل الفنان',
  'option.metadata.edit.artist.value.label': 'قيمة الفنان',
  'option.metadata.edit.copyright.enabled.label': 'تعديل حقوق النشر',
  'option.metadata.edit.copyright.value.label': 'قيمة حقوق النشر',
  'option.metadata.edit.imageDescription.enabled.label': 'تعديل وصف الصورة',
  'option.metadata.edit.imageDescription.value.label': 'قيمة وصف الصورة',
  'option.metadata.edit.userComment.enabled.label': 'تعديل تعليق المستخدم',
  'option.metadata.edit.userComment.value.label': 'قيمة تعليق المستخدم',
  'option.metadata.edit.dateTimeOriginal.enabled.label': 'تعديل تاريخ الالتقاط الأصلي',
  'option.metadata.edit.dateTimeOriginal.value.label': 'قيمة تاريخ الالتقاط الأصلي',
  'option.metadata.edit.software.enabled.label': 'تعديل البرنامج',
  'option.metadata.edit.software.value.label': 'قيمة البرنامج',
  'option.metadata.edit.rating.enabled.label': 'تعديل التقييم',
  'option.metadata.edit.rating.value.label': 'قيمة التقييم',
  'option.metadata.edit.keywords.enabled.label': 'تعديل الكلمات المفتاحية',
  'option.metadata.edit.keywords.value.label': 'قيمة الكلمات المفتاحية',
  'option.metadata.edit.orientation.enabled.label': 'تعديل الاتجاه',
  'option.metadata.edit.orientation.value.label': 'قيمة الاتجاه',
  'option.metadata.edit.latitude.enabled.label': 'تعديل خط عرض GPS',
  'option.metadata.edit.latitude.value.label': 'قيمة خط عرض GPS',
  'option.metadata.edit.longitude.enabled.label': 'تعديل خط طول GPS',
  'option.metadata.edit.longitude.value.label': 'قيمة خط طول GPS',
  'base64.back': '← تحويل',
  'base64.title': 'الصورة إلى Base64',
  'base64.description': 'حوّل صورة إلى عنوان بيانات أو فك عنوان بيانات إلى ملف محليًا.',
  'base64.choose': 'اختر صورة',
  'base64.dataUrl': 'عنوان بيانات Base64',
  'base64.copy': 'نسخ Base64',
  'base64.html': 'مقتطف HTML',
  'base64.copyHtml': 'نسخ HTML',
  'base64.css': 'مقتطف CSS',
  'base64.copyCss': 'نسخ CSS',
  'base64.decode': 'فك الترميز والتنزيل',
  'base64.copied': 'نُسخ محليًا إلى الحافظة.',
  'base64.decoded': 'فُك ترميز {value} بايت محليًا باسم',
  'base64.encodeError': 'تعذر ترميز هذه الصورة. اختر ملفًا صالحًا أصغر من حد 32 ميجابايت.',
  'base64.decodeError': 'تعذر فك عنوان البيانات. الصق عنوان Base64 صالحًا أصغر من حد 32 ميجابايت.',
  'base64.clipboardError': 'تعذر النسخ. اسمح بالوصول إلى الحافظة ثم حاول مجددًا.',
  'base64.metaDescription':
    'حوّل الصور إلى عناوين بيانات Base64 أو أعدها إلى ملفات محلية في متصفحك.',
  'option.base64.mode.label': 'الاتجاه',
  'option.base64.mode.option.encode': 'الصورة إلى Base64',
  'option.base64.mode.option.decode': 'Base64 إلى ملف',
  'favicon.back': '← تحويل',
  'favicon.title': 'منشئ الأيقونة المفضلة',
  'favicon.description':
    'أنشئ ملف ICO متعدد الدقات ومجموعة أيقونات PNG وبيان ويب ومقتطف روابط HTML محليًا. لا تُرفع صورتك مطلقًا.',
  'favicon.choose': 'اختر صورة',
  'favicon.create': 'إنشاء الحزمة',
  'favicon.download': 'تنزيل الحزمة',
  'favicon.preview': 'معاينة الحزمة الدقيقة 32×32',
  'favicon.previewAlt': 'أيقونة مفضلة منشأة بمقاس 32 في 32',
  'favicon.html': 'مقتطف روابط HTML',
  'favicon.siteNameChanged': 'تغير اسم الموقع. أنشئ الحزمة مجددًا لتحديث بيانها.',
  'favicon.ready': '{value} جاهز.',
  'favicon.chooseFirst': 'اختر صورة أولًا.',
  'favicon.canvasError': 'لا يستطيع متصفحك إنشاء لوحة محلية.',
  'favicon.failure': 'فشل إنشاء الأيقونة المفضلة',
  'favicon.remedy': 'اختر صورة نقطية صالحة أو قلّل أبعادها أو استخدم اسم موقع أقصر.',
  'favicon.created': 'أُنشئ favicon.ico وأيقونات PNG وبيان ويب ومقتطف HTML محليًا.',
  'favicon.unable': 'تعذر إنشاء الأيقونة المفضلة.',
  'favicon.nameError': 'يجب أن يحتوي اسم الموقع على 1 إلى 128 حرفًا.',
  'favicon.metaDescription':
    'أنشئ حزمة أيقونة مفضلة متعددة الدقات مع أيقونات PNG وبيان وHTML محليًا.',
  'option.favicon.siteName.label': 'اسم الموقع',
  'option.favicon.siteName.help': 'يُستخدم لحقلي name وshort_name في site.webmanifest.',
  'svgRaster.back': '← تحويل',
  'svgRaster.title': 'SVG إلى PNG',
  'svgRaster.description':
    'حوّل SVG مستقلًا إلى صورة نقطية محليًا. تُرفض المراجع الخارجية ومحتويات SVG النشطة.',
  'svgRaster.choose': 'اختر ملف SVG',
  'svgRaster.failure': 'فشل تحويل SVG إلى صورة نقطية',
  'svgRaster.remedy': 'اختر SVG مستقلًا صالحًا أو قلّل أبعاد الإخراج.',
  'svgRaster.canvasError': 'لا يستطيع متصفحك إنشاء لوحة محلية.',
  'svgRaster.pngError': 'فشل ترميز PNG.',
  'svgRaster.done': 'حُوّل {value} إلى PNG محليًا بالمقاس',
  'svgRaster.unable': 'تعذر تحويل ملف SVG هذا إلى صورة نقطية.',
  'svgRaster.metaDescription': 'حوّل SVG مستقلًا إلى PNG محليًا في متصفحك.',
  'option.svg.mode.label': 'حجم الإخراج',
  'option.svg.mode.option.original': 'الأبعاد الأصلية',
  'option.svg.mode.option.width': 'عرض محدد',
  'option.svg.mode.option.height': 'ارتفاع محدد',
  'option.svg.mode.option.scale': 'معامل القياس',
  'option.svg.value.label': 'قيمة البعد أو القياس',
  'option.svg.value.help':
    'تُتجاهل مع الأبعاد الأصلية. يستخدم العرض والارتفاع بكسلات كاملة، ويُحد معامل القياس عند 100×.',
};

const accents: Readonly<Record<string, string>> = {
  a: 'à',
  e: 'ë',
  i: 'ï',
  o: 'ô',
  u: 'ü',
  A: 'À',
  E: 'Ë',
  I: 'Ï',
  O: 'Ô',
  U: 'Ü',
};

function pseudo(value: string): string {
  const expanded = value
    .split(/(\{[^{}]+\})/u)
    .map((part) =>
      part.startsWith('{') ? part : [...part].map((letter) => accents[letter] ?? letter).join(''),
    )
    .join('');
  return `［${expanded} ${'~'.repeat(Math.max(2, Math.ceil(value.length / 5)))}］`;
}

export function translate(locale: Locale, key: string, fallback: string, value?: string | number) {
  const message =
    locale === 'ar' ? (arabic[key] ?? fallback) : locale === 'en-XA' ? pseudo(fallback) : fallback;
  return message.replace('{value}', String(value ?? ''));
}

export function localizeOptions(
  locale: Locale,
  descriptions: Readonly<Record<string, OptionDescription>>,
): Readonly<Record<string, OptionDescription>> {
  return Object.fromEntries(
    Object.entries(descriptions).map(([path, description]) => [
      path,
      {
        ...description,
        label: translate(locale, `option.${path}.label`, description.label),
        help: description.help
          ? translate(locale, `option.${path}.help`, description.help)
          : undefined,
        optionLabels: description.options
          ? Object.fromEntries(
              description.options.map((option) => [
                option,
                translate(
                  locale,
                  `option.${path}.option.${option}`,
                  description.optionLabels?.[option] ?? option,
                ),
              ]),
            )
          : description.optionLabels,
      },
    ]),
  );
}

export function toolCopy(locale: Locale, kind: 'convert' | 'compress' | 'resize') {
  const english = {
    convert: [
      'Image Converter',
      'Convert JPEG, PNG, and WebP locally with a live before-and-after preview.',
    ],
    compress: [
      'Image Compressor',
      'Reduce image size while seeing compression differences before download.',
    ],
    resize: [
      'Image Resizer',
      'Resize to exact pixels, percentages, fit bounds, or a target file size.',
    ],
  } as const;
  const arabicTools = {
    convert: ['محول الصور', 'حوّل JPEG وPNG وWebP محليًا مع معاينة مباشرة قبل وبعد.'],
    compress: ['ضاغط الصور', 'قلّل حجم الصورة وشاهد فروق الضغط قبل التنزيل.'],
    resize: [
      'أداة تغيير حجم الصور',
      'غيّر الحجم بالبكسل أو النسبة أو الحدود أو حجم الملف المستهدف.',
    ],
  } as const;
  const source = locale === 'ar' ? arabicTools[kind] : english[kind];
  return {
    title: locale === 'en-XA' ? pseudo(source[0]) : source[0],
    description: locale === 'en-XA' ? pseudo(source[1]) : source[1],
  };
}
