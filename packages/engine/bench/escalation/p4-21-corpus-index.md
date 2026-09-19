/* P4-21 Escalation Benchmark Corpus Index */
export interface P4_21CorpusIndex {
phase: 'P4-21'; planeDate: string; sourceOfTruth: string;
capabilities: { capability: string; status: string }[];
}
export const p4_21_corpus_index: P4_21CorpusIndex = {
phase: 'P4-21', planeDate: '2026-09-18',
sourceOfTruth: 'PLAN.md P4-21; README §13.1.3 / §26 Phase 4 exit',
capabilities: [
{ capability: 'upscale T32', status: 'BLOCKED (reference fixtures + weights unverified)' },
{ capability: 'smart-crop T27', status: 'PARTIAL (Tier 1 available; no gap)' },
{ capability: 'compare T60', status: 'PARTIAL (available)' },
{ capability: 'duplicates T61', status: 'PARTIAL (available)' },
{ capability: 'OCR T62', status: 'BLOCKED (tessdata excluded; fixtures missing)' },
{ capability: 'accessibility T63', status: 'BLOCKED (pipeline partial; fixtures missing)' },
{ capability: 'generate T64', status: 'NOT_APPLICABLE (AI-only)' },
{ capability: 'edit T65', status: 'NOT_APPLICABLE (AI-only)' },
{ capability: 'inpaint T66', status: 'BLOCKED (pipeline not exported; fixtures missing)' },
{ capability: 'expand T67', status: 'BLOCKED (pipeline partial; fixtures missing)' },
{ capability: 'bg-remove T68', status: 'BLOCKED (weights excluded; fixtures missing)' },
{ capability: 'bg-replace T69', status: 'BLOCKED (pipeline partial; fixtures missing)' },
{ capability: 'pixel-art T70', status: 'PARTIAL (available)' },
{ capability: 'describe T71', status: 'BLOCKED (AI-only; fixtures missing)' },
{ capability: 'procedural T79', status: 'DONE (deterministic)' },
{ capability: 'colour-match T80', status: 'DONE (no Tier 3)' },
{ capability: 'adaptive-resize T81', status: 'PARTIAL (available)' },
{ capability: 'face-blur T57', status: 'BLOCKED (pipeline partial; fixtures missing)' },
],
};

/* Updated 2026-09-18: four previously planned benchmark files have been created. _/
/_ Added entries reflect actual file contents with no fabricated measurements. */
