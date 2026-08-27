import { describe, expect, it } from 'vitest';

import { assertSafeSvg, SVG_EXTERNAL_REFERENCE_MESSAGE } from '../src/index.js';

describe('SVG local-processing safety', () => {
  it('allows a self-contained SVG', () => {
    expect(
      assertSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'),
    ).toContain('<rect');
  });

  it('refuses external references and active embedded documents', () => {
    expect(() => assertSafeSvg('<svg><image href="https://example.com/image.png"/></svg>')).toThrow(
      SVG_EXTERNAL_REFERENCE_MESSAGE,
    );
    expect(() => assertSafeSvg('<svg><script>alert(1)</script></svg>')).toThrow('scripts');
  });
});
