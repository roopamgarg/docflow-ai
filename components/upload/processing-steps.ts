/**
 * The processing card's pure projection of run state — phase and ratio in,
 * step states, a percentage and one line of error copy out.
 *
 * Pure and React-free on purpose. `ProcessingState` is then nothing but markup
 * over these three functions, and the only judgement calls in the ticket (which
 * step a phase means, which failures get their own words) can be asserted
 * directly. It is also the one place that could fake progress, and it has no
 * clock to fake it with.
 */

import { ExtractionError, type ExtractionErrorCode } from "@/lib/extraction/errors";
import type { DocumentStatus } from "@/lib/document-state";
import type { ExtractionPhase } from "@/lib/extraction/provider";

/* ------------------------------------------------------------------ *
 * The four steps
 * ------------------------------------------------------------------ */

/** The checklist, in the order the work actually happens. */
export const PROCESSING_STEPS = [
  "Upload document",
  "Detect document structure",
  "Extract fields",
  "Prepare for review",
] as const;

export type ProcessingStep = (typeof PROCESSING_STEPS)[number];

/** Check, filled dot, hollow dot. */
export type ProcessingStepState = "done" | "active" | "pending";

/**
 * Which step each provider phase is working on.
 *
 * There are three phases and four steps, so the mapping has to justify itself:
 *
 * - **`Upload document` (0)** has no phase because it has no work left. This
 *   card only renders with a document already in state — the file was read into
 *   a `File`, given an object URL and handed to the provider before the first
 *   progress report exists. Marking it `done` from the first frame is the
 *   honest reading; giving it a phase would mean pretending to still be doing
 *   something that finished.
 * - **`Detect document structure` (1) ← `reading`.** This is literally what
 *   `reading` does: decode the bytes, and for a PDF decide whether its text
 *   layer is real text or a scan that has to be rasterised
 *   (`isTextLayerUsable`). The route decision *is* structure detection.
 * - **`Extract fields` (2) ← `ocr`.** Recognising the words off the page.
 * - **`Prepare for review` (3) ← `matching`.** The rule pass that turns words
 *   into the field model the review screen shows.
 *
 * The digital-PDF route skips `ocr` entirely (its text layer already holds the
 * words), so step 2 flips from `pending` straight to `done` when the phase
 * becomes `matching`. That is accurate rather than a gap: by then the text
 * genuinely has been extracted, it just came from the text layer instead of a
 * recognition pass. No step is ever marked `done` before the phase that owns it
 * has been left behind.
 */
const ACTIVE_STEP_BY_PHASE: Record<ExtractionPhase, number> = {
  reading: 1,
  ocr: 2,
  matching: 3,
};

/**
 * One state per entry in `PROCESSING_STEPS`, aligned by index.
 *
 * Total over every status so the component never has to guard: `idle` has done
 * nothing, `ready` has done everything, and a failure reports only what it can
 * stand behind — the upload, since the card cannot render without a document.
 * A failed run has no `active` step because nothing is running any more.
 */
export function processingStepStates(
  status: DocumentStatus
): ProcessingStepState[] {
  if (status.phase === "ready") return PROCESSING_STEPS.map(() => "done");

  if (status.phase === "working") {
    const active = ACTIVE_STEP_BY_PHASE[status.step.phase];
    return PROCESSING_STEPS.map((_step, index) =>
      index < active ? "done" : index === active ? "active" : "pending"
    );
  }

  // `error`: the run stopped somewhere we are not told about, so claim only the
  // upload. `idle`: nothing has happened at all.
  const uploaded = status.phase === "error";
  return PROCESSING_STEPS.map((_step, index) =>
    index === 0 && uploaded ? "done" : "pending"
  );
}

/* ------------------------------------------------------------------ *
 * The bar
 * ------------------------------------------------------------------ */

/**
 * The bar's percentage, `0..100`, straight off the provider's whole-run ratio.
 *
 * No easing, no interpolation and no clock: the provider guarantees the ratio is
 * monotonic and ends at exactly 1, so the only work here is scaling it. The
 * clamp and the finite check are defence against a bad provider, not smoothing.
 */
export function processingPercent(status: DocumentStatus): number {
  if (status.phase === "ready") return 100;
  if (status.phase !== "working") return 0;

  const { ratio } = status.step;
  if (!Number.isFinite(ratio)) return 0;
  return Math.round(Math.min(Math.max(ratio, 0), 1) * 100);
}

/* ------------------------------------------------------------------ *
 * Error copy
 * ------------------------------------------------------------------ */

/**
 * The one failure worth its own sentence.
 *
 * `no_text_found` is the likeliest real-world outcome — a phone photo, a fax, a
 * scan at 100 dpi — and the generic "we couldn't find any readable text in that
 * document" tells the human nothing they can act on. This names the fix.
 */
export const NO_TEXT_FOUND_MESSAGE =
  "We couldn't find any readable text. Try a clearer scan.";

/** Codes whose UI copy deliberately differs from the thrown message. */
const MESSAGE_OVERRIDES: Partial<Record<ExtractionErrorCode, string>> = {
  no_text_found: NO_TEXT_FOUND_MESSAGE,
};

/**
 * What the error card says.
 *
 * Every other code already carries usable copy from `ExtractionError`, so the
 * thrown message is preferred over restating the vocabulary here — a second copy
 * of it would drift. A blank message falls back to that code's default rather
 * than rendering an empty paragraph.
 */
export function processingErrorMessage(
  code: ExtractionErrorCode,
  message: string
): string {
  const override = MESSAGE_OVERRIDES[code];
  if (override !== undefined) return override;

  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : new ExtractionError(code).message;
}
