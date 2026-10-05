/**
 * T18 HTML / URL → Image — engine half. README §4.1, P6-01.
 *
 * The pasted-HTML path is local, so the layout has to be computed here, without a DOM. The
 * browser component is responsible for turning the returned RGBA into a PNG; this module owns
 * parsing, layout, and box painting.
 *
 * **What this is.** A bounded block-layout engine for a documented subset of HTML and CSS: it
 * parses a pasted document, resolves a `<style>` block and inline `style` attributes, wraps text
 * to a fixed column, and paints backgrounds.
 *
 * **What this is not.** It is not a browser. It does not fetch anything, run script, or load
 * fonts or images, and it does not implement flexbox, grid, floats, tables, positioning, or
 * transforms. Text is laid out by an injected `measureText`, so a headless test can verify the
 * geometry without a font, and the browser can supply a canvas measurer for real metrics.
 *
 * Fidelity claim: the output is a *faithful rendering of what this engine supports*, and
 * {@link parseHtmlBlocks} reports every feature it had to drop so the route can say so out loud
 * instead of shipping a picture that quietly differs from the pasted source.
 */

import type { EngineError, RasterImage } from '../types.js';

export interface HtmlCardBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Paint colour as `#rrggbb`. Never `transparent`; callers skip those. */
  readonly background: string;
}

export interface HtmlTextRun {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly color: string;
  readonly sizePx: number;
  readonly bold: boolean;
}

/** A feature this engine could not honour, so the route can warn instead of pretending. */
export interface HtmlCardWarning {
  readonly feature: string;
  readonly detail: string;
}

export interface HtmlCardLayout {
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly boxes: readonly HtmlCardBox[];
  readonly runs: readonly HtmlTextRun[];
}

export interface HtmlParseResult {
  readonly blocks: readonly HtmlBlock[];
  readonly warnings: readonly HtmlCardWarning[];
}

export interface HtmlBlock {
  readonly tag: string;
  readonly style: Declaration;
  readonly text: string;
}

export interface HtmlCardOptions {
  /** Output width in pixels. */
  readonly width: number;
  /** Transparent margin around the content column, in pixels. */
  readonly padding: number;
  /** Base font size in pixels, used for `rem`/`em` and for elements with no explicit size. */
  readonly fontSize: number;
  /** Output background colour as `#rrggbb`. */
  readonly background: string;
  /** Text colour used when the document does not set one. */
  readonly color: string;
}

const MAX_SOURCE_CHARS = 200_000;
const MAX_BLOCKS = 400;
const MAX_LINE_HEIGHT = 400;
const MIN_LINE_HEIGHT = 8;

/** Tags whose contents are never emitted and must not be walked as text. */
const DROPPED_TAGS = new Set([
  'script',
  'style',
  'head',
  'meta',
  'link',
  'title',
  'noscript',
  'iframe',
  'object',
  'embed',
  'template',
]);

const BLOCK_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'div',
  'li',
  'blockquote',
  'pre',
]);
const KNOWN_INLINE_TAGS = new Set([
  'span',
  'a',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'small',
  'code',
  'mark',
  'sup',
  'sub',
  'br',
  'wbr',
]);

const HEADING_SCALE: Readonly<Record<string, number>> = {
  h1: 2,
  h2: 1.5,
  h3: 1.25,
  h4: 1.125,
  h5: 1,
  h6: 1,
};

type TextAlign = 'left' | 'center' | 'right';

interface Declaration {
  background?: string;
  color?: string;
  fontSize?: number;
  bold?: boolean;
  align?: TextAlign;
  padding?: number;
  marginTop?: number;
  marginBottom?: number;
  maxWidth?: number;
}

const NAMED_COLOURS: Readonly<Record<string, string>> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  navy: '#000080',
  teal: '#008080',
  olive: '#808000',
  maroon: '#800000',
  aqua: '#00ffff',
  cyan: '#00ffff',
  fuchsia: '#ff00ff',
  magenta: '#ff00ff',
  transparent: 'transparent',
};

function cardError(kind: EngineError['kind'], remedy: string, detail?: string): EngineError {
  return (detail ? { kind, remedy, detail } : { kind, remedy }) as EngineError;
}

/**
 * Parses the colour forms this engine accepts into `#rrggbb`, or `undefined`.
 *
 * Deliberately narrow. A half-transparent colour has no defined meaning here — blending it
 * would need a separate text rasterizer — so `rgba()` at partial alpha returns `undefined` and
 * the caller inherits instead of guessing.
 */
export function parseHtmlColour(value: string): string | undefined {
  const input = value.trim().toLowerCase();
  if (input === '') return undefined;
  if (input === 'transparent') return 'transparent';
  const named = NAMED_COLOURS[input];
  if (named !== undefined) return named;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(input);
  if (hex) {
    const digits = hex[1]!;
    const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
    return `#${full}`;
  }
  const functional = /^rgba?\(([^)]*)\)$/.exec(input);
  if (functional) {
    const parts = functional[1]!.split(/[,/\s]+/u).filter((part) => part !== '');
    if (parts.length < 3) return undefined;
    const channels = parts.slice(0, 3).map((part) => Number.parseFloat(part));
    if (channels.some((c) => !Number.isFinite(c) || c < 0 || c > 255)) return undefined;
    if (parts.length > 3) {
      const alpha = Number.parseFloat(parts[3]!);
      if (!Number.isFinite(alpha)) return undefined;
      if (alpha === 0) return 'transparent';
      if (alpha < 1) return undefined;
    }
    return `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  }
  return undefined;
}

/** Parses a CSS length into pixels. Returns `undefined` for units this engine cannot resolve. */
export function parseHtmlLength(value: string, baseFontSize: number): number | undefined {
  const match = /^(-?\d*\.?\d+)(px|rem|em|pt|%)?$/.exec(value.trim().toLowerCase());
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1]!);
  if (!Number.isFinite(amount)) return undefined;
  switch (match[2]) {
    case undefined:
    case 'px':
      return amount;
    case 'rem':
    case 'em':
      return amount * baseFontSize;
    case 'pt':
      return (amount * 96) / 72;
    default:
      // Percentages need the containing box, which the caller resolves where it has one.
      return undefined;
  }
}

const LENGTH_PROPERTIES: Readonly<Record<string, 'padding' | 'marginTop' | 'marginBottom'>> = {
  padding: 'padding',
  'padding-top': 'marginTop',
  'padding-bottom': 'marginBottom',
  margin: 'marginTop',
  'margin-top': 'marginTop',
  'margin-bottom': 'marginBottom',
};

/** Extracts the declarations this engine understands from a CSS body or inline style string. */
export function readHtmlDeclarations(css: string, baseFontSize: number): Declaration {
  const declaration: Declaration = {};
  for (const raw of css.split(';')) {
    const colon = raw.indexOf(':');
    if (colon < 0) continue;
    const property = raw.slice(0, colon).trim().toLowerCase();
    const value = raw.slice(colon + 1).trim();
    if (property === '' || value === '') continue;

    switch (property) {
      case 'color': {
        const parsed = parseHtmlColour(value);
        if (parsed) declaration.color = parsed;
        break;
      }
      case 'background':
      case 'background-color': {
        // Strip an accompanying `url(...)` shorthand; images are never fetched.
        const parsed = parseHtmlColour(value.replace(/\s*url\([^)]*\)/giu, '').trim());
        if (parsed) declaration.background = parsed;
        break;
      }
      case 'font-size': {
        const parsed = parseHtmlLength(value, baseFontSize);
        if (parsed !== undefined && parsed > 0 && parsed <= MAX_LINE_HEIGHT)
          declaration.fontSize = parsed;
        break;
      }
      case 'font-weight': {
        const normalized = value.toLowerCase();
        const numeric = Number.parseInt(normalized, 10);
        if (normalized === 'bold' || (Number.isFinite(numeric) && numeric >= 600))
          declaration.bold = true;
        else if (
          normalized === 'normal' ||
          normalized === 'lighter' ||
          (Number.isFinite(numeric) && numeric < 600)
        )
          declaration.bold = false;
        break;
      }
      case 'text-align': {
        const normalized = value.toLowerCase();
        if (normalized === 'left' || normalized === 'center' || normalized === 'right')
          declaration.align = normalized;
        break;
      }
      case 'max-width': {
        const parsed = parseHtmlLength(value, baseFontSize);
        if (parsed !== undefined && parsed > 0) declaration.maxWidth = parsed;
        break;
      }
      default: {
        const target = LENGTH_PROPERTIES[property];
        if (!target) break;
        const parsed = parseHtmlLength(value.split(/\s+/u)[0] ?? '', baseFontSize);
        if (parsed === undefined || parsed < 0) break;
        if (target === 'padding') declaration.padding = Math.min(parsed, 200);
        else {
          declaration.marginTop = parsed;
          declaration.marginBottom = parsed;
        }
        break;
      }
    }
  }
  return declaration;
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  copy: '©',
  reg: '®',
  trade: '™',
  middot: '·',
  bull: '•',
  laquo: '«',
  raquo: '»',
};

/** Decodes numeric and named HTML entities. Unrecognised escapes are left verbatim. */
export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/gu, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const codePoint =
        entity[1] === 'x' || entity[1] === 'X'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
      // A lone surrogate is not a character; keeping the escape is more honest than U+FFFD.
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) return match;
      return String.fromCodePoint(codePoint);
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function readAttributes(source: string): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};
  const pattern =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null)
    attributes[match[1]!.toLowerCase()] = decodeHtmlEntities(
      match[2] ?? match[3] ?? match[4] ?? '',
    );
  return attributes;
}

/** Removes every tag whose contents must not become output text. */
function stripDroppedTags(source: string, seen: Set<string>): string {
  let working = source;
  for (const tag of DROPPED_TAGS) {
    const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'giu');
    if (paired.test(working)) {
      seen.add(tag);
      working = working.replace(paired, '');
    } else {
      const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'giu');
      if (selfClosing.test(working)) {
        seen.add(tag);
        working = working.replace(selfClosing, '');
      }
    }
  }
  return working;
}

/**
 * Parses pasted HTML into styled blocks, dropping what cannot be honoured and reporting it.
 *
 * Nothing is executed or fetched: this is a string walk, so a `<script>` body is discarded
 * rather than run and a remote `<img src>` is never resolved.
 */
export function parseHtmlBlocks(source: string, baseFontSize: number): HtmlParseResult {
  if (source.length > MAX_SOURCE_CHARS)
    throw cardError(
      'dimension-limit',
      `Paste fewer than ${MAX_SOURCE_CHARS.toLocaleString('en-US')} characters of HTML.`,
      `Pasted HTML is ${source.length} characters; the limit is ${MAX_SOURCE_CHARS}.`,
    );

  const warnings: HtmlCardWarning[] = [];
  const dropped = new Set<string>();
  const unsupported = new Set<string>();
  const working = stripDroppedTags(source, dropped);
  for (const tag of dropped)
    if (tag !== 'style' && tag !== 'head' && tag !== 'meta' && tag !== 'link' && tag !== 'title')
      warnings.push({
        feature: tag,
        detail: `<${tag}> content was discarded; it cannot be rendered safely or locally.`,
      });

  // Rules are collected before <style> is stripped, so class and element selectors still apply.
  const rules = new Map<string, Declaration>();
  const rootRules: Declaration[] = [];
  const styleSheets = source.match(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/giu) ?? [];
  for (const sheet of styleSheets) {
    const body = sheet.replace(/^<style\b[^>]*>/iu, '').replace(/<\/style\s*>$/iu, '');
    for (const block of body.match(/[^{}]+\{[^{}]*\}/gu) ?? []) {
      const brace = block.indexOf('{');
      if (brace < 0) continue;
      const selectorText = block.slice(0, brace);
      const declaration = readHtmlDeclarations(
        block.slice(brace + 1, block.lastIndexOf('}')),
        baseFontSize,
      );
      if (Object.keys(declaration).length === 0) continue;
      for (const selector of selectorText.split(',')) {
        const cleaned = selector.trim().toLowerCase();
        if (cleaned === '') continue;
        if (/^(html|body|:root)$/.test(cleaned)) {
          rootRules.push(declaration);
          continue;
        }
        rules.set(cleaned, { ...rules.get(cleaned), ...declaration });
      }
    }
  }

  const bodyMatch = /<body\b([^>]*)>/iu.exec(working);
  const rootDeclaration: Declaration = {
    ...(rootRules[0] ?? {}),
    ...readHtmlDeclarations(bodyMatch?.[1] ?? '', baseFontSize),
  };

  const blocks: HtmlBlock[] = [];
  const openBlocks: HtmlBlock[] = [];
  const styleStack: Declaration[] = [rootDeclaration];
  let currentTag = 'p';
  let currentStyle: Declaration = rootDeclaration;
  let currentText = '';
  let cursor = 0;

  const inherited = (): Declaration => styleStack[styleStack.length - 1] ?? rootDeclaration;

  const startBlock = (tag: string, style: Declaration): void => {
    flushBlock();
    currentTag = tag;
    currentStyle = style;
    currentText = '';
  };

  const flushBlock = (): void => {
    const text = currentText
      .replace(/[ \t\r]+/gu, ' ')
      .replace(/\n{2,}/gu, '\n')
      .trim();
    if (text === '') {
      currentText = '';
      return;
    }
    blocks.push({ tag: currentTag, style: currentStyle, text });
    if (blocks.length > MAX_BLOCKS)
      throw cardError(
        'dimension-limit',
        'Paste a shorter document, or wrap the content in fewer elements.',
        `The document contains more than ${MAX_BLOCKS} non-empty blocks.`,
      );
    currentText = '';
  };

  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/gu;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(working)) !== null) {
    if (match.index > cursor) currentText += decodeHtmlEntities(working.slice(cursor, match.index));
    cursor = tagPattern.lastIndex;

    const closing = match[1] === '/';
    const tag = match[2]!.toLowerCase();
    const attributes = readAttributes(match[3] ?? '');

    if (tag === 'br') {
      currentText += '\n';
      continue;
    }
    if (tag === 'img') {
      unsupported.add('image');
      continue;
    }
    if (tag === 'table' || tag === 'tr' || tag === 'td' || tag === 'th') unsupported.add('table');

    if (BLOCK_TAGS.has(tag)) {
      const style: Declaration = { ...inherited(), ...(rules.get(tag) ?? {}) };
      if (attributes['class'])
        for (const name of attributes['class'].split(/\s+/u).filter((value) => value !== ''))
          Object.assign(style, rules.get(`.${name.toLowerCase()}`) ?? {});
      Object.assign(style, readHtmlDeclarations(attributes['style'] ?? '', baseFontSize));
      if (HEADING_SCALE[tag] !== undefined && style.fontSize === undefined)
        style.fontSize = Math.min(MAX_LINE_HEIGHT, baseFontSize * HEADING_SCALE[tag]!);
      if (closing) {
        if (openBlocks.some((block) => block.tag === tag)) flushBlock();
        continue;
      }
      startBlock(tag, style);
      continue;
    }

    if (!KNOWN_INLINE_TAGS.has(tag)) unsupported.add(tag);
    if (closing) continue;

    const style: Declaration = { ...inherited(), ...(rules.get(tag) ?? {}) };
    if (attributes['class'])
      for (const name of attributes['class'].split(/\s+/u).filter((value) => value !== ''))
        Object.assign(style, rules.get(`.${name.toLowerCase()}`) ?? {});
    Object.assign(style, readHtmlDeclarations(attributes['style'] ?? '', baseFontSize));
    if (tag === 'b' || tag === 'strong') style.bold = true;
    styleStack.push(style);
    void openBlocks;
  }
  if (cursor < working.length) currentText += decodeHtmlEntities(working.slice(cursor));
  flushBlock();

  if (unsupported.has('image'))
    warnings.push({
      feature: 'image',
      detail: 'Images are not fetched or embedded; the output contains text and backgrounds only.',
    });
  if (unsupported.has('table'))
    warnings.push({
      feature: 'table',
      detail: 'Table layout is not implemented; table cells are rendered as separate blocks.',
    });
  const otherTags = [...unsupported].filter(
    (tag) => tag !== 'image' && tag !== 'table' && !KNOWN_INLINE_TAGS.has(tag),
  );
  if (otherTags.length > 0)
    warnings.push({
      feature: 'unknown-elements',
      detail: `Flattened unsupported element(s) to their text content: ${otherTags
        .sort()
        .map((tag) => `<${tag}>`)
        .join(', ')}.`,
    });
  if (
    /\b(?:display\s*:\s*(?:flex|grid|table)|float\s*:|position\s*:\s*(?:absolute|fixed|sticky)|transform\s*:|var\(|@import)/iu.test(
      source,
    )
  )
    warnings.push({
      feature: 'layout',
      detail:
        'Flexbox, grid, floats, absolute positioning, transforms, CSS variables, and @import are not implemented; everything is laid out as one column.',
    });
  if (/@font-face|font-family\s*:\s*(?!inherit|initial)/iu.test(source))
    warnings.push({
      feature: 'font',
      detail: 'Only the local default font is used; web fonts are never downloaded.',
    });

  return { blocks, warnings };
}

/** One laid-out line: the words on it and the style that applies to each word. */
interface StyledWord {
  readonly text: string;
  readonly style: Declaration;
}

/**
 * Lays blocks out into background boxes and positioned text runs.
 *
 * `measureText` is injected so this module stays DOM-free: the browser passes a canvas
 * measurer for real metrics, and a Node test passes a deterministic one.
 */
export function layoutHtmlCard(
  blocks: readonly HtmlBlock[],
  options: HtmlCardOptions,
  measureText: (text: string, sizePx: number, bold: boolean) => number,
): HtmlCardLayout {
  const width = Math.max(64, Math.min(4096, Math.round(options.width)));
  const padding = Math.max(0, Math.min(256, Math.round(options.padding)));
  const baseFontSize = Math.max(6, Math.min(200, Math.round(options.fontSize)));
  const columnWidth = width - padding * 2;
  if (columnWidth < 16)
    throw cardError(
      'unsupported-format',
      'Reduce the padding or widen the output so at least 16 pixels remain for the text column.',
    );

  const boxes: HtmlCardBox[] = [];
  const runs: HtmlTextRun[] = [];
  let y = padding;

  for (const block of blocks) {
    const style = block.style;
    const baseSize = Math.max(
      MIN_LINE_HEIGHT,
      Math.min(MAX_LINE_HEIGHT, Math.round(style.fontSize ?? baseFontSize)),
    );
    const baseBold = style.bold === true;
    const align: TextAlign = style.align ?? 'left';
    const innerPadding = Math.max(0, Math.min(style.padding ?? 0, Math.floor(columnWidth / 2)));
    const textWidth = Math.max(
      16,
      Math.min(columnWidth - innerPadding * 2, style.maxWidth ?? Number.POSITIVE_INFINITY),
    );
    // Wrapping uses the largest style present in the block so a heading's larger glyphs are
    // measured against the width they actually need.
    const runSize = (word: StyledWord): number =>
      Math.max(
        MIN_LINE_HEIGHT,
        Math.min(MAX_LINE_HEIGHT, Math.round(word.style.fontSize ?? baseSize)),
      );
    const runBold = (word: StyledWord): boolean => word.style.bold ?? baseBold;
    const runColour = (word: StyledWord): string =>
      word.style.color && word.style.color !== 'transparent' ? word.style.color : options.color;

    const words: StyledWord[] = [];
    for (const [index, paragraph] of block.text.split('\n').entries()) {
      if (index > 0) words.push({ text: '\n', style });
      for (const token of paragraph.split(' ')) {
        if (token !== '') words.push({ text: token, style });
      }
    }
    if (words.length === 0) continue;

    // Greedy wrap, with an explicit break marker for <br> and source newlines.
    const lines: StyledWord[][] = [[]];
    let currentWidth = 0;
    for (const word of words) {
      if (word.text === '\n') {
        lines.push([]);
        currentWidth = 0;
        continue;
      }
      const wordWidth = measureText(word.text, runSize(word), runBold(word));
      if (
        currentWidth > 0 &&
        currentWidth + measureText(' ', runSize(word), runBold(word)) + wordWidth > textWidth
      ) {
        lines.push([]);
        currentWidth = 0;
      }
      lines[lines.length - 1]!.push(word);
      currentWidth += wordWidth + measureText(' ', runSize(word), runBold(word));
    }
    const usedLines = lines.filter((line) => line.length > 0);
    if (usedLines.length === 0) continue;

    const lineHeight = Math.max(
      MIN_LINE_HEIGHT,
      Math.round(Math.max(...usedLines.map((line) => Math.max(...line.map(runSize)))) * 1.35),
    );
    const marginTop = Math.max(0, style.marginTop ?? 0);
    const marginBottom = Math.max(0, style.marginBottom ?? 0);
    const blockTop = y + marginTop;
    const blockHeight = innerPadding * 2 + usedLines.length * lineHeight;

    if (style.background && style.background !== 'transparent')
      boxes.push({
        x: padding,
        y: blockTop,
        width: columnWidth,
        height: blockHeight,
        background: style.background,
      });

    for (const [lineIndex, line] of lines.entries()) {
      if (line.length === 0) continue;
      const pieces = line.map((word, wordIndex) => ({
        word,
        width: measureText(word.text, runSize(word), runBold(word)),
        // Leading spaces are dropped by the split above; interior ones need measuring.
        space: measureText(' ', runSize(word), runBold(word)),
        offset:
          wordIndex === 0
            ? 0
            : measureText(' ', runSize(line[wordIndex - 1]!), runBold(line[wordIndex - 1]!)),
      }));
      const totalWidth =
        pieces.reduce((sum, piece) => sum + piece.width + piece.offset, 0) -
        (pieces[pieces.length - 1]?.offset ?? 0);
      const startX =
        align === 'center'
          ? padding + innerPadding + Math.max(0, (textWidth - totalWidth) / 2)
          : align === 'right'
            ? padding + innerPadding + Math.max(0, textWidth - totalWidth)
            : padding + innerPadding;

      let cursorX = startX;
      for (const piece of pieces) {
        cursorX += piece.offset;
        runs.push({
          x: Math.round(cursorX),
          y:
            blockTop +
            innerPadding +
            lineIndex * lineHeight +
            Math.round(runSize(piece.word) * 0.92),
          text: piece.word.text,
          color: runColour(piece.word),
          sizePx: runSize(piece.word),
          bold: runBold(piece.word),
        });
        cursorX += piece.width;
      }
    }

    y = blockTop + blockHeight + marginBottom;
  }

  return {
    width,
    height: Math.min(16384, Math.max(64, Math.round(y) + padding)),
    background: options.background,
    boxes,
    runs,
  };
}

/**
 * Paints a layout's backgrounds into a fresh RGBA buffer.
 *
 * Text is not drawn here: glyph rasterization needs a font, so the caller draws the runs and
 * this module's job is to produce the deterministic pixel ground they sit on.
 */
export function paintHtmlCardBackground(layout: HtmlCardLayout): Uint8ClampedArray {
  const data = new Uint8ClampedArray(layout.width * layout.height * 4);
  const base = parseHtmlColour(layout.background);
  if (base && base !== 'transparent') {
    const channels = [
      Number.parseInt(base.slice(1, 3), 16),
      Number.parseInt(base.slice(3, 5), 16),
      Number.parseInt(base.slice(5, 7), 16),
    ];
    for (let offset = 0; offset < data.length; offset += 4) {
      data[offset] = channels[0]!;
      data[offset + 1] = channels[1]!;
      data[offset + 2] = channels[2]!;
      data[offset + 3] = 255;
    }
  }
  for (const box of layout.boxes) {
    const colour = parseHtmlColour(box.background);
    if (!colour || colour === 'transparent') continue;
    const rgb = [
      Number.parseInt(colour.slice(1, 3), 16),
      Number.parseInt(colour.slice(3, 5), 16),
      Number.parseInt(colour.slice(5, 7), 16),
    ];
    for (let row = 0; row < box.height; row += 1) {
      const pixelY = box.y + row;
      if (pixelY < 0 || pixelY >= layout.height) continue;
      for (let column = 0; column < box.width; column += 1) {
        const pixelX = box.x + column;
        if (pixelX < 0 || pixelX >= layout.width) continue;
        const offset = (pixelY * layout.width + pixelX) * 4;
        data[offset] = rgb[0]!;
        data[offset + 1] = rgb[1]!;
        data[offset + 2] = rgb[2]!;
        data[offset + 3] = 255;
      }
    }
  }
  return data;
}

/** Wraps painted pixels into a single-frame raster. */
export function htmlCardRaster(layout: HtmlCardLayout, data: Uint8ClampedArray): RasterImage {
  return {
    width: layout.width,
    height: layout.height,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

/** The route's no-op defaults: the same geometry the previous shell hard-coded. */
export const HTML_CARD_DEFAULT_OPTIONS: HtmlCardOptions = {
  width: 1200,
  padding: 64,
  fontSize: 18,
  background: '#ffffff',
  color: '#1c1a17',
};

/** Output-area ceiling, mirroring the GIF encoder's own pixel guard. */
export const HTML_CARD_MAX_PIXELS = 16_000_000;
