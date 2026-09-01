"use client";

/**
 * The one client island on the landing page: the upload card, or the processing
 * card that replaces it in place.
 *
 * It exists so `app/page.tsx` can stay a server component. The switch is a
 * single read of `useDocument()` and lives here rather than inside either card,
 * so neither of them has to know about the other's state.
 */

import { ProcessingState } from "@/components/upload/ProcessingState";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { useDocument } from "@/lib/document-context";

export function UploadPanel({ className }: { className?: string }) {
  const { doc, status } = useDocument();

  /**
   * A document is the prerequisite, not merely a non-idle status: an
   * `unsupported_media` failure is reported with nothing loaded (see
   * `startExtraction`), and a processing card with no filename would be worse
   * than the dropzone's own inline rejection, which is already on screen.
   */
  if (!doc || status.phase === "idle") {
    return <UploadDropzone className={className} />;
  }

  return <ProcessingState className={className} />;
}
