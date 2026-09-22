import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = resolve(root, 'packages/engine/bench/escalation/p4-21-corpus-index.md');
const readmePath = resolve(root, 'packages/engine/bench/escalation/p4-21-README.md');

const index = await readFile(indexPath, 'utf8');
const readme = await readFile(readmePath, 'utf8');

// These are the capabilities currently named by README §13.1.3 plus the
// directly related P4-20 measurements. Keep this list explicit so a new
// register row cannot silently appear without a corpus disposition.
const requiredRows = [
  'T64 Text to image',
  'T65 Prompt edit',
  'T71 Describe / alt text / caption / tags',
  'T66 Inpaint / object removal',
  'T67 Generative expand / outpaint',
  'T68 Background removal',
  'T69 Background replace',
  'T32 Upscale',
  'T27 Segment / click-to-select assist',
  'T27 Smart Crop',
  'T62 OCR',
  'Denoise (T44)',
  'Colour / tone',
  'T57 Blur faces',
  'T60 Compare',
  'T61 Duplicates',
  'T63 Alt Text Review',
  'T70 Pixel-art upscale',
  'T79 Procedural generator',
  'T80 Colour match',
  'T81 Adaptive resize',
];

const missingRows = requiredRows.filter((label) => !index.includes(`| ${label}`));
if (missingRows.length > 0) {
  throw new Error(`P4-21 corpus index is missing register rows: ${missingRows.join(', ')}`);
}

const requiredEvidence = [
  'p4-21-t32-upscale.md',
  'p4-21-t27-smart-crop.md',
  'p4-21-t27-segment.md',
  'p4-21-t62-ocr.md',
  'p4-21-t57-face-blur.md',
  'p4-21-t60-compare.md',
  'p4-21-t61-duplicates.md',
  'p4-21-t67-expand.md',
  'p4-21-t68-background-removal.md',
  'p4-21-t69-background-replace.md',
  'p4-21-t79-procedural.md',
  'p4-21-t80-colour-match.md',
  'p4-21-t81-adaptive-resize.md',
];

for (const relativePath of requiredEvidence) {
  await access(resolve(root, 'packages/engine/bench/escalation', relativePath));
}

const corpusDocs = `${readme}\n${index}`;
for (const marker of ['Never fabricate', 'MEASURED', 'BLOCKED', 'NOT APPLICABLE']) {
  if (!corpusDocs.includes(marker)) {
    throw new Error(`P4-21 README is missing the evidence marker: ${marker}`);
  }
}

console.log(
  `P4_21_REGISTER_OK ${requiredRows.length} rows ${requiredEvidence.length} linked reports`,
);
