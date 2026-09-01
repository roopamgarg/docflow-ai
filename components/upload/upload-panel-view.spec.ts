import { describe, it, expect } from "vitest";

import { uploadPanelView } from "./upload-panel-view";

/** The panel's inputs, with the common case as the default. */
const view = (overrides: Partial<Parameters<typeof uploadPanelView>[0]> = {}) =>
  uploadPanelView({
    hasDocument: true,
    phase: "ready",
    ranHere: false,
    ...overrides,
  });

describe("uploadPanelView", () => {
  it("shows the dropzone with no document loaded", () => {
    expect(view({ hasDocument: false, phase: "idle" })).toBe("dropzone");
  });

  it("shows the dropzone when a document is loaded but the run is idle", () => {
    expect(view({ phase: "idle" })).toBe("dropzone");
  });

  it("shows the processing card while extraction is working", () => {
    expect(view({ phase: "working" })).toBe("processing");
  });

  it("shows the processing card on completion of a run watched here", () => {
    expect(view({ phase: "ready", ranHere: true })).toBe("processing");
  });

  // The reported bug: `Home` from `/review` mounts the panel with a finished
  // document, and mounting the processing card would navigate straight back.
  it("shows the dropzone when a ready document is re-entered from another screen", () => {
    expect(view({ phase: "ready", ranHere: false })).toBe("dropzone");
  });

  it("shows the error card for a failed run", () => {
    expect(view({ phase: "error", ranHere: true })).toBe("processing");
  });

  it("shows the error card on re-entry too, so `Try again` stays reachable", () => {
    expect(view({ phase: "error", ranHere: false })).toBe("processing");
  });

  // An `unsupported_media` rejection fails with nothing loaded; the dropzone's
  // own inline message is already on screen and a filename-less card is worse.
  it("shows the dropzone for a failure with no document loaded", () => {
    expect(view({ hasDocument: false, phase: "error" })).toBe("dropzone");
  });

  it("never shows the processing card without a document, whatever the phase", () => {
    for (const phase of ["idle", "working", "ready", "error"] as const) {
      for (const ranHere of [true, false]) {
        expect(view({ hasDocument: false, phase, ranHere })).toBe("dropzone");
      }
    }
  });
});
