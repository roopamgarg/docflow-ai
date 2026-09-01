import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXPORT_FILENAME_FALLBACK,
  UNPARSEABLE_AMOUNT,
  downloadJson,
  exportFilename,
  parseAmount,
  serialiseExport,
  toExportJson,
} from "./export";
import type { ExtractedField } from "./extraction/types";

/**
 * An `ExtractedField`, defaulting to the not-found shape (mirrors the
 * `value()` helper in `lib/extraction/fields.spec.ts`).
 */
function field(overrides: Partial<ExtractedField> = {}): ExtractedField {
  return {
    id: "invoice_id",
    label: "Invoice ID",
    value: "",
    originalValue: "",
    confidence: 0,
    reason: "Not found in document",
    alternatives: [],
    bbox: null,
    page: 0,
    approved: false,
    edited: false,
    ...overrides,
  };
}

describe("parseAmount", () => {
  // Every pair the implementer verified by hand. `¥ 1,250.00` matters
  // specifically: ticket 015 established the vendored OCR model has no `₹`
  // glyph to emit, so a real demo run's total always arrives as yen, not
  // rupees — a test that only covers `₹` would miss the actual data shape.
  const CASES: Array<[label: string, input: string, expected: number]> = [
    ["rupee symbol + grouping", "₹1,250.00", 1250],
    ["yen symbol + grouping (the real OCR shape)", "¥ 1,250.00", 1250],
    ["bare digits", "1250", 1250],
    ["grouping, no currency symbol", "1,250.00", 1250],
    ["empty string (not-found field)", "", 0],
    ["non-numeric text", "n/a", 0],
    ["parenthesised negative", "(1,200.00)", -1200],
  ];

  it.each(CASES)("%s: %j -> %j", (_label, input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it("never yields NaN, null, or undefined for any of the above inputs", () => {
    // The acceptance criterion, asserted directly rather than only implied
    // by the individual expected values above.
    for (const [, input] of CASES) {
      const result = parseAmount(input);
      expect(result).not.toBeNull();
      expect(result).not.toBeUndefined();
      expect(Number.isNaN(result)).toBe(false);
      expect(Number.isFinite(result)).toBe(true);
      expect(typeof result).toBe("number");
    }
  });

  it("falls back to UNPARSEABLE_AMOUNT (0) for malformed input", () => {
    expect(parseAmount("n/a")).toBe(UNPARSEABLE_AMOUNT);
    expect(parseAmount("")).toBe(UNPARSEABLE_AMOUNT);
  });
});

describe("toExportJson", () => {
  it("emits exactly the five agreed keys, no more, no less", () => {
    const payload = toExportJson([]);
    expect(Object.keys(payload).sort()).toEqual(
      [
        "date",
        "invoice_id",
        "line_items",
        "total_amount",
        "vendor_name",
      ].sort()
    );
  });

  it("types total_amount as a number", () => {
    const payload = toExportJson([
      field({ id: "total_amount", value: "1,250.00" }),
    ]);
    expect(typeof payload.total_amount).toBe("number");
    expect(payload.total_amount).toBe(1250);
  });

  it("exports an empty string for a scalar field not present in the model", () => {
    // No `invoice_id` field at all — the not-in-the-model case, distinct
    // from a field present with an empty `value`.
    const payload = toExportJson([field({ id: "vendor_name", value: "Acme" })]);
    expect(payload.invoice_id).toBe("");
    expect(payload.date).toBe("");
  });

  it("exports an empty string for a scalar field present with an empty value", () => {
    const payload = toExportJson([
      field({ id: "invoice_id", value: "", originalValue: "INV-1" }),
    ]);
    expect(payload.invoice_id).toBe("");
  });

  it("maps multiple line items in the model's array order", () => {
    const payload = toExportJson([
      field({
        id: "line_items.0",
        label: "Widget",
        value: "10.00",
      }),
      field({
        id: "line_items.1",
        label: "Gadget",
        value: "20.00",
      }),
      field({
        id: "line_items.2",
        label: "Gizmo",
        value: "30.00",
      }),
    ]);
    expect(payload.line_items).toEqual([
      { description: "Widget", amount: 10 },
      { description: "Gadget", amount: 20 },
      { description: "Gizmo", amount: 30 },
    ]);
  });

  it("orders line items by their line_items.N index, not by array position", () => {
    // Ids deliberately shuffled relative to array position — line_items.2
    // is listed first, line_items.0 last — to check the export is keyed off
    // the id's numeric suffix rather than incidentally trusting whatever
    // order the caller happened to pass fields in.
    const payload = toExportJson([
      field({ id: "line_items.2", label: "Third", value: "300" }),
      field({ id: "line_items.0", label: "First", value: "100" }),
      field({ id: "line_items.1", label: "Second", value: "200" }),
    ]);
    expect(payload.line_items.map((item) => item.amount)).toEqual([
      100, 200, 300,
    ]);
    expect(payload.line_items.map((item) => item.description)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("never yields NaN/null/undefined for a not-found or malformed line item amount", () => {
    const payload = toExportJson([
      field({ id: "line_items.0", label: "Not found", value: "" }),
      field({ id: "line_items.1", label: "Malformed", value: "n/a" }),
    ]);
    for (const item of payload.line_items) {
      expect(Number.isFinite(item.amount)).toBe(true);
      expect(item.amount).toBe(0);
    }
  });

  it("the single most important test in this ticket: an edited value wins over its originalValue", () => {
    // If this ever exports `originalValue` instead of `value`, the entire
    // review step is pointless: a human corrects an OCR misread, approves,
    // and the export silently ships the mistake anyway. `value` is what the
    // human left behind after review; `originalValue` exists only so the
    // panel can render a diff, never to be shipped.
    const corrected = field({
      id: "vendor_name",
      label: "Vendor Name",
      value: "Corrected Ltd",
      originalValue: "Corrctd Lt",
      edited: true,
    });

    const payload = toExportJson([corrected]);

    expect(payload.vendor_name).toBe("Corrected Ltd");
    expect(payload.vendor_name).not.toBe("Corrctd Lt");
  });

  it("an edited line-item amount wins over its originalValue too", () => {
    const editedLineItem = field({
      id: "line_items.0",
      label: "Widget",
      value: "123456.78",
      originalValue: "12345.78",
      edited: true,
    });

    const payload = toExportJson([editedLineItem]);

    expect(payload.line_items[0].amount).toBe(123456.78);
  });

  it("trims whitespace around a scalar value", () => {
    const payload = toExportJson([
      field({ id: "invoice_id", value: "  INV-1024  " }),
    ]);
    expect(payload.invoice_id).toBe("INV-1024");
  });
});

describe("exportFilename", () => {
  it("names the file after the invoice id", () => {
    expect(exportFilename("INV-2024-001")).toBe("docflow-INV-2024-001.json");
  });

  it("falls back to a generic name when the id is empty", () => {
    expect(exportFilename("")).toBe(EXPORT_FILENAME_FALLBACK);
    expect(EXPORT_FILENAME_FALLBACK).toBe("docflow-export.json");
  });

  it("sanitises path separators and spaces so the download name is never broken", () => {
    // An id read off a document is untrusted: `/` would be read as a path
    // separator by the browser's save dialog, and a space makes an awkward
    // filename. Both collapse to a single `-`.
    expect(exportFilename("A/B 1")).toBe("docflow-A-B-1.json");
  });

  it("falls back when the id is whitespace-only", () => {
    expect(exportFilename("   ")).toBe(EXPORT_FILENAME_FALLBACK);
  });

  it("trims leading/trailing separator characters rather than leaving them in the name", () => {
    expect(exportFilename(" /INV/ ")).toBe("docflow-INV.json");
  });

  it("collapses a run of unsafe characters into a single dash", () => {
    expect(exportFilename("A///B")).toBe("docflow-A-B.json");
  });
});

describe("serialiseExport", () => {
  it("serialises with a 2-space indent", () => {
    const payload = toExportJson([
      field({ id: "invoice_id", value: "INV-1" }),
    ]);
    expect(serialiseExport(payload)).toBe(JSON.stringify(payload, null, 2));
    // Pinned literally too, so a change to the indent width or key order
    // fails loudly rather than only via the delegated JSON.stringify call.
    expect(serialiseExport(payload)).toBe(
      [
        "{",
        '  "invoice_id": "INV-1",',
        '  "date": "",',
        '  "vendor_name": "",',
        '  "total_amount": 0,',
        '  "line_items": []',
        "}",
      ].join("\n")
    );
  });
});

describe("downloadJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves a Blob via a detached <a download>, named and revoked correctly", async () => {
    const anchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    const createElement = vi.fn().mockReturnValue(anchor);
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("document", { createElement });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const payload = toExportJson([
      field({ id: "invoice_id", value: "INV-2024-001" }),
    ]);

    const filename = downloadJson(payload);

    expect(filename).toBe("docflow-INV-2024-001.json");
    expect(createElement).toHaveBeenCalledWith("a");
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    // The Blob handed to createObjectURL carries the same JSON the
    // preview on screen shows — not a re-derived or stale copy.
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");
    await expect(blob.text()).resolves.toBe(serialiseExport(payload));

    expect(anchor.href).toBe("blob:mock-url");
    expect(anchor.download).toBe(filename);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    // The stubbed `document` exposes only `createElement`, with no `body` or
    // `appendChild` — if `downloadJson` tried to attach the anchor to the
    // document, this test would throw rather than silently pass, which is
    // how it proves the anchor stays detached.
  });

  it("falls back to the generic filename when the payload has no invoice id", () => {
    const anchor = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(anchor),
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });

    const payload = toExportJson([]);
    const filename = downloadJson(payload);

    expect(filename).toBe(EXPORT_FILENAME_FALLBACK);
    expect(anchor.download).toBe(EXPORT_FILENAME_FALLBACK);
  });
});
