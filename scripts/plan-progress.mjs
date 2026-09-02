#!/usr/bin/env node
/**
 * Counts the Appendix A/B checklist checkboxes in PLAN.md so the progress dashboard
 * stays objective instead of drifting from the actual checkboxes.
 *
 * Usage: node scripts/plan-progress.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const planPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'PLAN.md');
const plan = await readFile(planPath, 'utf8');
const lines = plan.split('\n');

const heading = (pattern) =>
  lines.findIndex((line, index) => new RegExp(`^## ${pattern}`).test(line) && index > 0);

const aStart = heading('10\\. Appendix A');
const bStart = heading('11\\. Appendix B');
const cStart = heading('12\\. Appendix C');

const count = (text) => ({
  checked: (text.match(/\[x\]/g) ?? []).length,
  unchecked: (text.match(/\[ \]/g) ?? []).length,
});

const tools = count(lines.slice(aStart, bStart).join('\n'));
const formats = count(lines.slice(bStart, cStart).join('\n'));

const report = {
  tools: { total: tools.checked + tools.unchecked, checked: tools.checked },
  formats: { total: formats.checked + formats.unchecked, checked: formats.checked },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
