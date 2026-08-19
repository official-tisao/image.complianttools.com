import { parentPort } from 'node:worker_threads';

import { createRaster, run } from '../dist/index.js';

parentPort.on('message', async ({ recipe }) => {
  const progress = [];
  const input = createRaster(
    4,
    3,
    new Uint8ClampedArray(4 * 3 * 4).map((_, index) => index % 256),
  );
  const result = await run(recipe, [input], { onProgress: (event) => progress.push(event) });
  parentPort.postMessage({
    progress,
    width: result.items[0].image.width,
    height: result.items[0].image.height,
  });
});
