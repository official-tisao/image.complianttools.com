import { resolve } from 'node:path';

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const repositoryRoot = resolve(__dirname, '../..');
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()',
};
const immutableOcrRuntimeCache = 'public, max-age=31536000, immutable';
const versionedOcrRuntimePath = /^\/ocr-runtime\/v\d+\.\d+\.\d+\//u;

export default defineConfig(({ command, mode }) => ({
  plugins: [
    {
      name: 'preview-security-headers',
      configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
          for (const [name, value] of Object.entries(isolationHeaders)) {
            response.setHeader(name, value);
          }
          const pathname = request.url?.split('?')[0] ?? '';
          if (versionedOcrRuntimePath.test(pathname)) {
            // Mirror the versioned production `_headers` rule in local preview.
            response.setHeader('Cache-Control', immutableOcrRuntimeCache);
          }
          next();
        });
      },
    },
    sveltekit(),
  ],
  // Keep JSquash modules out of Vite's dependency prebundle. Their WASM loaders resolve a
  // sibling `.wasm` URL relative to `import.meta.url`; the optimized module lives under
  // `node_modules/.vite/deps`, where that sibling is not emitted and the dev server returns 404.
  optimizeDeps: {
    exclude: [
      // @jsquash/avif and @jsquash/jxl both load their sibling `*.wasm` via `import.meta.url`.
      // Prebundling these packages turns those fetches into `/node_modules/.vite/deps/*.wasm`,
      // where the wasm binary is not emitted — Vite's dev server returns 404 HTML, and the
      // production worker chunks reference a DASH variant (`avif_dec-B7YOdlSS.wasm`) that
      // adapter-static never copies to assets, so even the correctly-named build asset 404s on
      // adapter-static preview. Exclude them from the dep prebundle so each package keeps its
      // own code, and adapter-static emits + copies both the module and its sibling wasm.
      '@jsquash/avif',
      '@jsquash/jxl',
      // @jsquash/jpeg / @jsquash/png / @jsquash/webp / @jsquash/oxipng preserve WASM sibling
      // URLs relative to import.meta.url too; see https://github.com/jsquash/jsquash issue #26.
      // Exclude them to prevent the same 404-on-WASM-sibling issue in development.
      '@jsquash/jpeg',
      '@jsquash/png',
      '@jsquash/webp',
      '@jsquash/oxipng',
      // ONNX Runtime Web uses import.meta.url to locate its sibling `ort-wasm-*.wasm` files.
      // Vite's optimized deps directory does not contain those siblings, so prebundling turns
      // an explicit Tier 2 model run into a browser 404 before inference can start.
      'onnxruntime-web',
    ],
  },
  server: {
    fs: { allow: [repositoryRoot] },
    headers: command === 'serve' ? isolationHeaders : {},
    proxy: {
      '/api/feedback': {
        target: 'https://feedback.complianttools.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.proxyTimeout = 15000;
          proxy.onError = (err, req, res) => {
            console.error('API proxy error:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('API proxy error');
          };
        },
      },
    },
  },
  preview: { headers: isolationHeaders },
  worker: mode === 'development' ? {} : { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        'encode-worker': resolve(__dirname, 'src/workers/encode-worker.ts'),
        'format-encode-worker': resolve(__dirname, 'src/workers/format-encode-worker.ts'),
      },
    },
  },
}));
