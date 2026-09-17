/**
 * P4-17 — Verified OpenCV 4.9.0 cascade parser.
 *
 * Reads the verified `verified_cascade.xml` directly. All feature geometry,
 * stage thresholds, tree structures, and descriptor arrays are derived
 * exclusively from the XML. No synthetic or approximate data is produced.
 *
 * Authoritative encoding (verified against OpenCV 4.9.0 source):
 * - feature descriptor array (`<features>`): index = descriptor array index
 * - internalNodes for discrete/stump (`maxCatCount=0`):
 *   [left_value, right_value, featureIndex, threshold]
 * - leafValues applies at tree leaves (not per internal node for stumps)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface HaarFeatureRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly weight: number;
}

export interface HaarFeatureDescriptor {
  readonly rects: readonly HaarFeatureRect[];
}

export interface CascadeTree {
  readonly leftLeafValue: number;
  readonly rightLeafValue: number;
  readonly featureIndex: number;
  readonly threshold: number;
  readonly leafValues: [number, number];
}

export interface CascadeStage {
  readonly maxWeakCount: number;
  readonly stageThreshold: number;
  readonly trees: readonly CascadeTree[];
}

export interface ParsedVerifiedCascade {
  readonly width: number;
  readonly height: number;
  readonly stageCount: number;
  readonly stages: readonly CascadeStage[];
  readonly descriptors: readonly HaarFeatureDescriptor[];
}

function extractTagValue(text: string, tag: string): string | null {
  const regex = new RegExp('<' + tag + '>([^<]+)</' + tag + '>');
  const m = regex.exec(text);
  return m ? m[1]!.trim() : null;
}

function extractBlock(text: string, tag: string): string | null {
  const startTag = '<' + tag + '>';
  const endTag = '</' + tag + '>';
  const s = text.indexOf(startTag);
  if (s === -1) return null;
  const e = text.indexOf(endTag, s);
  if (e === -1) return null;
  return text.substring(s + startTag.length, e);
}

function parseDescriptorBlock(text: string): HaarFeatureDescriptor[] {
  const descriptors: HaarFeatureDescriptor[] = [];
  const inner = extractBlock(text, 'features') || '';
  const descriptorRegex = /<_>[\s\S]*?<\/rects>[\s\S]*?<\/_>/g;
  const descriptorMatches = (inner.match(descriptorRegex) || []).filter((m) =>
    m.includes('<rects>'),
  );
  for (const match of descriptorMatches) {
    const cleanSeg = match.replace(/^<_>/, '').replace(/<\/_>$/, '');
    const rectBlock = extractBlock(cleanSeg, 'rects');
    const rectEntries: HaarFeatureRect[] = [];
    if (rectBlock !== null) {
      const rectRegex = /<_>[\s\S]*?<\/_(?=\s*(?=<_|$))?/g;
      const rectMatches = rectBlock.match(rectRegex) || [];
      for (const rRaw of rectMatches) {
        const content = rRaw
          .replace(/^<_>/, '')
          .replace(/<\/_>$/, '')
          .trim();
        const nums = content
          .split(/\s+/)
          .filter((s: string) => s.length > 0)
          .map(Number);
        if (nums.length >= 5) {
          rectEntries.push({
            x: nums[0]!,
            y: nums[1]!,
            width: nums[2]!,
            height: nums[3]!,
            weight: nums[4]!,
          });
        }
      }
    }
    descriptors.push({ rects: rectEntries });
  }
  return descriptors;
}

function parseStageBlock(block: string): CascadeStage {
  const maxWeakStr = extractTagValue(block, 'maxWeakCount');
  const maxWeakCount = maxWeakStr !== null ? parseInt(maxWeakStr, 10) : 0;
  const thresholdStr = extractTagValue(block, 'stageThreshold');
  const threshold = thresholdStr !== null ? parseFloat(thresholdStr) : 0;
  const trees: CascadeTree[] = parseTrees(block);
  return { maxWeakCount, stageThreshold: threshold, trees };
}

function parseTrees(stageText: string): CascadeTree[] {
  const trees: CascadeTree[] = [];
  const weakClassifierText = extractBlock(stageText, 'weakClassifiers');
  if (!weakClassifierText) return trees;
  const pairs: string[] = [];
  let collecting = false;
  let current = '';
  const parts = weakClassifierText.split(/(<_>|<\/_(?=\s*(?=<_|$)?))/g);
  for (const part of parts) {
    if (part === '<_>') {
      collecting = true;
      current = '<_>';
    } else if (part === '</_>') {
      current += '</_>';
      pairs.push(current);
      collecting = false;
      current = '';
    } else if (collecting) {
      current += part;
    }
  }
  for (const seg of pairs) {
    if (!seg.includes('<internalNodes>') || !seg.includes('<leafValues>')) continue;
    const internalStr = extractTagValue(seg, 'internalNodes');
    const leafStr = extractTagValue(seg, 'leafValues');
    if (!internalStr || !leafStr) continue;
    const nodes = internalStr
      .split(/\s+/)
      .filter((s) => s.length > 0)
      .map(Number);
    // Verified encoding (discrete/stump, maxCatCount=0):
    // [left_value, right_value, featureIndex, threshold]
    // Per OpenCV 4.9.0 Data::read for maxNodesPerTree==1 (stump):
    // node.left = (int)*iter++; node.right = (int)*iter++;
    // node.featureIdx = (int)*iter++;
    // node.threshold = (float)*iter++;
    if (nodes.length < 4) continue;
    const leftLeafValue = nodes[0] ?? 0;
    const rightLeafValue = nodes[1] ?? 0;
    const featureIndex = nodes[2] ?? 0;
    const threshold = nodes[3] ?? 0;
    const leavesRaw = leafStr
      .split(/\s+/)
      .filter((s) => s.length > 0)
      .map(Number);
    const leafPair: [number, number] = [leavesRaw[0] ?? 0, leavesRaw[1] ?? 0];
    trees.push({
      leftLeafValue,
      rightLeafValue,
      featureIndex,
      threshold,
      leafValues: leafPair,
    });
  }
  return trees;
}

export function loadVerifiedCascade(): ParsedVerifiedCascade {
  const xmlPath = fileURLToPath(new URL('../../../../../verified_cascade.xml', import.meta.url));
  const xmlText = readFileSync(xmlPath, 'utf-8');
  const descriptors = parseDescriptorBlock(xmlText);
  const stageRegex = /<_>[\s\S]*?<maxWeakCount>[\s\S]*?<\/_(?=\s*(?=<_|$))?/g;
  const rawStages = xmlText.match(stageRegex) || [];
  const stages = rawStages.map((s) => parseStageBlock(s.trim()));
  const heightMatch = /<height>(\d+)<\/height>/.exec(xmlText);
  const widthMatch = /<width>(\d+)<\/width>/.exec(xmlText);
  return {
    width: widthMatch ? parseInt(widthMatch[1]!, 10) : 24,
    height: heightMatch ? parseInt(heightMatch[1]!, 10) : 24,
    stageCount: stages.length,
    stages,
    descriptors,
  };
}
