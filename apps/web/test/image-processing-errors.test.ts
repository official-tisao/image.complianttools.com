import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyImageProcessingFailure,
  imageProcessingFailureMessage,
  UnsupportedImageFileError,
} from '../src/lib/image-processing-errors.ts';
import { arabic } from '../src/lib/locales/ar.ts';
import { registerLocale } from '../src/lib/locales/registry.ts';

registerLocale('ar', arabic);

const WASM_HTML_RESPONSE =
  'WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 64 6f @+0';

test('reports unreadable source images separately from codec failures', () => {
  assert.equal(
    classifyImageProcessingFailure(new UnsupportedImageFileError()),
    'unsupported-image',
  );
  assert.equal(classifyImageProcessingFailure(new Error(WASM_HTML_RESPONSE)), 'codec-load');
  assert.equal(classifyImageProcessingFailure(new TypeError('Failed to fetch')), 'codec-load');
  assert.equal(classifyImageProcessingFailure(new Error('Canvas allocation failed')), 'processing');
});

test('gives codec-loading failures actionable copy without exposing runtime details', () => {
  const message = imageProcessingFailureMessage(new Error(WASM_HTML_RESPONSE), 'en');
  assert.match(message, /codec could not be loaded/iu);
  assert.match(message, /refresh the page/iu);
  assert.doesNotMatch(message, /WebAssembly|00 61 73 6d|3c 21 64 6f|@\+0/iu);
});

test('gives malformed and unsupported images a distinct actionable message', () => {
  const message = imageProcessingFailureMessage(new UnsupportedImageFileError(), 'en');
  assert.match(message, /could not read this image/iu);
  assert.match(message, /JPEG, PNG, or WebP/iu);
});

test('localizes codec failure guidance for Arabic and pseudo-locale', () => {
  const error = new Error(WASM_HTML_RESPONSE);
  assert.notEqual(
    imageProcessingFailureMessage(error, 'ar'),
    imageProcessingFailureMessage(error, 'en'),
  );
  assert.match(imageProcessingFailureMessage(error, 'en-XA'), /^［/u);
});
