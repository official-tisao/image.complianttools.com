/**
 * P5-17 — the engine types this job needs, as a structural mirror.
 *
 * Root scripts cannot import `@complianttools/image-engine`: the workspace link lives under
 * `apps/web/node_modules`, and the root `tsconfig.json` compiles the `scripts` directory with
 * `types: ["node"]` and no path mapping. The gate scripts here have always solved this by
 * dynamically importing the built `dist/` at run time — `check-register-completeness.ts` does exactly
 * that for the adapter registry — so this file follows that convention rather than inventing a second
 * one.
 *
 * The mirror exists so the pure parts of the job (diffing, classification, reporting, spend
 * accounting) can be unit-tested without a build. Two things keep it from becoming a second source of
 * truth:
 *
 * 1. It is **structural and one-directional**: each field below is a subset of the real
 *    `ModelDescriptor`, so an adapter's actual descriptors satisfy it without a cast.
 * 2. `test-provider-contract-gate.ts` asserts assignability against the engine's real exported type,
 *    so if a field changes shape there, that test fails rather than the drift going unnoticed.
 *
 * It is not a general-purpose re-export. Anything the job does not need is deliberately absent.
 */

/** A model as the job sees it. A subset of the engine's `ModelDescriptor`. */
export interface ModelDescriptor {
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly string[];
  readonly notes?: string;
}

/** A credential field on a provider descriptor. */
export interface CredentialField {
  readonly key: string;
  readonly label: string;
  readonly placeholder: string;
  readonly secret: boolean;
  readonly required: boolean;
}

/**
 * A provider descriptor as the job sees it.
 *
 * Only the fields the contract job reads. `capabilities` is `readonly string[]` rather than the
 * engine's `AiCapability[]` so the job can be driven from a JSON fixture in tests without
 * constructing a full engine type.
 */
export interface ProviderDescriptor {
  readonly id: string;
  readonly name: string;
  readonly homepage: string;
  readonly capabilities: readonly string[];
  readonly models: readonly ModelDescriptor[];
  readonly credentialFields: readonly CredentialField[];
  readonly defaultBaseUrl: string;
  readonly allowsCustomBaseUrl: boolean;
  readonly browserDirect: 'yes' | 'yes-with-header' | 'no' | 'unknown';
}

/** The result of an adapter's `test()`, as the job consumes it. */
export type AdapterTestResult =
  | { readonly ok: true; readonly confirmed: readonly string[]; readonly detail: string }
  | { readonly ok: false; readonly error: { readonly kind: string; readonly provider: string } };

/** The adapter surface the job drives. Narrower than the engine's `ProviderAdapter` on purpose. */
export interface ProviderAdapterLike {
  readonly descriptor: ProviderDescriptor;
  test(ctx: AdapterContextLike): Promise<AdapterTestResult>;
  listModels?(ctx: AdapterContextLike): Promise<readonly ModelDescriptor[]>;
  run(req: unknown, ctx: AdapterContextLike): Promise<unknown>;
}

/** The context the job builds for each adapter call. */
export interface AdapterContextLike {
  readonly credentials: Readonly<Record<string, string>>;
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  readonly signal?: AbortSignal;
}
