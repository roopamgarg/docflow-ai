"use client";

/**
 * The client state layer: one React context carrying the in-flight document,
 * its fields, the run status, the human's edits and approvals, and the active
 * field that links the two review columns.
 *
 * There is no persistence by design — nothing survives a refresh, and the
 * `/review` and `/success` guards send a reloaded tab back to the landing page.
 *
 * This module holds NO extraction logic. Every transition lives in the pure
 * reducer in `./document-state`, and the only thing done here that a reducer
 * cannot do is the side effects: `URL.createObjectURL` / `revokeObjectURL`, and
 * one `provider.extract(...)` call resolved through the registry.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import {
  approvedFieldCount,
  documentKindFor,
  documentReducer,
  documentSelected,
  extractionFailed,
  extractionRestarted,
  fieldActivated,
  fieldApprovalToggled,
  fieldUpdated,
  allFieldsApproved,
  initialDocumentState,
  runExtraction,
  stateReset,
  type DocumentAction,
  type DocumentState,
} from "./document-state";
import { ExtractionError } from "./extraction/errors";
import type { ExtractionProvider } from "./extraction/provider";
import { getExtractionProvider } from "./extraction/providers/registry";

/** State plus its one derived value plus the actions. Flat, so components destructure. */
export interface DocumentContextValue extends DocumentState {
  /** Derived: how many of `fields` the human has approved. */
  approvedCount: number;
  /** Accept a file, show it, and run the provider over it. */
  startExtraction: (file: File) => Promise<void>;
  /** Re-run the provider over the document already loaded. */
  retry: () => Promise<void>;
  /** Record a human edit. Keeps `originalValue`, and keeps any approval. */
  updateField: (id: string, value: string) => void;
  toggleApproval: (id: string) => void;
  /** Approve every field and the document with them. */
  approveAll: () => void;
  /** Point the document highlight at a field, or at nothing. */
  setActiveField: (id: string | null) => void;
  /** Discard the document and go back to the empty state. */
  reset: () => void;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

export interface DocumentProviderProps {
  children: ReactNode;
  /**
   * Test seam: the extraction provider `startExtraction` and `retry` use.
   * Defaults to the registry's default provider, resolved lazily so no OCR
   * engine is constructed until a document actually arrives.
   */
  provider?: ExtractionProvider;
}

export function DocumentProvider({ children, provider }: DocumentProviderProps) {
  const [state, dispatch] = useReducer(documentReducer, initialDocumentState);

  /** The object URL currently handed to the viewer, so it can be revoked once. */
  const urlRef = useRef<string | null>(null);
  /**
   * Identifies the newest run. A provider that finishes after a reset (or after
   * a second file was dropped) reports into a dead run, and its actions are
   * dropped rather than resurrecting a document the human moved on from.
   */
  const runIdRef = useRef(0);

  const revokeCurrentUrl = useCallback(() => {
    if (urlRef.current !== null) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  // Unmount: the last document's URL would otherwise stay alive for the life of
  // the page. Reads the ref at cleanup time so it needs no dependencies and
  // never re-registers.
  useEffect(() => revokeCurrentUrl, [revokeCurrentUrl]);

  const resolveProvider = useCallback(
    () => provider ?? getExtractionProvider(),
    [provider]
  );

  /** Run the provider, ignoring its reports if a newer run has started. */
  const runNewestExtraction = useCallback(
    async (file: File) => {
      runIdRef.current += 1;
      const runId = runIdRef.current;
      const guardedDispatch = (action: DocumentAction) => {
        if (runIdRef.current === runId) dispatch(action);
      };
      await runExtraction(file, guardedDispatch, {
        getProvider: resolveProvider,
      });
    },
    [resolveProvider]
  );

  const startExtraction = useCallback(
    async (file: File) => {
      const kind = documentKindFor(file);

      // A new file replaces the old one either way, so the old URL goes now.
      revokeCurrentUrl();

      if (kind === null) {
        // Nothing we can display: report it as the provider would and keep the
        // human on the landing screen rather than loading an unviewable doc.
        runIdRef.current += 1;
        const error = new ExtractionError("unsupported_media");
        dispatch(stateReset());
        dispatch(extractionFailed(error.code, error.message));
        return;
      }

      const url = URL.createObjectURL(file);
      urlRef.current = url;
      dispatch(documentSelected({ kind, file, url, name: file.name }));
      await runNewestExtraction(file);
    },
    [revokeCurrentUrl, runNewestExtraction]
  );

  const retry = useCallback(async () => {
    const doc = state.doc;
    if (!doc) return;
    // Same file, same URL — the viewer must not flicker while we re-read it.
    dispatch(extractionRestarted());
    await runNewestExtraction(doc.file);
  }, [runNewestExtraction, state.doc]);

  const updateField = useCallback((id: string, value: string) => {
    dispatch(fieldUpdated(id, value));
  }, []);

  const toggleApproval = useCallback((id: string) => {
    dispatch(fieldApprovalToggled(id));
  }, []);

  const approveAll = useCallback(() => {
    dispatch(allFieldsApproved());
  }, []);

  const setActiveField = useCallback((id: string | null) => {
    dispatch(fieldActivated(id));
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    revokeCurrentUrl();
    dispatch(stateReset());
  }, [revokeCurrentUrl]);

  const approvedCount = useMemo(
    () => approvedFieldCount(state.fields),
    [state.fields]
  );

  const value = useMemo<DocumentContextValue>(
    () => ({
      ...state,
      approvedCount,
      startExtraction,
      retry,
      updateField,
      toggleApproval,
      approveAll,
      setActiveField,
      reset,
    }),
    [
      state,
      approvedCount,
      startExtraction,
      retry,
      updateField,
      toggleApproval,
      approveAll,
      setActiveField,
      reset,
    ]
  );

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
}

/**
 * Read the document state. Throws outside a `DocumentProvider` rather than
 * handing back a hollow default, because a screen silently rendering the empty
 * state is the harder bug to find.
 */
export function useDocument(): DocumentContextValue {
  const value = useContext(DocumentContext);
  if (value === null) {
    throw new Error("useDocument must be used inside a <DocumentProvider>.");
  }
  return value;
}
