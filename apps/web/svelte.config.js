import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined, precompress: true }),
    inlineStyleThreshold: Infinity,
    output: { preloadStrategy: 'preload-mjs' },
  },
};
