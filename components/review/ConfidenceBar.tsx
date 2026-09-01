/**
 * `Confidence: 98%` over a 4px meter, tinted by the field's tier.
 *
 * The tier comes from `tierFor` in `lib/extraction/confidence.ts` and nothing
 * else. This component must never compare a confidence against a threshold of
 * its own: the card treatment reads the same helper, and a second copy of the
 * thresholds is exactly how the bar and the card end up disagreeing about which
 * fields need attention.
 *
 * The meter is a plain pair of divs rather than the shared `Progress`
 * primitive, whose indicator is `bg-primary` by design — a confidence bar needs
 * a per-tier fill, and overriding a primitive's internals is worse than
 * composing the two tokens (`bg-track` + the tier fill) directly. It is
 * `aria-hidden` because the percentage beside it is the same information in
 * text, which is what a screen reader should hear.
 */

import { TriangleAlert } from "lucide-react";

import { confidencePercent, confidenceTone } from "@/components/review/field-display";
import { tierFor } from "@/lib/extraction/confidence";
import { cn } from "@/lib/utils";

export interface ConfidenceBarProps {
  /** Composed confidence in `0..1`, straight off the field. */
  confidence: number;
  className?: string;
}

export function ConfidenceBar({ confidence, className }: ConfidenceBarProps) {
  const tier = tierFor(confidence);
  const tone = confidenceTone(tier);
  const percent = confidencePercent(confidence);

  return (
    <div className={cn("flex w-full flex-col items-end gap-1.5", className)}>
      <p
        className={cn(
          "flex items-center gap-1 text-label whitespace-nowrap tabular-figures",
          tone.percent,
        )}
      >
        {/*
          The one icon in the panel, next to the number it qualifies: a low
          score is the state a reviewer must not skim past, and the amber edge
          alone is easy to miss on a long list.
        */}
        {tier === "low" ? (
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
        ) : null}
        Confidence: {percent}%
      </p>

      <div aria-hidden className="h-1 w-full overflow-hidden rounded-4xl bg-track">
        <div
          className={cn("h-full rounded-4xl transition-all", tone.bar)}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
