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
  const expanded = [...value].map((letter) => accents[letter] ?? letter).join('');
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
