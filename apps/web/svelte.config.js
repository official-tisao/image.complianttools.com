import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined, precompress: true }),
    inlineStyleThreshold: Infinity,
    output: { preloadStrategy: 'preload-mjs' },
    // Let SvelteKit hash the generated hydration script and inline styles in
    // prerendered pages. A hand-written CSP cannot authorize those hashes and
    // leaves static pages rendered but permanently unhydrated.
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['none'],
        'script-src': ['self', 'wasm-unsafe-eval'],
        'style-src': ['self'],
        'img-src': ['self', 'data:', 'blob:'],
        'font-src': ['self'],
        'connect-src': [
          'self',
          'blob:',
          'https://cdn.jsdelivr.net',
          'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/script/Latin.traineddata',
        ],
        'worker-src': ['self', 'blob:', 'data:'],
        'child-src': ['self', 'blob:', 'data:'],
        'manifest-src': ['self'],
        'form-action': ['none'],
        'frame-ancestors': ['none'],
        'base-uri': ['none'],
        'object-src': ['none'],
        // Keep the approved policy names available for code that opts in to
        // Trusted Types. Global enforcement is deferred until worker bundles
        // no longer rely on dynamic Function constructors.
        'trusted-types': ['ctimg-default', 'svelte-trusted-html'],
      },
    },
  },
};
