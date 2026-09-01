import { describe, it, expect } from "vitest";

import {
  LINE_ITEM_ID_PREFIX,
  SCALAR_FIELD_LABELS,
  SCALAR_FIELD_ORDER,
  lineItemFieldId,
  lineItemLabel,
  toFields,
} from "./fields";
import type { BoundingBox, Extraction, ExtractedValue, LineItem } from "./types";

const BBOX: BoundingBox = { x0: 1, y0: 2, x1: 3, y1: 4 };

/** A found or not-found `ExtractedValue`, defaulting to the not-found shape. */
function value(overrides: Partial<ExtractedValue> = {}): ExtractedValue {
  return {
    value: "",
    confidence: 0,
    reason: "Not found in document",
    alternatives: [],
    bbox: null,
    page: 0,
    ...overrides,
  };
}

function lineItem(overrides: Partial<LineItem> = {}): LineItem {
  return {
    ...value(),
    description: "",
    amount: "",
    ...overrides,
  };
}

/** An `Extraction` with three found scalars, one not-found, and given line items. */
function extraction(lineItems: LineItem[] = []): Extraction {
  return {
    source: "pdf-text",
    pages: [{ index: 0, width: 612, height: 792 }],
    fields: {
      invoice_id: value({
        value: "INV-1024",
        confidence: 1,
        bbox: BBOX,
        page: 0,
      }),
      date: value({
        value: "2024-10-26",
        confidence: 0.85,
        bbox: BBOX,
        page: 0,
      }),
      vendor_name: value({
        value: "Acme Supplies",
        confidence: 0.6,
        bbox: BBOX,
        page: 1,
      }),
      // Deliberately not found, to exercise the "never omitted" contract.
      total_amount: value(),
    },
    lineItems,
  };
}

describe("SCALAR_FIELD_ORDER / SCALAR_FIELD_LABELS", () => {
  it("orders and labels the four scalar fields", () => {
    expect(SCALAR_FIELD_ORDER).toEqual([
      "invoice_id",
      "date",
      "vendor_name",
      "total_amount",
    ]);
    expect(SCALAR_FIELD_LABELS).toEqual({
      invoice_id: "Invoice ID",
      date: "Date",
      vendor_name: "Vendor Name",
      total_amount: "Total Amount",
    });
  });
});

describe("lineItemFieldId", () => {
  it("namespaces by index under line_items", () => {
    expect(LINE_ITEM_ID_PREFIX).toBe("line_items");
    expect(lineItemFieldId(0)).toBe("line_items.0");
    expect(lineItemFieldId(3)).toBe("line_items.3");
  });
});

describe("lineItemLabel", () => {
  it("uses the trimmed description when present", () => {
    const item = lineItem({ description: "  Widget  ", amount: "10.00" });
    expect(lineItemLabel(item, 0)).toBe("Widget");
  });

  it("falls back to a positional label for a blank description", () => {
    const item = lineItem({ description: "   ", amount: "10.00" });
    expect(lineItemLabel(item, 2)).toBe("Line item 3");
  });
});

describe("toFields", () => {
  it("orders scalars first, then one entry per line item, with stable ids and labels", () => {
    const items = [
      lineItem({ value: "10.00", description: "Widget", amount: "10.00" }),
      lineItem({ value: "20.00", description: "Gadget", amount: "20.00" }),
    ];
    const fields = toFields(extraction(items));

    expect(fields.map((field) => field.id)).toEqual([
      "invoice_id",
      "date",
      "vendor_name",
      "total_amount",
      "line_items.0",
      "line_items.1",
    ]);
    expect(fields.map((field) => field.label)).toEqual([
      "Invoice ID",
      "Date",
      "Vendor Name",
      "Total Amount",
      "Widget",
      "Gadget",
    ]);
  });

  it("keeps each field's bbox and page from the extracted value", () => {
    const fields = toFields(extraction());

    const invoiceId = fields.find((field) => field.id === "invoice_id");
    expect(invoiceId?.bbox).toEqual(BBOX);
    expect(invoiceId?.page).toBe(0);

    const vendor = fields.find((field) => field.id === "vendor_name");
    expect(vendor?.bbox).toEqual(BBOX);
    expect(vendor?.page).toBe(1);
  });

  it("starts every field unapproved and unedited, with originalValue seeded from value", () => {
    const items = [lineItem({ description: "Widget", amount: "10.00" })];
    const fields = toFields(extraction(items));

    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(field.approved).toBe(false);
      expect(field.edited).toBe(false);
      expect(field.originalValue).toBe(field.value);
    }
  });

  it("never omits a not-found field, and never fabricates one", () => {
    const fields = toFields(extraction());
    const totalAmount = fields.find((field) => field.id === "total_amount");

    expect(totalAmount).toBeDefined();
    expect(totalAmount?.value).toBe("");
    expect(totalAmount?.confidence).toBe(0);
    expect(totalAmount?.reason).toBe("Not found in document");
    expect(totalAmount?.alternatives).toEqual([]);
    expect(totalAmount?.bbox).toBeNull();
  });

  it("produces exactly four scalar fields plus one per line item", () => {
    expect(toFields(extraction())).toHaveLength(4);
    expect(
      toFields(
        extraction([lineItem({ description: "Only item", amount: "1.00" })])
      )
    ).toHaveLength(5);
    expect(
      toFields(
        extraction([
          lineItem({ description: "A", amount: "1.00" }),
          lineItem({ description: "B", amount: "2.00" }),
          lineItem({ description: "C", amount: "3.00" }),
        ])
      )
    ).toHaveLength(7);
  });

  it("is total across an Extraction with no line items", () => {
    expect(toFields(extraction([])).map((field) => field.id)).toEqual([
      "invoice_id",
      "date",
      "vendor_name",
      "total_amount",
    ]);
  });
});
