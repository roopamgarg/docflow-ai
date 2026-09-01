"use client";

/**
 * The one client island on the landing page: the upload card, or the processing
 * card that replaces it in place.
 *
 * It exists so `app/page.tsx` can stay a server component. The switch itself is
 * pure and lives in `./upload-panel-view`, so neither card has to know about the
 * other's state — and so the `ready` case, which is the difference between a run
 * completing here and the human pressing `Home` with a finished document, is
 * written down somewhere it can be tested.
 */

import { useState } from "react";

import { ProcessingState } from "@/components/upload/ProcessingState";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { uploadPanelView } from "@/components/upload/upload-panel-view";
import { useDocument } from "@/lib/document-context";

export function UploadPanel({ className }: { className?: string }) {
  const { doc, status } = useDocument();

  /**
   * Whether extraction has been seen running during this mount.
   *
   * `ready` on arrival is a re-entry from the icon rail and belongs on the
   * dropzone; `ready` after a `working` phase is a completion and belongs on the
   * processing card, which then navigates to `/review`. Only the history of this
   * mount separates them, and it is one-way: once a run has been watched here,
   * its completion is this screen's to hand off.
   */
  const [ranHere, setRanHere] = useState(false);

  // Adjusting state during render, the way React documents it — guarded by the
  // value that triggers it, so *this* render already shows the processing card.
  // An effect would render one frame of dropzone over a live run.
  if (status.phase === "working" && !ranHere) setRanHere(true);

  const view = uploadPanelView({
    hasDocument: doc !== null,
    phase: status.phase,
    ranHere,
  });

  if (view === "dropzone") return <UploadDropzone className={className} />;

  return <ProcessingState className={className} />;
}
