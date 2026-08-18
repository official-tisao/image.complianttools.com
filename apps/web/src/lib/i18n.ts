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
