import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined, precompress: true }),
    inlineStyleThreshold: Infinity,
    output: { preloadStrategy: 'preload-mjs' },
    // SvelteKit emits a per-page <meta http-equiv="Content-Security-Policy">
    // containing sha256 hashes for its inline bootstrap script, which
    // script-src 'self' alone would otherwise block (breaking hydration).
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['none'],
        'script-src': ['self', 'wasm-unsafe-eval'],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'blob:'],
        'font-src': ['self'],
        'connect-src': [
          'self',
          'blob:',
          'https://cdn.jsdelivr.net',
          'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/script/Latin.traineddata',
        ],
        'worker-src': ['self', 'blob:'],
        'child-src': ['self', 'blob:'],
        'manifest-src': ['self'],
        'form-action': ['none'],
        'base-uri': ['none'],
        'object-src': ['none'],
        // Keep upgrade-insecure-requests on the production `_headers` policy.
        // SvelteKit also emits this policy as a per-page meta tag, which makes
        // the HTTP Playwright preview upgrade its local module URLs to HTTPS;
        // WebKit then rejects them because the test server has no TLS.
        'require-trusted-types-for': ['script'],
        'trusted-types': ['ctimg-default', 'svelte-trusted-html', 'default'],
      },
    },
  },
};
