import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

import { renderLicensesPage } from './licenses-page.mjs';

const host = '127.0.0.1';
const port = Number.parseInt(process.env.PORT ?? '4173', 10);
const licencesPage = renderLicensesPage(
  await readFile(new URL('../../docs/THIRD-PARTY-LICENSES.md', import.meta.url), 'utf8'),
);

const capabilityPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Runtime capabilities</title></head>
  <body><main><h1>Runtime capabilities</h1><dl id="capabilities"></dl></main>
  <script type="module">
    const values = {
      wasm: typeof WebAssembly === 'object',
      wasmThreads: crossOriginIsolated && typeof SharedArrayBuffer === 'function',
      webGpu: 'gpu' in navigator,
      webGl2: document.createElement('canvas').getContext('webgl2') !== null,
      offscreenCanvas: typeof OffscreenCanvas === 'function',
      fileSystemAccess: 'showOpenFilePicker' in globalThis,
      opfs: typeof navigator.storage?.getDirectory === 'function',
      webCodecs: 'VideoFrame' in globalThis || 'ImageDecoder' in globalThis,
    };
    const list = document.querySelector('#capabilities');
    for (const [name, available] of Object.entries(values)) {
      const term = document.createElement('dt'); term.textContent = name;
      const detail = document.createElement('dd'); detail.textContent = available ? 'available' : 'unavailable';
      list.append(term, detail);
    }
  </script></body>
</html>`;

const server = createServer((request, response) => {
  if (request.url === '/licenses' || request.url === '/licenses/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(licencesPage);
    return;
  }
  if (request.url === '/debug/capabilities' || request.url === '/debug/capabilities/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(capabilityPage);
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, host, () => console.log(`Web development service: http://${host}:${port}`));
