import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined, precompress: true }),
    inlineStyleThreshold: Infinity,
    output: { preloadStrategy: 'preload-mjs' },
    prerender: { handleMissingId: 'ignore' },
    // Let SvelteKit hash the generated hydration script and inline styles in
    // prerendered pages. A hand-written CSP cannot authorize those hashes and
    // leaves static pages rendered but permanently unhydrated.
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['none'],
        'script-src': ['self', 'wasm-unsafe-eval', 'unsafe-eval'],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'blob:'],
        // GIF video exports are created as in-memory blob URLs and verified in a
        // local <video> element before the download is considered usable.
        'media-src': ['self', 'blob:'],
        'font-src': ['self'],
        'connect-src': [
          'self',
          'blob:',
          // Model delivery is opt-in and each downloaded model is checked against its
          // pinned byte length and SHA-256 before use. Keep the host configurable so a
          // deployment can use its own static origin or the project default without
          // rebuilding the application for every host choice.
          'https:',
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
        'trusted-types': ['ctimg-default', 'svelte-trusted-html', 'default'],
        'require-trusted-types-for': ["'script'"],
      },
    },
  },
};
