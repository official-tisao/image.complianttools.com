export function renderFilenameTemplate(
  template: string,
  values: {
    name: string;
    ext: string;
    width: number;
    height: number;
    index?: number;
    date?: Date;
    recipe?: string;
    hash?: string;
  },
): string {
  const tokens: Record<string, string> = {
    name: values.name,
    ext: values.ext.replace(/^\./u, ''),
    w: String(values.width),
    h: String(values.height),
    index: String(values.index ?? 1),
    date: (values.date ?? new Date()).toISOString().slice(0, 10),
    recipe: values.recipe ?? 'recipe',
    hash: values.hash ?? 'unhashed',
  };
  return template
    .replace(/\{(name|ext|w|h|index|date|recipe|hash)\}/gu, (_, token: string) => tokens[token]!)
    .replace(/[<>:"/\\|?*]/gu, '-');
}
