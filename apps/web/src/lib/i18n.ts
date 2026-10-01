import type { OptionDescription } from '@complianttools/image-engine/schemas/options';

import { lookup } from './locales/registry.ts';

export type Locale = 'en' | 'en-XA' | 'ar';

// The Arabic catalogue lives in `lib/locales/ar.ts` and is attached to `locales/registry` by
// `routes/[locale]/+layout.svelte`. It used to be a literal in this file, which put ~18.5 KB of
// gzipped Arabic into every route's initial graph — including English pages, which never read it.
// `en` resolves from the call-site fallback and `en-XA` derives from `pseudo()`, so both need no
// stored table and neither pays for the chunk.
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
    locale === 'ar'
      ? (lookup('ar', key) ?? fallback)
      : locale === 'en-XA'
        ? pseudo(fallback)
        : fallback;
  return message.replace('{value}', value !== undefined ? String(value) : '');
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
