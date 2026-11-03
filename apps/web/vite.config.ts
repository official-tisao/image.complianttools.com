import { resolve } from 'node:path';

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

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

export default defineConfig(({ command, mode }) => {
  const fileEnv = loadEnv(mode, __dirname, '');
  return {
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
    // This is a public OAuth client identifier, not a secret. Define it at build/dev startup so the
    // static frontend can opt into user-owned Cloudflare setup without a server-side env endpoint.
    define: {
      'import.meta.env.PUBLIC_CLOUDFLARE_OAUTH_CLIENT_ID': JSON.stringify(
        process.env.PUBLIC_CLOUDFLARE_OAUTH_CLIENT_ID ??
          fileEnv.PUBLIC_CLOUDFLARE_OAUTH_CLIENT_ID ??
          '',
      ),
    },
    // Keep JSquash modules out of Vite's dependency prebundle. Their WASM loaders resolve a
    // sibling `.wasm` URL relative to `import.meta.url`; the optimized module lives under
    // `node_modules/.vite/deps`, where that sibling is not emitted and the dev server returns 404.
    optimizeDeps: {
      exclude: [
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
    },
    preview: { headers: isolationHeaders },
    worker: mode === 'development' ? {} : { format: 'es' },
    build: { target: 'es2022', sourcemap: true },
  };
});
