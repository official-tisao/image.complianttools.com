export type ImageProcessingFailure = 'unsupported-image' | 'codec-load' | 'processing';

/** Marks a source file that the browser cannot decode as an image. */
export class UnsupportedImageFileError extends Error {
  readonly code = 'unsupported-image';

  constructor() {
    super('The selected file is not a supported, readable image.');
    this.name = 'UnsupportedImageFileError';
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String(error.message);
  return '';
}

/** Classifies codec fetch/initialization errors without displaying their raw details to users. */
export function classifyImageProcessingFailure(error: unknown): ImageProcessingFailure {
  if (
    error instanceof UnsupportedImageFileError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'unsupported-image')
  )
    return 'unsupported-image';

  if (
    /webassembly|\bwasm\b|failed to fetch|network error|networkerror|dynamically imported module|loading chunk/iu.test(
      messageOf(error),
    )
  )
    return 'codec-load';

  return 'processing';
}
