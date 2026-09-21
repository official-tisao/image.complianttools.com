import type { OptionDescription } from '@complianttools/image-engine/schemas/options';
import { translate, type Locale } from './i18n';

const arabic: Readonly<Record<string, string>> = {
  't63.title': 'مراجعة النص البديل',
  't63.description': 'اكتب وصفًا موجزًا للصورة لمراجعته من شخص. لا تنشئ الأداة وصفًا تلقائيًا.',
  't63.metaDescription': 'اكتب وراجع نصًا بديلًا يدويًا لصورة محلية، ثم انسخ سمة HTML الناتجة.',
  't63.eyebrow': 'مساعدة يدوية لإمكانية الوصول',
  't63.mainNavigation': 'التنقل الرئيسي',
  't63.privacy': 'تبقى الصورة والنص في هذا المتصفح. لا يوجد رفع أو تحليل آلي.',
  't63.chooseImage': 'اختر صورة للمراجعة',
  't63.fileHelp': 'PNG أو JPEG أو WebP ثابتة، حتى 16 ميبيبايت و6 ميغابكسل.',
  't63.draftHeading': 'اكتب مسودة',
  't63.chooseBeforeDraft': 'اختر صورة قبل كتابة النص البديل.',
  't63.draftLabel': 'مسودة النص البديل',
  't63.draftHelp': 'اكتب ما يلزم لفهم الصورة في سياق الصفحة، وتحقق من ذلك بنفسك.',
  't63.characterCount': 'عدد الأحرف: {value}/125',
  't63.previewLabel': 'معاينة الصورة',
  't63.previewAlt': 'الصورة المحددة للمراجعة اليدوية',
  't63.attributeHeading': 'معاينة سمة HTML',
  't63.attributeEmpty': 'اكتب وصفًا أو حدّد أن الصورة زخرفية لعرض السمة.',
  't63.copyAttribute': 'نسخ السمة',
  't63.copied': 'تم نسخ السمة.',
  't63.copyError': 'تعذر نسخ النص. حدّد السمة وانسخها يدويًا.',
  't63.imageDimensions': 'أبعاد الصورة: {value}',
  't63.faqHeading': 'أسئلة حول هذه الأداة',
  't63.faqAutomatic': 'هل تنشئ الأداة النص البديل تلقائيًا؟',
  't63.faqAutomaticAnswer':
    'لا. يراجع شخص الصورة ويكتب المسودة؛ لا تستخدم الصفحة نموذجًا أو تعرّفًا بصريًا.',
  't63.faqDecorative': 'متى أضع علامة على صورة بوصفها زخرفية؟',
  't63.faqDecorativeAnswer':
    'فقط إذا لم تضف الصورة معنى يتجاوز النص أو التخطيط المجاور. عندها تكون السمة alt="".',
  't63.faqPrivacy': 'هل يتم رفع الصورة؟',
  't63.faqPrivacyAnswer': 'لا. تُعرض الصورة وتُنسخ السمة في المتصفح فقط.',
  't63.related': 'أدوات ذات صلة',
  't63.linkConvert': 'تحويل الصور',
  't63.linkInspector': 'فاحص الصور',
  't63.linkOcr': 'التعرف على النصوص',
  't63.linkCompare': 'مقارنة الصور',
  't63.linkColor': 'مطابقة الألوان',
  't63.linkMetadata': 'عارض البيانات الوصفية',
  't63.remedy': 'الحل:',
  't63.error.unsupported-file': 'نوع الملف غير مدعوم.',
  't63.error.file-too-large': 'يتجاوز حجم الصورة حد 16 ميبيبايت.',
  't63.error.image-too-large': 'تتجاوز الصورة حد 6 ميغابكسل.',
  't63.error.decode-failed': 'تعذر على المتصفح فك ترميز الصورة.',
  't63.error.text-too-long': 'يجب ألا يتجاوز النص البديل 125 حرفًا.',
  't63.error.invalid-draft': 'أدخل وصفًا نصيًا عاديًا.',
  't63.error.invalid-options': 'خيارات المراجعة غير صالحة.',
  't63.remedy.unsupported-file': 'صدّر صورة PNG أو JPEG أو WebP ثابتة ثم اخترها مجددًا.',
  't63.remedy.file-too-large': 'اختر صورة أصغر من 16 ميبيبايت.',
  't63.remedy.image-too-large': 'اختر صورة لا تتجاوز 6 ميغابكسل.',
  't63.remedy.decode-failed': 'أعد تصدير صورة صالحة ثم اخترها مجددًا.',
  't63.remedy.text-too-long': 'اختصر المسودة إلى 125 حرفًا أو أقل.',
  't63.remedy.invalid-draft': 'اكتب وصفًا نصيًا عاديًا ثم حاول مجددًا.',
  't63.remedy.invalid-options': 'استعد الخيارات الافتراضية وحاول مجددًا.',
  'option.t63.decorative.label': 'اعتبار الصورة زخرفية',
  'option.t63.decorative.help':
    'استخدم هذا الخيار فقط إذا لم تضف الصورة أي معلومات إلى النص أو التخطيط المجاور.',
  't63.checklistHeading': 'قائمة مراجعة بشرية',
  'option.t63.purposeReviewed.label': 'وصفت غرض الصورة في سياق هذه الصفحة',
  'option.t63.purposeReviewed.help': 'اكتب المعلومات أو الوظيفة التي تضيفها الصورة هنا.',
  'option.t63.redundancyReviewed.label': 'تحققت من عدم تكرار النص المجاور',
  'option.t63.redundancyReviewed.help': 'تجنب تكرار التعليقات والعناوين ونص الرابط المجاور.',
  'option.t63.essentialDetailReviewed.label': 'أبقيت التفاصيل الضرورية فقط',
  'option.t63.essentialDetailReviewed.help': 'احذف التفاصيل التي لا تساعد القارئ على فهم الصفحة.',
};

export function translateT63(
  locale: Locale,
  key: string,
  fallback: string,
  value?: string | number,
) {
  const message = locale === 'ar' ? (arabic[key] ?? fallback) : translate(locale, key, fallback);
  return message.replace('{value}', String(value ?? ''));
}

export function localizeT63Options(
  locale: Locale,
  descriptions: Readonly<Record<string, OptionDescription>>,
): Readonly<Record<string, OptionDescription>> {
  return Object.fromEntries(
    Object.entries(descriptions).map(([path, description]) => [
      path,
      {
        ...description,
        label: translateT63(locale, `option.${path}.label`, description.label),
        help: description.help
          ? translateT63(locale, `option.${path}.help`, description.help)
          : undefined,
        optionLabels: description.options
          ? Object.fromEntries(
              description.options.map((option) => [
                option,
                translateT63(
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
