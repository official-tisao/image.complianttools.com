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

export default defineConfig({
  plugins: [
    {
      name: 'preview-security-headers',
      configurePreviewServer(server) {
        server.middlewares.use((_request, response, next) => {
          for (const [name, value] of Object.entries(isolationHeaders)) {
            response.setHeader(name, value);
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
