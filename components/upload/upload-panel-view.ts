/**
 * Which card the landing page's upload slot shows — the one judgement call in
 * `UploadPanel`, extracted so it can be asserted without a renderer.
 *
 * The subtlety is `ready`. A finished document means two different things
 * depending on how the human got here:
 *
 * - **A run that just completed on this screen.** They watched the checklist
 *   fill in, so the processing card stays up and `ProcessingState`'s effect
 *   performs the hop to `/review` (ticket 011: *reaching* `ready` navigates).
 * - **A re-entry.** They pressed `Home` in the icon rail from `/review` or
 *   `/success` and the document is still in state. The landing page is what
 *   they asked for, so it shows the dropzone — and, crucially, does **not**
 *   mount the processing card, whose navigation would otherwise replace them
 *   straight back to the screen they just left. That bounce is what made `Home`
 *   look like a dead link.
 *
 * The two are indistinguishable from `status` alone: `ready` is `ready`. So the
 * caller supplies `ranHere` — whether a run was observed during this mount.
 */

import type { DocumentStatus } from "@/lib/document-state";

/** The upload slot's two cards. */
export type UploadPanelView = "dropzone" | "processing";

export function uploadPanelView({
  hasDocument,
  phase,
  ranHere,
}: {
  /**
   * Whether a document is in state. The prerequisite, rather than merely a
   * non-`idle` status: an `unsupported_media` failure is reported with nothing
   * loaded (see `startExtraction`), and a processing card with no filename
   * would be worse than the dropzone's own inline rejection, which is already
   * on screen.
   */
  hasDocument: boolean;
  phase: DocumentStatus["phase"];
  /** Whether extraction was seen running during this mount of the panel. */
  ranHere: boolean;
}): UploadPanelView {
  if (!hasDocument) return "dropzone";

  switch (phase) {
    case "working":
      return "processing";
    // The failure card and its `Try again` belong to the screen the run was
    // started from, however the human arrived at it.
    case "error":
      return "processing";
    case "ready":
      return ranHere ? "processing" : "dropzone";
    case "idle":
      return "dropzone";
  }
}
