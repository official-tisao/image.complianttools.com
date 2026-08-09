export type ThemePreference = 'light' | 'dark' | 'system';

export function resolveTheme(
  preference: ThemePreference | null,
  systemPrefersDark: boolean,
): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemPrefersDark ? 'dark' : 'light';
}

export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var p=localStorage.getItem('theme');var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;
