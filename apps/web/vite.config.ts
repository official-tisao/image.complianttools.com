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

export default defineConfig({
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
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
});
