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
        'upgrade-insecure-requests': true,
        'require-trusted-types-for': ['script'],
        // 'unsafe-inline' lets `new Worker(new URL('./x.worker.ts', import.meta.url))`
        // pass a plain string. Wrapping the URL in createScriptURL() instead makes
        // the specifier opaque to Vite, which then inlines the worker as a data:
        // URL that worker-src blocks. ctimg-default is kept for explicit callers.
        'trusted-types': ['ctimg-default', 'svelte-trusted-html', "'unsafe-inline'"],
      },
    },
  },
};
