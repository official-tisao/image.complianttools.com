import { registerProvider } from '../registry.js';
import { testStubAdapter } from './test-stub.js';
import { geminiAdapter } from './gemini.js';
import { stabilityAdapter } from './stability.js';
import { bflAdapter } from './bfl.js';
import { falAdapter } from './fal.js';
import { replicateAdapter } from './replicate.js';
import { removeBgAdapter } from './removebg.js';
import { clipdropAdapter } from './clipdrop.js';
import { openaiCompatibleAdapter } from './openai-compatible.js';
export {
  testStubAdapter,
  geminiAdapter,
  stabilityAdapter,
  bflAdapter,
  falAdapter,
  replicateAdapter,
  removeBgAdapter,
  clipdropAdapter,
  openaiCompatibleAdapter,
};
registerProvider(testStubAdapter);
registerProvider(geminiAdapter);
registerProvider(stabilityAdapter);
registerProvider(bflAdapter);
registerProvider(falAdapter);
registerProvider(replicateAdapter);
registerProvider(removeBgAdapter);
registerProvider(clipdropAdapter);
registerProvider(openaiCompatibleAdapter);
