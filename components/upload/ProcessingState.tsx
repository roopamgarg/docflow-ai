"use client";

/**
 * The processing card: what the human looks at while extraction runs, and where
 * a failed run offers them a way out.
 *
 * View layer, and deliberately dumb. It holds no timer, no interval and no
 * animation of its own progress — every number and every tick on screen comes
 * from `status` in `useDocument()`, projected by the pure functions in
 * `./processing-steps`. If this file ever needs a `setTimeout` to look right,
 * the provider has stopped reporting and that is the bug to fix.
 *
 * Rendered by `UploadPanel` in place of the upload card, so it does not own a
 * route: the human stays on the landing page until there is something to review.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  PROCESSING_STEPS,
  processingErrorMessage,
  processingPercent,
  processingStepStates,
  type ProcessingStep,
  type ProcessingStepState,
} from "@/components/upload/processing-steps";
import { useDocument } from "@/lib/document-context";
import { cn } from "@/lib/utils";

/** Sits above the specific message on the error card. */
const ERROR_HEADLINE = "We couldn't process that document";

export function ProcessingState({ className }: { className?: string }) {
  const { doc, status, retry, reset } = useDocument();
  const router = useRouter();

  const ready = status.phase === "ready";

  /**
   * Completion is a navigation, and navigation cannot happen during render.
   *
   * `replace`, not `push`: the landing page would send a `ready` document
   * straight back to `/review`, so a history entry pointing at it is a loop the
   * back button cannot escape. Matches the guards on `/review` and `/success`.
   */
  useEffect(() => {
    if (ready) router.replace("/review");
  }, [ready, router]);

  // Only reachable through `UploadPanel`, which requires a document — but the
  // card is meaningless without a filename, so it says so in types too.
  if (!doc) return null;

  const failure = status.phase === "error" ? status : null;
  const stepStates = processingStepStates(status);
  const percent = processingPercent(status);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-6 rounded-shell bg-surface px-6 py-8 shadow-card sm:px-10 sm:py-10",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          aria-hidden
          className={cn(
            "flex size-12 items-center justify-center rounded-shell",
            failure
              ? "bg-destructive/10 text-destructive"
              : "bg-inset text-primary",
          )}
        >
          {failure ? (
            <TriangleAlert className="size-6" />
          ) : (
            <FileText className="size-6" />
          )}
        </span>

        <h2 className="text-title font-semibold text-foreground">
          {failure ? ERROR_HEADLINE : "Analyzing your document..."}
        </h2>

        {/*
          The filename stays on screen in every state — working, failed and the
          instant before the review screen takes over — so the human never has
          to wonder which file this is about.
        */}
        <p className="max-w-full truncate text-body text-muted-foreground">
          {doc.name}
        </p>
      </div>

      {failure ? (
        <div className="flex flex-col items-center gap-5">
          {/*
            `role="alert"`: the failure is the answer to something the human did
            a while ago and their attention is not on this line.
          */}
          <p
            role="alert"
            className="max-w-md text-center text-body text-foreground"
          >
            {processingErrorMessage(failure.code, failure.message)}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {/* A genuine re-run of the same bytes, not a page reload. */}
            <Button type="button" size="lg" onClick={() => void retry()}>
              <RotateCcw aria-hidden className="size-4" />
              Try again
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={reset}
            >
              Choose a different file
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Progress
              value={percent}
              aria-label="Extraction progress"
              className="h-1.5"
            />
            {/*
              The true whole-run ratio, rounded for display and nothing else.
              Announced politely so a screen reader hears the run advance
              without being interrupted on every tick.
            */}
            <p
              aria-live="polite"
              className="text-label text-muted-foreground tabular-figures"
            >
              {percent}% complete
            </p>
          </div>

          <ol className="flex flex-col gap-3.5">
            {PROCESSING_STEPS.map((step, index) => (
              <ProcessingStepRow
                key={step}
                label={step}
                state={stepStates[index]}
              />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

/**
 * One checklist row: a check when the step's work is finished, a filled dot
 * while it runs, a hollow dot before it starts.
 */
function ProcessingStepRow({
  label,
  state,
}: {
  label: ProcessingStep;
  state: ProcessingStepState;
}) {
  return (
    <li
      // `step` is the closest accurate role-less signal for "this is the one in
      // progress"; assistive tech reads it alongside the polite percentage.
      aria-current={state === "active" ? "step" : undefined}
      className="flex items-center gap-3"
    >
      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-4xl transition-colors",
          state === "done" && "bg-primary text-primary-foreground",
          state === "active" && "bg-inset",
          state === "pending" && "border border-border",
        )}
      >
        {state === "done" ? (
          <Check className="size-3.5" strokeWidth={3} />
        ) : state === "active" ? (
          <span className="size-2 animate-pulse rounded-4xl bg-primary" />
        ) : (
          <span className="size-2 rounded-4xl bg-track" />
        )}
      </span>

      <span
        className={cn(
          "text-body",
          state === "pending" ? "text-muted-foreground" : "text-foreground",
          state === "active" && "font-medium",
        )}
      >
        {label}
      </span>

      {/* Named for assistive tech, since the icon carries the state visually. */}
      <span className="sr-only">
        {state === "done" ? "complete" : state === "active" ? "in progress" : "not started"}
      </span>
    </li>
  );
}
