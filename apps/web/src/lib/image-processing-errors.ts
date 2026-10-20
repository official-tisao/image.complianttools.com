import { translate, type Locale } from './i18n.ts';

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

/**
 * The user-facing message for a failed image operation.
 *
 * The message names the remedy instead of the raw failure, so a WebAssembly instantiation error
 * never reaches the page: the runtime detail is what the classification exists to withhold.
 */
export function imageProcessingFailureMessage(error: unknown, locale: Locale = 'en'): string {
  const failure = classifyImageProcessingFailure(error);

  if (failure === 'unsupported-image')
    return translate(
      locale,
      'error.unsupportedImage',
      'The browser could not read this image. Choose a valid JPEG, PNG, or WebP and try again.',
    );

  if (failure === 'codec-load')
    return translate(
      locale,
      'error.codecLoad',
      'A local image codec could not be loaded. Refresh the page and try again. If the problem persists, the codec asset may be unavailable.',
    );

  return translate(
    locale,
    'error.processingLocal',
    'The image could not be processed locally. Check that it is a valid JPEG, PNG, or WebP and try again.',
  );
}
