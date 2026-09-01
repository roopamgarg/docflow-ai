"use client";

/**
 * The upload card: the one control that starts the whole product.
 *
 * View layer. Its only outward call is `startExtraction(file)` — it neither
 * reads a document nor knows what a provider is. The file check it renders is a
 * UX affordance and lives in `./validate-upload`; the real gate is the
 * provider's own `validateFile`.
 *
 * `Try Demo Invoice` goes through that same one call. It fetches the shipped
 * `demo-invoice.png`, wraps the bytes in a `File` and hands it over, so the
 * demo is an ordinary image upload: the same OCR route, the same real
 * confidences, the same highlights. No branch in state, no branch in the
 * extraction service, nothing that knows a demo exists.
 */

import { useCallback, useId, useRef, useState, type DragEvent } from "react";
import { CloudUpload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HELPER_TEXT, rejectUpload } from "@/components/upload/validate-upload";
import { useDocument } from "@/lib/document-context";
import { SUPPORTED_MEDIA_TYPES } from "@/lib/extraction/providers/local";
import { cn } from "@/lib/utils";

/**
 * The demo document, vendored into `public/` — a same-origin static asset, not
 * a network call. Generated from `components/viewer/DemoInvoice.tsx`; the
 * command that regenerates it is in `tasks/015-demo-invoice/status.md`.
 */
const DEMO_INVOICE_URL = "/demo-invoice.png";
/** The filename the demo document reports. Shown on the processing card. */
const DEMO_INVOICE_NAME = "demo-invoice.png";

export function UploadDropzone({ className }: { className?: string }) {
  const { startExtraction } = useDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  /** True while the demo asset is being read, so the click cannot double-fire. */
  const [loadingDemo, setLoadingDemo] = useState(false);

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return;

      const reason = rejectUpload(file);
      setRejection(reason);
      // A rejection stays on this screen and says so inline. No dialog, no
      // navigation: the human's next move is picking another file.
      if (reason === null) void startExtraction(file);
    },
    [startExtraction],
  );

  const startDemo = useCallback(async () => {
    setRejection(null);
    setLoadingDemo(true);

    let file: File;
    try {
      const response = await fetch(DEMO_INVOICE_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      file = new File([await response.blob()], DEMO_INVOICE_NAME, {
        type: "image/png",
      });
    } catch {
      // The asset is part of the build, so this is a broken deploy rather than
      // anything the human did — reported inline all the same, next to the
      // control they pressed, and the dropzone above still works.
      setRejection("The demo invoice could not be loaded. Choose a file instead.");
      setLoadingDemo(false);
      return;
    }

    // From here the demo is indistinguishable from a drop: the same entry point,
    // and the same card replacing this one while it runs.
    setLoadingDemo(false);
    await startExtraction(file);
  }, [startExtraction]);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files[0]);
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    // Both handlers must preventDefault or the browser navigates to the file.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    // Dragging across a child fires `dragleave` on the way out of it; only a
    // pointer that has actually left the zone should clear the highlight.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragging(false);
  };

  return (
    <div className={cn("flex w-full flex-col items-center gap-4", className)}>
      {/*
        A `<label>`, not a `role="button"` div: it makes the whole card open the
        picker with no script and no invented semantics, and it names the input
        for a screen reader. Per the HTML spec, clicks on interactive descendants
        (the button below) do not activate the label, so nothing double-fires.
      */}
      <label
        htmlFor={inputId}
        data-dragging={dragging}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center gap-5 rounded-shell border-2 border-dashed bg-surface px-6 py-12 text-center shadow-card transition-colors sm:px-12 sm:py-16",
          // The input itself is visually hidden, so its focus ring is drawn
          // here — the keyboard user sees what they are about to activate.
          "has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/60 hover:bg-inset/50",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-14 items-center justify-center rounded-shell transition-colors",
            dragging
              ? "bg-primary text-primary-foreground"
              : "bg-inset text-muted-foreground",
          )}
        >
          <CloudUpload className="size-7" />
        </span>

        <span className="flex flex-col gap-1.5">
          <span className="text-title font-semibold text-foreground">
            {dragging ? "Drop to start extracting" : "Drop your document here"}
          </span>
          <span className="text-body text-muted-foreground">
            or choose a file from your computer
          </span>
        </span>

        {/*
          Interactive content inside a label is exempt from label activation, so
          this forwards to the input itself rather than double-firing.

          Hidden from assistive tech and from the tab order on purpose: it is a
          second affordance for the same input, which is already focusable and
          named by this label. Exposing both would put two identical controls a
          keystroke apart.
        */}
        <Button
          type="button"
          size="lg"
          onClick={() => inputRef.current?.click()}
          tabIndex={-1}
          aria-hidden
        >
          Choose File
        </Button>

        <span className="text-label text-muted-foreground">{HELPER_TEXT}</span>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={SUPPORTED_MEDIA_TYPES.join(",")}
          className="sr-only"
          onChange={(event) => {
            accept(event.target.files?.[0]);
            // Let the same file be picked again after a rejection or a reset.
            event.target.value = "";
          }}
        />
      </label>

      {/*
        `role="alert"` because the rejection is the answer to something the human
        just did, and the pointer that dropped the file is nowhere near this text.
      */}
      {rejection === null ? null : (
        <p role="alert" className="text-body font-medium text-destructive">
          {rejection}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={loadingDemo}
        onClick={() => void startDemo()}
      >
        Try Demo Invoice
      </Button>
    </div>
  );
}
