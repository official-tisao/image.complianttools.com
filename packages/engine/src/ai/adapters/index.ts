import { registerProvider } from '../registry.js';
import { testStubAdapter } from './test-stub.js';
import { anthropicAdapter } from './anthropic.js';
import { openaiAdapter } from './openai.js';
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
  anthropicAdapter,
  openaiAdapter,
  geminiAdapter,
  stabilityAdapter,
  bflAdapter,
  falAdapter,
  replicateAdapter,
  removeBgAdapter,
  clipdropAdapter,
  openaiCompatibleAdapter,
};
// P5-15: `anthropic` and `openai` were implemented and unit-tested but never registered, so
// `providersByCapability` could not see them and every capability lookup returned providers whose
// `run()` is a stub. They are the only two adapters with a real `run()` (see `adapter-contracts.ts`),
// so registering them is what makes the registry's answer match reality.
registerProvider(testStubAdapter);
registerProvider(anthropicAdapter);
registerProvider(openaiAdapter);
registerProvider(geminiAdapter);
registerProvider(stabilityAdapter);
registerProvider(bflAdapter);
registerProvider(falAdapter);
registerProvider(replicateAdapter);
registerProvider(removeBgAdapter);
registerProvider(clipdropAdapter);
registerProvider(openaiCompatibleAdapter);
