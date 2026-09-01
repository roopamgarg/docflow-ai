import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_PROVIDER_ID,
  getExtractionProvider,
  listExtractionProviderIds,
  resolveExtractionProvider,
} from "./registry";
import { ExtractionError, isExtractionError } from "../errors";
import type { ExtractionProvider } from "../provider";

describe("DEFAULT_PROVIDER_ID", () => {
  it("is local", () => {
    expect(DEFAULT_PROVIDER_ID).toBe("local");
  });
});

describe("getExtractionProvider", () => {
  it("throws an internal ExtractionError for the default id, since the module registry is empty pre-008", () => {
    expect(() => getExtractionProvider()).toThrow(ExtractionError);
    try {
      getExtractionProvider();
      expect.unreachable("getExtractionProvider() should have thrown");
    } catch (error) {
      expect(isExtractionError(error)).toBe(true);
      expect((error as ExtractionError).code).toBe("internal");
    }
  });

  it("throws an internal ExtractionError for an unknown id", () => {
    try {
      getExtractionProvider("unknown-engine");
      expect.unreachable("getExtractionProvider() should have thrown");
    } catch (error) {
      expect(isExtractionError(error)).toBe(true);
      expect((error as ExtractionError).code).toBe("internal");
    }
  });

  it("reports no registered ids yet", () => {
    expect(listExtractionProviderIds()).toEqual([]);
  });
});

describe("resolveExtractionProvider", () => {
  it("resolves and calls the factory for a registered id", () => {
    const provider: ExtractionProvider = {
      id: "test",
      label: "Test provider",
      extract: vi.fn(),
    };
    const factory = vi.fn(() => provider);

    const resolved = resolveExtractionProvider({ test: factory }, "test");

    expect(factory).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(provider);
  });

  it("throws an internal ExtractionError for an id absent from the injected registry", () => {
    const factory = vi.fn(() => ({
      id: "test",
      label: "Test provider",
      extract: vi.fn(),
    }));

    try {
      resolveExtractionProvider({ test: factory }, "other");
      expect.unreachable("resolveExtractionProvider() should have thrown");
    } catch (error) {
      expect(isExtractionError(error)).toBe(true);
      expect((error as ExtractionError).code).toBe("internal");
    }
    expect(factory).not.toHaveBeenCalled();
  });

  it("defaults the id to DEFAULT_PROVIDER_ID when none is supplied", () => {
    const provider: ExtractionProvider = {
      id: "local",
      label: "On-device OCR",
      extract: vi.fn(),
    };
    const factory = vi.fn(() => provider);

    const resolved = resolveExtractionProvider({ local: factory });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(provider);
  });
});
