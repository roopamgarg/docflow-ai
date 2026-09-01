/**
 * The review panel's pure display helpers: the tier → styling map, the
 * percentage rounding, the field grouping and the progress copy.
 *
 * Extracted from the components so the mapping is one table rather than a set
 * of ternaries scattered across the cards. Every tier decision starts from
 * `tierFor` in `lib/extraction/confidence.ts` — this module never compares a
 * confidence against a threshold of its own, which is what keeps the bar and
 * the card treatment from drifting apart.
 *
 * No React, no DOM, no state.
 */

import type { ConfidenceTier } from "@/lib/extraction/confidence";
import { LINE_ITEM_ID_PREFIX } from "@/lib/extraction/fields";
import type { ExtractedField } from "@/lib/extraction/types";

/**
 * A confidence as a whole percentage for display.
 *
 * Clamped to `0..100` and never `NaN`: a percentage is read out loud on the
 * card, so a non-finite confidence must degrade to `0%` (the "please enter
 * this yourself" state) rather than render as `NaN%`.
 */
export function confidencePercent(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.round(Math.min(Math.max(confidence, 0), 1) * 100);
}

/** The class names one tier contributes to a field card. */
export interface ConfidenceTone {
  /** Fill of the confidence bar. */
  bar: string;
  /** Extra classes on the card itself. */
  card: string;
  /** Colour of the `Confidence: n%` line. */
  percent: string;
}

/**
 * The tier treatments, straight from the design language: the three found tiers
 * are one hue at three intensities rather than three colours, so the panel
 * reads as a hierarchy instead of a traffic light.
 *
 * `not-found` carries the same amber edge as `low` but an empty track — there
 * is no confidence to draw — and the card says so in words with an input ready.
 */
export const CONFIDENCE_TONES: Record<ConfidenceTier, ConfidenceTone> = {
  high: {
    bar: "bg-primary",
    card: "",
    percent: "text-muted-foreground",
  },
  medium: {
    bar: "bg-primary/45",
    card: "",
    percent: "text-muted-foreground",
  },
  low: {
    bar: "bg-warn",
    // The amber left edge is the panel-scanning signal: a reviewer with ten
    // cards on screen sees which ones need them without reading a number.
    card: "border-l-2 border-l-warn",
    percent: "text-warn font-medium",
  },
  "not-found": {
    bar: "bg-transparent",
    card: "border-l-2 border-l-warn",
    percent: "text-warn font-medium",
  },
};

export function confidenceTone(tier: ConfidenceTier): ConfidenceTone {
  return CONFIDENCE_TONES[tier];
}

/** Whether a field is one of the line-item rows rather than a scalar. */
export function isLineItemField(field: Pick<ExtractedField, "id">): boolean {
  return field.id.startsWith(`${LINE_ITEM_ID_PREFIX}.`);
}

/**
 * Split the flat review model back into the two groups the panel renders.
 *
 * `toFields` emits the scalars first and the line items after, but this splits
 * by id rather than by position so the panel cannot silently mis-group if that
 * order ever changes.
 */
export function groupReviewFields(fields: readonly ExtractedField[]): {
  scalars: ExtractedField[];
  lineItems: ExtractedField[];
} {
  const scalars: ExtractedField[] = [];
  const lineItems: ExtractedField[] = [];
  for (const field of fields) {
    (isLineItemField(field) ? lineItems : scalars).push(field);
  }
  return { scalars, lineItems };
}

/** The footer's count, e.g. `3 of 6 fields reviewed`. */
export function reviewedSummary(approvedCount: number, total: number): string {
  return `${approvedCount} of ${total} fields reviewed`;
}

/**
 * The footer bar's percentage. `0` for an empty field list rather than `NaN`,
 * which would otherwise reach the progress bar as a bad transform.
 */
export function reviewedPercent(approvedCount: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((approvedCount / total) * 100);
}
