import type { FormatCapability, RuntimeCapabilities } from '@complianttools/image-engine';

export const CAPABILITIES_DEBUG_PATH = '/debug/capabilities';

export function renderCapabilitiesDebug(
  runtime: RuntimeCapabilities,
  formats: readonly FormatCapability[],
): string {
  const runtimeRows = Object.entries(runtime)
    .map(
      ([name, available]) =>
        `<tr><th scope="row">${name}</th><td>${available ? 'available' : 'unavailable'}</td></tr>`,
    )
    .join('');
  const formatRows = formats
    .map(
      ({ id, decode, encode }) =>
        `<tr><th scope="row">${id}</th><td>${decode}</td><td>${encode}</td></tr>`,
    )
    .join('');
  return `<main><h1>Runtime capabilities</h1><table><tbody>${runtimeRows}</tbody></table><h2>Formats</h2><table><thead><tr><th>Format</th><th>Decode</th><th>Encode</th></tr></thead><tbody>${formatRows}</tbody></table></main>`;
}
