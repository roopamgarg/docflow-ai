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
import { createLocalProvider } from "./local";

/** The provider used when a caller does not name one. */
export const DEFAULT_PROVIDER_ID = "local";

/**
 * Registered factories by id.
 *
 * `createLocalProvider` takes only optional test seams, so it satisfies
 * `ExtractionProviderFactory` directly: a registry lookup builds the provider
 * with the real sources, and a test that wants stubs constructs one itself.
 */
const PROVIDERS: Record<string, ExtractionProviderFactory> = {
  local: createLocalProvider,
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

/** Registered ids, for diagnostics and tests. */
export function listExtractionProviderIds(): string[] {
  return Object.keys(PROVIDERS);
}
