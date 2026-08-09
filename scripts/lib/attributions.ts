export const ijgAttribution = 'Independent JPEG Group';

export function assertRequiredAttributions(markdown: string, renderedPage: string): void {
  if (!markdown.includes(ijgAttribution)) {
    throw new Error(`docs/THIRD-PARTY-LICENSES.md is missing "${ijgAttribution}".`);
  }
  if (!renderedPage.includes(ijgAttribution)) {
    throw new Error(`The rendered /licenses page is missing "${ijgAttribution}".`);
  }
}
