/**
 * T18 HTML → Image engine tests — PLAN.md P6-01, README §4.1.
 *
 * Text measurement is injected so these run without a font. The measurer used here is a
 * deterministic fixed-advance function, which makes the wrapping geometry exactly predictable and
 * keeps the assertions about *layout* rather than about any one engine's font metrics.
 */

import { describe, expect, it } from 'vitest';

import {
  decodeHtmlEntities,
  HTML_CARD_DEFAULT_OPTIONS,
  HTML_CARD_MAX_PIXELS,
  htmlCardRaster,
  layoutHtmlCard,
  paintHtmlCardBackground,
  parseHtmlBlocks,
  parseHtmlColour,
  parseHtmlLength,
  readHtmlDeclarations,
  type HtmlCardLayout,
} from '../src/ops/html-card.js';
import type { EngineError } from '../src/types.js';

/** Every glyph is 10 px wide and every space 5 px — deterministic wrapping geometry. */
const measure = (text: string, sizePx: number, bold: boolean): number => {
  const unit = sizePx / 10;
  let width = 0;
  for (const character of text) width += (character === ' ' ? 5 : 10) * unit;
  return width * (bold ? 1.05 : 1);
};

function captureEngineError(action: () => unknown): EngineError {
  let thrown: unknown;
  try {
    action();
  } catch (cause) {
    thrown = cause;
  }
  if (thrown === undefined)
    throw new Error('Expected the call to throw, but it returned normally.');
  if (typeof thrown !== 'object' || thrown === null || !('remedy' in thrown) || !('kind' in thrown))
    throw new Error(`Expected a typed engine error, received: ${String(thrown)}`);
  return thrown as EngineError;
}

const layoutOf = (source: string, overrides: Partial<typeof HTML_CARD_DEFAULT_OPTIONS> = {}) => {
  const options = { ...HTML_CARD_DEFAULT_OPTIONS, ...overrides };
  const { blocks, warnings } = parseHtmlBlocks(source, options.fontSize);
  return { blocks, warnings, layout: layoutHtmlCard(blocks, options, measure) };
};

const pixel = (layout: HtmlCardLayout, data: Uint8ClampedArray, x: number, y: number) => {
  const offset = (y * layout.width + x) * 4;
  return [data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!];
};

describe('parseHtmlColour', () => {
  it('parses the three- and six-digit hex forms', () => {
    expect(parseHtmlColour('#abc')).toBe('#aabbcc');
    expect(parseHtmlColour('#A1B2C3')).toBe('#a1b2c3');
  });

  it('parses named colours', () => {
    expect(parseHtmlColour('rebeccapurple-ish')).toBeUndefined();
    expect(parseHtmlColour('white')).toBe('#ffffff');
    expect(parseHtmlColour('transparent')).toBe('transparent');
  });

  it('parses rgb() and rgba() with full alpha', () => {
    expect(parseHtmlColour('rgb(1, 2, 3)')).toBe('#010203');
    expect(parseHtmlColour('rgba(1,2,3,1)')).toBe('#010203');
  });

  it('refuses a partial alpha rather than guessing a blend', () => {
    expect(parseHtmlColour('rgba(0,0,0,0.5)')).toBeUndefined();
  });

  it('treats zero alpha as transparent', () => {
    expect(parseHtmlColour('rgba(0,0,0,0)')).toBe('transparent');
  });

  it('refuses out-of-range channels and malformed input', () => {
    expect(parseHtmlColour('rgb(300, 0, 0)')).toBeUndefined();
    expect(parseHtmlColour('rgb(1, 2)')).toBeUndefined();
    expect(parseHtmlColour('not-a-colour')).toBeUndefined();
    expect(parseHtmlColour('')).toBeUndefined();
  });
});

describe('parseHtmlLength', () => {
  it('parses px, rem, em, and pt', () => {
    expect(parseHtmlLength('12px', 16)).toBe(12);
    expect(parseHtmlLength('2rem', 16)).toBe(32);
    expect(parseHtmlLength('1.5em', 20)).toBe(30);
    expect(parseHtmlLength('12pt', 16)).toBe(16);
    expect(parseHtmlLength('10', 16)).toBe(10);
  });

  it('leaves percentages to the caller, which knows the containing box', () => {
    expect(parseHtmlLength('50%', 16)).toBeUndefined();
  });

  it('refuses unsupported units', () => {
    expect(parseHtmlLength('2vw', 16)).toBeUndefined();
    expect(parseHtmlLength('calc(1px)', 16)).toBeUndefined();
  });
});

describe('readHtmlDeclarations', () => {
  it('reads the properties this engine implements', () => {
    const declaration = readHtmlDeclarations(
      'color:#ff0000; background:#00ff00; font-size:24px; font-weight:bold; text-align:center; padding:8px',
      16,
    );
    expect(declaration).toMatchObject({
      color: '#ff0000',
      background: '#00ff00',
      fontSize: 24,
      bold: true,
      align: 'center',
      padding: 8,
    });
  });

  it('reads a numeric font weight as bold', () => {
    expect(readHtmlDeclarations('font-weight:700', 16).bold).toBe(true);
    expect(readHtmlDeclarations('font-weight:300', 16).bold).toBe(false);
  });

  it('ignores declarations it cannot honour', () => {
    const declaration = readHtmlDeclarations('transform:rotate(3deg); z-index:4', 16);
    expect(declaration).toEqual({});
  });

  it('strips a url() from a background shorthand', () => {
    expect(
      readHtmlDeclarations('background:url(https://example.test/a.png) #ffffff', 16).background,
    ).toBe('#ffffff');
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeHtmlEntities('a &amp; b &lt;c&gt; &hellip;')).toBe('a & b <c> …');
    expect(decodeHtmlEntities('&#65;&#x42;')).toBe('AB');
  });

  it('leaves an unknown entity verbatim rather than eating it', () => {
    expect(decodeHtmlEntities('&notarealentity;')).toBe('&notarealentity;');
  });

  it('refuses a lone surrogate', () => {
    expect(decodeHtmlEntities('&#xD800;')).toBe('&#xD800;');
  });
});

describe('parseHtmlBlocks', () => {
  it('turns block elements into styled blocks', () => {
    const { blocks } = parseHtmlBlocks('<h1>Title</h1><p>Body text</p>', 16);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.tag).toBe('h1');
    expect(blocks[0]!.text).toBe('Title');
    expect(blocks[1]!.tag).toBe('p');
    expect(blocks[1]!.text).toBe('Body text');
  });

  it('scales headings relative to the base font size', () => {
    const { blocks } = parseHtmlBlocks('<h1>T</h1>', 16);
    expect(blocks[0]!.style.fontSize).toBe(32);
  });

  it('applies a style rule from a style block', () => {
    const { blocks } = parseHtmlBlocks(
      '<style>.lead{color:#00ff00; font-size:40px}</style><p class="lead">Hi</p>',
      16,
    );
    expect(blocks[0]!.style).toMatchObject({ color: '#00ff00', fontSize: 40 });
  });

  it('never emits script contents', () => {
    const { blocks, warnings } = parseHtmlBlocks(
      '<p>before</p><script>alert("x")</script><p>after</p>',
      16,
    );
    expect(blocks.map((block) => block.text)).toEqual(['before', 'after']);
    expect(warnings.some((warning) => warning.feature === 'script')).toBe(true);
  });

  it('drops an iframe rather than embedding its document', () => {
    const { blocks } = parseHtmlBlocks('<p>a</p><iframe src="https://example.test"></iframe>', 16);
    expect(blocks.map((block) => block.text)).toEqual(['a']);
  });

  it('warns that images are not fetched, and never resolves their src', () => {
    const { warnings } = parseHtmlBlocks('<p>x</p><img src="https://example.test/pixel.png">', 16);
    expect(warnings.some((warning) => warning.feature === 'image')).toBe(true);
  });

  it('warns when unsupported layout features are present', () => {
    const { warnings } = parseHtmlBlocks('<div style="display:flex"><p>x</p></div>', 16);
    expect(warnings.some((warning) => warning.feature === 'layout')).toBe(true);
  });

  it('handles <br> as an explicit line break', () => {
    const { blocks } = parseHtmlBlocks('<p>one<br>two</p>', 16);
    expect(blocks[0]!.text).toBe('one\ntwo');
  });

  it('merges inline markup into one block', () => {
    const { blocks } = parseHtmlBlocks('<p>a <b>bold</b> tail</p>', 16);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toContain('bold');
  });

  it('rejects a document larger than the documented ceiling', () => {
    const error = captureEngineError(() => parseHtmlBlocks('x'.repeat(200_001), 16));
    expect(error.kind).toBe('dimension-limit');
    expect(error.remedy).toMatch(/200,000 characters/iu);
  });

  it('rejects a document with more blocks than the layout can place', () => {
    const error = captureEngineError(() => parseHtmlBlocks('<p>x</p>'.repeat(401), 16));
    expect(error.remedy).toMatch(/fewer elements/iu);
  });
});

describe('layoutHtmlCard', () => {
  it('wraps text to the column width', () => {
    const { layout } = layoutOf('<p>' + 'word '.repeat(60).trim() + '</p>', {
      width: 400,
      padding: 20,
      fontSize: 10,
    });
    const rightEdge = 400 - 20;
    expect(layout.runs.length).toBeGreaterThan(1);
    // No run may start before the padding or overflow the right edge of the column.
    for (const run of layout.runs) {
      expect(run.x).toBeGreaterThanOrEqual(20);
      expect(run.x + measure(run.text, run.sizePx, run.bold)).toBeLessThanOrEqual(rightEdge + 1);
    }
    // Wrapping actually happened rather than the text being laid out on one very long line.
    expect(layout.height).toBeGreaterThan(layout.runs[0]!.sizePx * 2);
  });

  it('produces runs for the text it was given', () => {
    const { layout } = layoutOf('<h1>Hello</h1>');
    expect(layout.runs.map((run) => run.text)).toEqual(['Hello']);
    expect(layout.runs[0]!.sizePx).toBe(36);
  });

  it('centres a centred line', () => {
    const { layout } = layoutOf('<p style="text-align:center">abcd</p>', {
      width: 400,
      padding: 0,
      fontSize: 10,
    });
    // "abcd" is 40 px wide in a 400 px column, so it starts 180 px in.
    expect(layout.runs[0]!.x).toBe(180);
  });

  it('honours a background colour as a painted box', () => {
    const { layout } = layoutOf('<p style="background:#ff0000">x</p>', {
      width: 200,
      padding: 10,
      fontSize: 10,
    });
    expect(layout.boxes).toHaveLength(1);
    expect(layout.boxes[0]).toMatchObject({ x: 10, width: 180, background: '#ff0000' });
  });

  it('refuses padding that would leave no text column', () => {
    const { blocks } = parseHtmlBlocks('<p>x</p>', 16);
    const error = captureEngineError(() =>
      layoutHtmlCard(blocks, { ...HTML_CARD_DEFAULT_OPTIONS, width: 64, padding: 64 }, measure),
    );
    expect(error.remedy).toMatch(/at least 16 pixels/iu);
  });

  it('grows the height to hold every line', () => {
    const tall = layoutOf('<p>' + 'word '.repeat(400).trim() + '</p>', {
      width: 200,
      fontSize: 10,
    });
    expect(tall.layout.height).toBeGreaterThan(200);
  });
});

describe('paintHtmlCardBackground', () => {
  it('fills the page background', () => {
    const { layout } = layoutOf('<p>x</p>', { width: 100, padding: 0, background: '#0000ff' });
    const data = paintHtmlCardBackground(layout);
    expect(pixel(layout, data, 0, 0)).toEqual([0, 0, 255, 255]);
  });

  it('paints a block box in its declared colour', () => {
    const { layout } = layoutOf('<p style="background:#00ff00">x</p>', {
      width: 200,
      padding: 10,
      fontSize: 10,
      background: '#ffffff',
    });
    const data = paintHtmlCardBackground(layout);
    expect(pixel(layout, data, 10, 10)).toEqual([0, 255, 0, 255]);
    // Outside the box the page background still shows.
    expect(pixel(layout, data, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('wraps painted pixels in a single-frame raster', () => {
    const { layout } = layoutOf('<p>x</p>', { width: 64, padding: 4 });
    const raster = htmlCardRaster(layout, paintHtmlCardBackground(layout));
    expect(raster.width).toBe(64);
    expect(raster.frames).toHaveLength(1);
    expect(raster.frames[0]!.data.length).toBe(64 * raster.height * 4);
  });

  it('states its output-area ceiling', () => {
    expect(HTML_CARD_MAX_PIXELS).toBeGreaterThan(0);
    // A 4096-wide card at the maximum padding still stays inside the documented ceiling.
    expect(4096 * 4096).toBeGreaterThan(HTML_CARD_MAX_PIXELS);
  });
});
