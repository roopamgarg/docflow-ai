/**
 * The app's core signal: how confident we are in an extracted value, and which
 * tier that lands in. Pure functions, defined in exactly one place so the
 * confidence bar and the card styling can never disagree.
 */

/**
 * How the rule engine found a value — the interpretation half of confidence.
 *
 * The character half comes from the source (`Word.confidence`). A PDF text
 * layer reports `1` for every word, so for `pdf-text` documents the composed
 * confidence reduces to match strength alone. That is correct: the characters
 * are exact and only the interpretation is in doubt.
 */
export const MatchStrength = {
  /** Explicit label matched, value adjacent, value matches the pattern. */
  LABEL_ADJACENT_PATTERN: 1.0,
  /** Label matched but the value only pattern-inferred, or pattern-only. */
  LABEL_OR_PATTERN_ONLY: 0.85,
  /** Positional heuristic only, e.g. vendor name from page position. */
  POSITIONAL_HEURISTIC: 0.6,
  /** Not found. Yields a 0-confidence field, never a thrown error. */
  NOT_FOUND: 0.0,
} as const;

export type MatchStrength = (typeof MatchStrength)[keyof typeof MatchStrength];

/**
 * Compose a field's confidence from its evidence:
 *
 *     confidence = mean(word confidence) * matchStrength
 *
 * Both inputs are expected in `0..1`, so the result is too.
 *
 * @param words The words the value was read from. Only `confidence` is used,
 *   so callers may pass full `Word`s or bare `{ confidence }` records.
 * @param matchStrength How the rule found it — see `MatchStrength`.
 * @returns `0` when `words` is empty. An empty match is a not-found field, and
 *   a not-found field is a valid result, so this must never return `NaN`
 *   (which would render as `NaN%` and defeat every downstream comparison).
 */
export function composeConfidence(
  words: readonly { confidence: number }[],
  matchStrength: number
): number {
  if (words.length === 0) return 0;
  const total = words.reduce((sum, word) => sum + word.confidence, 0);
  return (total / words.length) * matchStrength;
}

/** The display tiers. `not-found` is a deliberate state, not an error. */
export type ConfidenceTier = "high" | "medium" | "low" | "not-found";

/**
 * Inclusive lower bounds. A confidence >= `HIGH` is high; >= `MEDIUM` (but
 * below `HIGH`) is medium; anything above zero below that is low.
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.95,
  MEDIUM: 0.8,
} as const;

/**
 * Bucket a composed confidence for display.
 *
 * Boundaries are inclusive at the bottom of each tier, which fixes the
 * ambiguous cases exactly:
 *
 * | confidence | tier        |
 * |------------|-------------|
 * | `1`        | `high`      |
 * | `0.95`     | `high`      |
 * | `0.949`    | `medium`    |
 * | `0.8`      | `medium`    |
 * | `0.799`    | `low`       |
 * | `0`        | `not-found` |
 *
 * A non-finite or negative input cannot arise from `composeConfidence` with
 * in-range inputs; it is treated as `not-found` so a bad value degrades to the
 * "please enter this yourself" state rather than rendering as high confidence.
 */
export function tierFor(confidence: number): ConfidenceTier {
  if (!Number.isFinite(confidence) || confidence <= 0) return "not-found";
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return "high";
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return "medium";
  return "low";
}
