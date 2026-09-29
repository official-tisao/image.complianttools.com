/**
 * Ambient declarations for the platform globals the deployment templates use.
 *
 * These are deliberately hand-written and minimal rather than pulled from `@cloudflare/workers-types`
 * or a Deno type package. Two reasons:
 *
 * 1. A new `@types/*` dependency would need an entry in the README §25.3.4 shipping register and a
 *    lockfile change, and `verify:licenses` gates the build on both. A type-only declaration file
 *    carries no runtime code and no supply-chain surface, which is the property we want for a
 *    security component.
 * 2. Each template declares only the one global it actually touches, so a template that starts
 *    using a *new* platform API fails to compile rather than compiling against a large surface we
 *    never reviewed.
 *
 * `apps/relay/tsconfig.templates.json` includes this file. It is not part of the Worker build.
 */

/** Deno Deploy and Netlify Edge both run on Deno and expose the same two members we use. */
declare const Deno: {
  env: {
    /** Returns `undefined` for an unset variable, which is how "no token configured" is expressed. */
    get(key: string): string | undefined;
  };
  /** Deno Deploy's entry point. Netlify Edge instead calls the default export per request. */
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
