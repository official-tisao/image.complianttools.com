import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
    exclude: ['@jsquash/jpeg', '@jsquash/png', '@jsquash/webp', '@jsquash/oxipng'],
  },
  server: { headers: command === 'serve' ? isolationHeaders : {} },
  preview: { headers: isolationHeaders },
  worker: mode === 'development' ? {} : { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
}));
