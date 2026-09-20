import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageLoad } from './$types';

const locales = ['en-XA', 'ar'] as const;

export const prerender = true;
export const entries: EntryGenerator = () => locales.map((locale) => ({ locale }));

export const load: PageLoad = ({ params }) => {
  if (!locales.includes(params.locale as (typeof locales)[number])) error(404, 'Not found');
  return { locale: params.locale as (typeof locales)[number] };
};
