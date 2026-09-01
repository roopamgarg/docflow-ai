import { describe, it, expect, vi } from "vitest";

import {
  INITIAL_EXTRACTION_STEP,
  allFieldsApproved,
  approvedFieldCount,
  documentKindFor,
  documentReducer,
  documentSelected,
  extractionFailed,
  extractionProgressed,
  extractionRestarted,
  extractionSucceeded,
  fieldActivated,
  fieldApprovalToggled,
  fieldUpdated,
  initialDocumentState,
  runExtraction,
  stateReset,
  toExtractionFailure,
  type DocumentAction,
  type DocumentState,
  type LoadedDocument,
} from "./document-state";
import { ExtractionError } from "./extraction/errors";
import type { ExtractionProvider } from "./extraction/provider";
import type {
  BoundingBox,
  Extraction,
  ExtractedValue,
  LineItem,
} from "./extraction/types";

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const BBOX: BoundingBox = { x0: 1, y0: 2, x1: 3, y1: 4 };

function loadedDoc(overrides: Partial<LoadedDocument> = {}): LoadedDocument {
  return {
    kind: "pdf",
    file: new File(["bytes"], "invoice.pdf", { type: "application/pdf" }),
    url: "blob:mock-url",
    name: "invoice.pdf",
    ...overrides,
  };
}

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

/** An `Extraction` with one line item, so `toFields` produces five entries. */
function extraction(): Extraction {
  return {
    source: "pdf-text",
    pages: [{ index: 0, width: 612, height: 792 }],
    fields: {
      invoice_id: value({ value: "INV-1", confidence: 1, bbox: BBOX, page: 0 }),
      date: value({ value: "2024-10-26", confidence: 0.9, bbox: BBOX, page: 0 }),
      vendor_name: value({ value: "Acme", confidence: 0.8, bbox: BBOX, page: 0 }),
      total_amount: value({ value: "100.00", confidence: 1, bbox: BBOX, page: 0 }),
    },
    lineItems: [
      lineItem({ value: "10.00", description: "Widget", amount: "10.00" }),
    ],
  };
}

function readyState(): DocumentState {
  return documentReducer(
    { ...initialDocumentState, doc: loadedDoc() },
    extractionSucceeded(extraction())
  );
}

/* ------------------------------------------------------------------ *
 * document/selected
 * ------------------------------------------------------------------ */

describe("documentReducer / document/selected", () => {
  it("loads the document and starts a fresh working run", () => {
    const doc = loadedDoc();
    const next = documentReducer(initialDocumentState, documentSelected(doc));

    expect(next).toEqual({
      doc,
      fields: [],
      status: { phase: "working", step: INITIAL_EXTRACTION_STEP },
      docApproved: false,
      activeFieldId: null,
    });
  });

  it("supersedes a previous document's edits and approvals", () => {
    const priorReady = readyState();
    const approved = documentReducer(priorReady, allFieldsApproved());
    const newDoc = loadedDoc({ name: "other.pdf" });

    const next = documentReducer(approved, documentSelected(newDoc));

    expect(next.doc).toBe(newDoc);
    expect(next.fields).toEqual([]);
    expect(next.docApproved).toBe(false);
    expect(next.activeFieldId).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * extraction/progressed
 * ------------------------------------------------------------------ */

describe("documentReducer / extraction/progressed", () => {
  it("replaces status.step while working", () => {
    const working = documentReducer(
      initialDocumentState,
      documentSelected(loadedDoc())
    );

    const next = documentReducer(
      working,
      extractionProgressed({ phase: "ocr", ratio: 0.5 })
    );

    expect(next.status).toEqual({
      phase: "working",
      step: { phase: "ocr", ratio: 0.5 },
    });
  });

  it("returns the SAME state object (identity) when not working, guarding against late reports", () => {
    const ready = readyState();

    const next = documentReducer(
      ready,
      extractionProgressed({ phase: "ocr", ratio: 0.9 })
    );

    expect(next).toBe(ready);
  });

  it("is a no-op by identity on idle state too", () => {
    const next = documentReducer(
      initialDocumentState,
      extractionProgressed({ phase: "matching", ratio: 1 })
    );

    expect(next).toBe(initialDocumentState);
  });
});

/* ------------------------------------------------------------------ *
 * extraction/succeeded
 * ------------------------------------------------------------------ */

describe("documentReducer / extraction/succeeded", () => {
  it("stores ready status and maps the extraction to ordered field ids", () => {
    const next = readyState();

    expect(next.status).toEqual({ phase: "ready" });
    expect(next.fields.map((f) => f.id)).toEqual([
      "invoice_id",
      "date",
      "vendor_name",
      "total_amount",
      "line_items.0",
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * extraction/failed
 * ------------------------------------------------------------------ */

describe("documentReducer / extraction/failed", () => {
  it("sets error status, clears fields, and RETAINS doc for retry", () => {
    const doc = loadedDoc();
    const working = documentReducer(initialDocumentState, documentSelected(doc));

    const next = documentReducer(working, extractionFailed("no_text_found", "nope"));

    expect(next.status).toEqual({
      phase: "error",
      code: "no_text_found",
      message: "nope",
    });
    expect(next.fields).toEqual([]);
    // Explicit retention check: retry() needs the file, so doc must survive.
    expect(next.doc).toBe(doc);
    expect(next.doc).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * extraction/restarted
 * ------------------------------------------------------------------ */

describe("documentReducer / extraction/restarted", () => {
  it("is a no-op when doc is null", () => {
    const next = documentReducer(initialDocumentState, extractionRestarted());
    expect(next).toBe(initialDocumentState);
  });

  it("keeps doc and its url, and clears fields back to the starting working step", () => {
    const ready = readyState();

    const next = documentReducer(ready, extractionRestarted());

    expect(next.doc).toBe(ready.doc);
    expect(next.doc?.url).toBe(ready.doc?.url);
    expect(next.fields).toEqual([]);
    expect(next.status).toEqual({
      phase: "working",
      step: INITIAL_EXTRACTION_STEP,
    });
    expect(next.docApproved).toBe(false);
    expect(next.activeFieldId).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * field/updated
 * ------------------------------------------------------------------ */

describe("documentReducer / field/updated", () => {
  it("sets the new value and edited: true, leaves originalValue unchanged, and other fields untouched", () => {
    const ready = readyState();
    const before = ready.fields.find((f) => f.id === "invoice_id")!;
    expect(before.value).toBe("INV-1");

    const next = documentReducer(ready, fieldUpdated("invoice_id", "INV-2"));
    const after = next.fields.find((f) => f.id === "invoice_id")!;

    expect(after.value).toBe("INV-2");
    expect(after.originalValue).toBe("INV-1");
    expect(after.edited).toBe(true);

    // Other fields are untouched (same reference, same values).
    const otherBefore = ready.fields.find((f) => f.id === "date")!;
    const otherAfter = next.fields.find((f) => f.id === "date")!;
    expect(otherAfter).toBe(otherBefore);
  });

  it("approve-then-edit must leave approved === true (the single most important rule in this ticket)", () => {
    const ready = readyState();
    const approvedState = documentReducer(
      ready,
      fieldApprovalToggled("invoice_id")
    );
    expect(approvedState.fields.find((f) => f.id === "invoice_id")?.approved).toBe(
      true
    );

    const edited = documentReducer(
      approvedState,
      fieldUpdated("invoice_id", "INV-CORRECTED")
    );
    const field = edited.fields.find((f) => f.id === "invoice_id")!;

    expect(field.value).toBe("INV-CORRECTED");
    expect(field.originalValue).toBe("INV-1");
    expect(field.edited).toBe(true);
    expect(field.approved).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * field/approvalToggled
 * ------------------------------------------------------------------ */

describe("documentReducer / field/approvalToggled", () => {
  it("flips only the targeted field and never touches docApproved", () => {
    const ready = readyState();
    expect(ready.docApproved).toBe(false);

    const next = documentReducer(ready, fieldApprovalToggled("date"));

    expect(next.fields.find((f) => f.id === "date")?.approved).toBe(true);
    expect(
      next.fields.filter((f) => f.id !== "date").every((f) => f.approved === false)
    ).toBe(true);
    expect(next.docApproved).toBe(false);

    const toggledBack = documentReducer(next, fieldApprovalToggled("date"));
    expect(toggledBack.fields.find((f) => f.id === "date")?.approved).toBe(false);
    expect(toggledBack.docApproved).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * fields/allApproved + approvedFieldCount
 * ------------------------------------------------------------------ */

describe("documentReducer / fields/allApproved", () => {
  it("approves every field and sets docApproved", () => {
    const ready = readyState();

    const next = documentReducer(ready, allFieldsApproved());

    expect(next.fields.every((f) => f.approved === true)).toBe(true);
    expect(next.docApproved).toBe(true);
  });
});

describe("approvedFieldCount", () => {
  it("counts every field as approved after allFieldsApproved (5 fields with one line item)", () => {
    const ready = readyState();
    expect(ready.fields).toHaveLength(5);

    const allApproved = documentReducer(ready, allFieldsApproved());
    expect(approvedFieldCount(allApproved.fields)).toBe(allApproved.fields.length);
    expect(approvedFieldCount(allApproved.fields)).toBe(5);
  });

  it("counts exactly one after a single toggle", () => {
    const ready = readyState();
    const toggled = documentReducer(ready, fieldApprovalToggled("vendor_name"));

    expect(approvedFieldCount(toggled.fields)).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * field/activated
 * ------------------------------------------------------------------ */

describe("documentReducer / field/activated", () => {
  it("sets activeFieldId and changes nothing else", () => {
    const ready = readyState();

    const next = documentReducer(ready, fieldActivated("date"));

    expect(next.activeFieldId).toBe("date");
    expect(next.fields).toBe(ready.fields);
    expect(next.status).toBe(ready.status);
    expect(next.doc).toBe(ready.doc);
    expect(next.docApproved).toBe(ready.docApproved);

    const cleared = documentReducer(next, fieldActivated(null));
    expect(cleared.activeFieldId).toBeNull();
    expect(cleared.fields).toBe(next.fields);
  });
});

/* ------------------------------------------------------------------ *
 * state/reset
 * ------------------------------------------------------------------ */

describe("documentReducer / state/reset", () => {
  it("deep-equals initialDocumentState", () => {
    const busy = documentReducer(readyState(), allFieldsApproved());

    const next = documentReducer(busy, stateReset());

    expect(next).toEqual({
      doc: null,
      fields: [],
      status: { phase: "idle" },
      docApproved: false,
      activeFieldId: null,
    });
    expect(next).toEqual(initialDocumentState);
  });
});

/* ------------------------------------------------------------------ *
 * documentKindFor
 * ------------------------------------------------------------------ */

describe("documentKindFor", () => {
  it("resolves application/pdf to pdf", () => {
    expect(documentKindFor({ type: "application/pdf", name: "x" })).toBe("pdf");
  });

  it("resolves a .pdf name to pdf when type is empty", () => {
    expect(documentKindFor({ type: "", name: "invoice.PDF" })).toBe("pdf");
  });

  it("resolves png/jpeg/jpg to image, case-insensitively by extension", () => {
    expect(documentKindFor({ type: "image/png", name: "x" })).toBe("image");
    expect(documentKindFor({ type: "image/jpeg", name: "x" })).toBe("image");
    expect(documentKindFor({ type: "image/jpg", name: "x" })).toBe("image");
    expect(documentKindFor({ type: "", name: "PHOTO.PNG" })).toBe("image");
    expect(documentKindFor({ type: "", name: "photo.JPG" })).toBe("image");
    expect(documentKindFor({ type: "", name: "photo.JPEG" })).toBe("image");
  });

  it("returns null for an unsupported type such as text/csv", () => {
    expect(documentKindFor({ type: "text/csv", name: "data.csv" })).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * toExtractionFailure
 * ------------------------------------------------------------------ */

describe("toExtractionFailure", () => {
  it("passes an ExtractionError through unchanged", () => {
    const error = new ExtractionError("unreadable", "custom message");

    expect(toExtractionFailure(error)).toEqual({
      code: "unreadable",
      message: "custom message",
    });
  });

  it("maps any other throw to code internal with the default message", () => {
    expect(toExtractionFailure(new Error("boom"))).toEqual({
      code: "internal",
      message: "Something went wrong while processing that document.",
    });
    expect(toExtractionFailure("a string throw")).toEqual({
      code: "internal",
      message: "Something went wrong while processing that document.",
    });
    expect(toExtractionFailure(undefined)).toEqual({
      code: "internal",
      message: "Something went wrong while processing that document.",
    });
  });
});

/* ------------------------------------------------------------------ *
 * runExtraction
 * ------------------------------------------------------------------ */

function fakeFile(): File {
  return new File(["bytes"], "invoice.pdf", { type: "application/pdf" });
}

function fakeProvider(
  overrides: Partial<ExtractionProvider> = {}
): ExtractionProvider {
  return {
    id: "fake",
    label: "Fake provider",
    extract: vi.fn(async () => extraction()),
    ...overrides,
  };
}

describe("runExtraction", () => {
  it("dispatches extraction/progressed per progress callback then extraction/succeeded", async () => {
    const dispatched: DocumentAction[] = [];
    const provider = fakeProvider({
      extract: vi.fn(async (_file, onProgress) => {
        onProgress({ phase: "reading", ratio: 0.1 });
        onProgress({ phase: "ocr", ratio: 0.6 });
        return extraction();
      }),
    });

    await runExtraction(fakeFile(), (a) => dispatched.push(a), {
      getProvider: () => provider,
    });

    expect(dispatched.map((a) => a.type)).toEqual([
      "extraction/progressed",
      "extraction/progressed",
      "extraction/succeeded",
    ]);
    expect(dispatched[0]).toEqual(
      extractionProgressed({ phase: "reading", ratio: 0.1 })
    );
    expect(dispatched[1]).toEqual(
      extractionProgressed({ phase: "ocr", ratio: 0.6 })
    );
  });

  it("never rejects; an ExtractionError thrown from extract() becomes extraction/failed with that code and message", async () => {
    const dispatched: DocumentAction[] = [];
    const provider = fakeProvider({
      extract: vi.fn(async () => {
        throw new ExtractionError("internal", "boom");
      }),
    });

    await expect(
      runExtraction(fakeFile(), (a) => dispatched.push(a), {
        getProvider: () => provider,
      })
    ).resolves.toBeUndefined();

    expect(dispatched).toEqual([extractionFailed("internal", "boom")]);
  });

  it("never rejects; an ExtractionError thrown from getProvider() becomes extraction/failed with that code and message", async () => {
    const dispatched: DocumentAction[] = [];

    await expect(
      runExtraction(fakeFile(), (a) => dispatched.push(a), {
        getProvider: () => {
          throw new ExtractionError("internal", "boom");
        },
      })
    ).resolves.toBeUndefined();

    expect(dispatched).toEqual([extractionFailed("internal", "boom")]);
  });

  it("maps a raw Error to code internal", async () => {
    const dispatched: DocumentAction[] = [];
    const provider = fakeProvider({
      extract: vi.fn(async () => {
        throw new Error("unexpected");
      }),
    });

    await runExtraction(fakeFile(), (a) => dispatched.push(a), {
      getProvider: () => provider,
    });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.type).toBe("extraction/failed");
    expect((dispatched[0] as { code?: string }).code).toBe("internal");
  });
});
