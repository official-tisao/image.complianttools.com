import type { BrowserContext } from '@playwright/test';

const EVERY_REQUEST = '**/*';
const LOCAL_ORIGIN = 'http://127.0.0.1:4173';

/**
 * Deny the page every request that would leave this machine, proving a tool completes without any
 * external network.
 *
 * Two deliberate choices here.
 *
 * We intercept and abort rather than calling `context.setOffline(true)`, because WebKit routes
 * `File`/`Blob` reads through the same machinery as network I/O: with offline mode enabled,
 * `setInputFiles` followed by a local read fails with "The I/O read operation failed" even though
 * nothing left the machine.
 *
 * We allow same-origin requests through. Offline mode still serves same-origin assets from the HTTP
 * cache, whereas a route abort bypasses the cache entirely and kills lazily-fetched local workers
 * and WASM -- which is a harness artefact, not a product failure. What these tests are actually
 * asserting is README P2/P6: no pixels leave the device and no third-party origin is required. That
 * is precisely "no cross-origin request", and it is what we block. Full loss-of-connectivity,
 * including the origin itself, stays covered by the dedicated `no-network.spec.ts` harness.
 */
export async function denyAllNetwork(context: BrowserContext): Promise<void> {
  await context.route(EVERY_REQUEST, (route) => {
    const isLocal = new URL(route.request().url()).origin === LOCAL_ORIGIN;
    return isLocal ? route.continue() : route.abort('internetdisconnected');
  });
}

/** Restore outbound connectivity after a `denyAllNetwork` block. */
export async function allowAllNetwork(context: BrowserContext): Promise<void> {
  await context.unroute(EVERY_REQUEST);
}
