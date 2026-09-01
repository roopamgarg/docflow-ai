/**
 * The document review state machine: types, action creators, the initial state
 * and one pure reducer.
 *
 * Deliberately React-free. Every transition the product depends on — the
 * extraction phases, the edit/approval rules, the reset — is a plain function
 * of `(state, action)`, so it can be asserted directly without a renderer, a
 * DOM or a real extraction provider. `document-context.tsx` adds nothing but
 * `useReducer`, the object-URL lifecycle and the provider call.
 *
 * No domain logic lives here: confidence, field rules and normalisation are the
 * extraction layer's job. The one thing this module borrows from that layer is
 * `toFields`, the pure domain → display mapping, because storing an
 * `Extraction` is exactly "store the result".
 */

import type { ExtractionErrorCode } from "./extraction/errors";
import { ExtractionError, isExtractionError } from "./extraction/errors";
import { toFields } from "./extraction/fields";
import type {
  ExtractionProgress,
  ExtractionProgressCallback,
  ExtractionProvider,
} from "./extraction/provider";
import type {
  ExtractedField,
  Extraction,
  PageGeometry,
} from "./extraction/types";

/* ------------------------------------------------------------------ *
 * State shape
 * ------------------------------------------------------------------ */

/**
 * How the document is rendered in the review viewer: an `<img>` or a pdf.js
 * canvas. A rendering decision, not an extraction one — the provider resolves
 * the media type itself and rejects anything it cannot read.
 */
export type DocumentKind = "image" | "pdf";

/** The one in-flight document, as the UI needs it. */
export interface LoadedDocument {
  kind: DocumentKind;
  /** The original file, kept so `retry()` can re-run the same bytes. */
  file: File;
  /** `URL.createObjectURL(file)` — revoked on `reset()` and on unmount. */
  url: string;
  name: string;
}

/**
 * Where the run is. A discriminated union rather than a set of booleans so
 * `working` cannot exist without a step and `error` cannot exist without a
 * code, which is what keeps the processing and error screens honest.
 */
export type DocumentStatus =
  | { phase: "idle" | "ready" }
  | { phase: "working"; step: ExtractionProgress }
  | { phase: "error"; code: ExtractionErrorCode; message: string };

export interface DocumentState {
  doc: LoadedDocument | null;
  /** The review model. Empty until an extraction succeeds. */
  fields: ExtractedField[];
  /**
   * Per-page geometry of the extraction the `fields` came from, or `undefined`
   * until one succeeds.
   *
   * Stored because a `bbox` is only meaningful against the page it was measured
   * on: `BoundingBox` is documented as page pixels in the same space as
   * `Page.width` / `Page.height`, and a scanned PDF is OCR'd at 2x, so its boxes
   * are twice the size of the page the viewer draws. The highlight overlay
   * divides through by these numbers; without them it would have to assume one
   * scale factor and be wrong on that route. @see components/viewer/highlight-geometry
   *
   * Optional rather than an empty array, so "no extraction yet" and "an
   * extraction with no pages" stay distinguishable.
   */
  pages?: readonly PageGeometry[];
  status: DocumentStatus;
  /** Set when the human approves the document as a whole — see `approveAll`. */
  docApproved: boolean;
  /**
   * The field the review panel is pointing at, and the only link between the
   * two review columns: the panel writes it, the highlight overlay reads it.
   */
  activeFieldId: string | null;
}

/**
 * The step a run reports before the provider has said anything.
 *
 * Real progress replaces it as soon as the provider speaks; it exists so the
 * processing screen never has to invent a value for the first frame.
 */
export const INITIAL_EXTRACTION_STEP: ExtractionProgress = {
  phase: "reading",
  ratio: 0,
};

export const initialDocumentState: DocumentState = {
  doc: null,
  fields: [],
  pages: undefined,
  status: { phase: "idle" },
  docApproved: false,
  activeFieldId: null,
};

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

export type DocumentAction =
  /** A file was accepted: replaces any previous document and starts a run. */
  | { type: "document/selected"; doc: LoadedDocument }
  /** `retry()`: re-run the document already in state. */
  | { type: "extraction/restarted" }
  | { type: "extraction/progressed"; step: ExtractionProgress }
  | { type: "extraction/succeeded"; extraction: Extraction }
  | { type: "extraction/failed"; code: ExtractionErrorCode; message: string }
  | { type: "field/updated"; id: string; value: string }
  | { type: "field/approvalToggled"; id: string }
  | { type: "fields/allApproved" }
  | { type: "field/activated"; id: string | null }
  | { type: "state/reset" };

export function documentSelected(doc: LoadedDocument): DocumentAction {
  return { type: "document/selected", doc };
}

export function extractionRestarted(): DocumentAction {
  return { type: "extraction/restarted" };
}

export function extractionProgressed(step: ExtractionProgress): DocumentAction {
  return { type: "extraction/progressed", step };
}

export function extractionSucceeded(extraction: Extraction): DocumentAction {
  return { type: "extraction/succeeded", extraction };
}

export function extractionFailed(
  code: ExtractionErrorCode,
  message: string
): DocumentAction {
  return { type: "extraction/failed", code, message };
}

export function fieldUpdated(id: string, value: string): DocumentAction {
  return { type: "field/updated", id, value };
}

export function fieldApprovalToggled(id: string): DocumentAction {
  return { type: "field/approvalToggled", id };
}

export function allFieldsApproved(): DocumentAction {
  return { type: "fields/allApproved" };
}

export function fieldActivated(id: string | null): DocumentAction {
  return { type: "field/activated", id };
}

export function stateReset(): DocumentAction {
  return { type: "state/reset" };
}

/* ------------------------------------------------------------------ *
 * Reducer
 * ------------------------------------------------------------------ */

/** A fresh run's status: working, with nothing extracted yet. */
function startingRun(): Pick<
  DocumentState,
  "fields" | "pages" | "status" | "docApproved" | "activeFieldId"
> {
  return {
    fields: [],
    pages: undefined,
    status: { phase: "working", step: INITIAL_EXTRACTION_STEP },
    docApproved: false,
    activeFieldId: null,
  };
}

/**
 * The whole state machine. Pure: no URLs are created or revoked here (that is
 * the provider component's lifecycle job) and no extraction is performed.
 */
export function documentReducer(
  state: DocumentState,
  action: DocumentAction
): DocumentState {
  switch (action.type) {
    /**
     * A new document supersedes everything about the old one, including its
     * edits and approvals — the previous review is meaningless against
     * different bytes.
     */
    case "document/selected":
      return { ...startingRun(), doc: action.doc };

    /**
     * Same document, fresh run. Keeps `doc` (and therefore the object URL, so
     * the viewer does not flicker) and drops the previous review, which is the
     * point of a retry.
     *
     * A retry with nothing loaded is a no-op rather than an error: the only
     * caller is the error screen, which cannot exist without a document.
     */
    case "extraction/restarted":
      if (!state.doc) return state;
      return { ...state, ...startingRun() };

    /**
     * Progress is only meaningful while a run is in flight. A provider that
     * reports one last step after it has already failed — or after the human
     * hit reset — must not put the spinner back on screen.
     */
    case "extraction/progressed":
      if (state.status.phase !== "working") return state;
      return { ...state, status: { phase: "working", step: action.step } };

    /**
     * Store the result. `toFields` flattens it into the ordered review model
     * with every scalar key present, found or not.
     */
    case "extraction/succeeded":
      return {
        ...state,
        fields: toFields(action.extraction),
        // Kept alongside the fields, and only ever replaced with them: page
        // geometry from one run against boxes from another would misplace every
        // highlight.
        pages: action.extraction.pages,
        status: { phase: "ready" },
        docApproved: false,
        activeFieldId: null,
      };

    /**
     * Keep `doc` so `retry()` has a file to re-run; drop any fields, because a
     * failed run has no result to review.
     */
    case "extraction/failed":
      return {
        ...state,
        fields: [],
        pages: undefined,
        status: {
          phase: "error",
          code: action.code,
          message: action.message,
        },
        docApproved: false,
        activeFieldId: null,
      };

    /**
     * A human edit. Marks the field `edited` and leaves `originalValue`
     * untouched, so the panel can always show what the engine read.
     *
     * Product rule: an existing approval SURVIVES the edit. It is the same
     * person who approved the field now correcting it, so re-approving would be
     * ceremony; the `Updated` badge makes the change visible instead.
     */
    case "field/updated":
      return {
        ...state,
        fields: state.fields.map((field) =>
          field.id === action.id
            ? { ...field, value: action.value, edited: true }
            : field
        ),
      };

    case "field/approvalToggled":
      return {
        ...state,
        fields: state.fields.map((field) =>
          field.id === action.id
            ? { ...field, approved: !field.approved }
            : field
        ),
      };

    /**
     * `Approve Document`: every field is approved and the document with them.
     * The two are one gesture, so they are one transition — a state where every
     * field is approved but the document is not would be a lie on the success
     * screen.
     */
    case "fields/allApproved":
      return {
        ...state,
        fields: state.fields.map((field) => ({ ...field, approved: true })),
        docApproved: true,
      };

    case "field/activated":
      return { ...state, activeFieldId: action.id };

    /**
     * Back to the landing state. The object URL belonging to the discarded
     * document is revoked by the caller, which owns that side effect.
     */
    case "state/reset":
      return initialDocumentState;
  }
}

/* ------------------------------------------------------------------ *
 * Selectors
 * ------------------------------------------------------------------ */

/** How many fields the human has approved. Drives the review progress bar. */
export function approvedFieldCount(fields: readonly ExtractedField[]): number {
  return fields.reduce((count, field) => (field.approved ? count + 1 : count), 0);
}

/* ------------------------------------------------------------------ *
 * Running an extraction
 * ------------------------------------------------------------------ */

/**
 * Which viewer can render this file, or `null` when it is neither a PDF nor an
 * image we display.
 *
 * Kept to the two things the viewer knows how to draw. It is not a validation
 * gate: the provider owns media and size rules and reports `unsupported_media`
 * itself. This only stops a file we could never display from becoming the
 * current document.
 */
export function documentKindFor(file: {
  type?: string;
  name?: string;
}): DocumentKind | null {
  const type = (file.type ?? "").trim().toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type === "image/png" || type === "image/jpeg" || type === "image/jpg") {
    return "image";
  }
  if (type.length > 0) return null;

  const name = (file.name ?? "").trim().toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image";
  }
  return null;
}

/** An unknown thrown value as the `error` status needs it. */
export function toExtractionFailure(error: unknown): {
  code: ExtractionErrorCode;
  message: string;
} {
  if (isExtractionError(error)) {
    return { code: error.code, message: error.message };
  }
  const fallback = new ExtractionError("internal");
  return { code: fallback.code, message: fallback.message };
}

/** What `runExtraction` needs from the outside world. */
export interface ExtractionRunDeps {
  /**
   * Resolved per run rather than held, so nothing is constructed until a
   * document actually arrives — and so a test can pass a fake.
   */
  getProvider: () => ExtractionProvider;
}

/**
 * Call the provider and translate its outcome into actions. The state layer's
 * entire relationship with extraction: one `extract` call, progress forwarded,
 * result or error stored.
 *
 * Never rejects — a provider failure becomes an `extraction/failed` action,
 * because an unhandled rejection is not a state the UI can render. Assumes the
 * caller has already dispatched `document/selected` or `extraction/restarted`.
 *
 * Exported (and dependency-injected) so the full happy path and the failure
 * path can be asserted against a fake provider and a recording dispatch,
 * without React.
 */
export async function runExtraction(
  file: File,
  dispatch: (action: DocumentAction) => void,
  deps: ExtractionRunDeps
): Promise<void> {
  const onProgress: ExtractionProgressCallback = (step) => {
    dispatch(extractionProgressed(step));
  };

  try {
    // Inside the try: resolving an unregistered provider id throws an
    // `ExtractionError` too, and that belongs on the error screen like any
    // other failure.
    const extraction = await deps.getProvider().extract(file, onProgress);
    dispatch(extractionSucceeded(extraction));
  } catch (error) {
    const failure = toExtractionFailure(error);
    dispatch(extractionFailed(failure.code, failure.message));
  }
}
