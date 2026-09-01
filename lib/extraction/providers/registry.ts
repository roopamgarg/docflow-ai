/**
 * The only module that knows provider ids and how to construct providers.
 * Components and state select a provider by id through here; they never import
 * a provider module directly.
 *
 * Adding an engine is a closed checklist: write `providers/<name>.ts` exporting
 * a factory, map its errors onto `ExtractionErrorCode`, add one line below.
 */

import { ExtractionError } from "../errors";
import type {
  ExtractionProvider,
  ExtractionProviderFactory,
} from "../provider";

/** The provider used when a caller does not name one. */
export const DEFAULT_PROVIDER_ID = "local";

/**
 * Registered factories by id.
 *
 * Intentionally empty for now: the contracts land before any engine does, and
 * `local` is registered by ticket 008. Until then every lookup is an unknown
 * id, which is the documented `internal` failure rather than a crash.
 */
const PROVIDERS: Record<string, ExtractionProviderFactory> = {
  // local: createLocalProvider,  // ticket 008
};

/**
 * Resolve an id against an explicit registry. Pure, so a caller (or a test)
 * can exercise both the hit and the miss without touching module state.
 *
 * @throws {ExtractionError} code `internal` when `id` is not registered.
 */
export function resolveExtractionProvider(
  registry: Readonly<Record<string, ExtractionProviderFactory>>,
  id: string = DEFAULT_PROVIDER_ID
): ExtractionProvider {
  const factory = registry[id];
  if (!factory) {
    throw new ExtractionError(
      "internal",
      `Unknown extraction provider: "${id}".`
    );
  }
  return factory();
}

/**
 * Resolve an id against the registered providers.
 *
 * @throws {ExtractionError} code `internal` when `id` is not registered.
 */
export function getExtractionProvider(
  id: string = DEFAULT_PROVIDER_ID
): ExtractionProvider {
  return resolveExtractionProvider(PROVIDERS, id);
}

/** Registered ids, for diagnostics and tests. Empty until ticket 008. */
export function listExtractionProviderIds(): string[] {
  return Object.keys(PROVIDERS);
}
