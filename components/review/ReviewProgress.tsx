"use client";

/**
 * The panel's footer: how much of the document has been reviewed, and the one
 * button that finishes the job.
 *
 * `Approve Document` is the panel's primary action throughout, not something
 * that unlocks once every card has been approved individually. Field-by-field
 * approval is for the values a reviewer wants to single out; a reviewer who has
 * read the document and is happy with it presses this and is done. So it is
 * always enabled, and with fields still outstanding it approves the remainder
 * through `approveAll` — one dispatch that both approves every field and sets
 * `docApproved`, because those two are one gesture and a state where every
 * field is approved but the document is not would be a lie on the next screen.
 *
 * `push`, not `replace`: /success offers a way back to the review screen, so
 * the history entry is wanted here (unlike the guard redirects, which must not
 * leave a loop behind).
 */

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { reviewedPercent, reviewedSummary } from "@/components/review/field-display";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useDocument } from "@/lib/document-context";
import { cn } from "@/lib/utils";

export function ReviewProgress({ className }: { className?: string }) {
  const { fields, approvedCount, approveAll } = useDocument();
  const router = useRouter();

  const total = fields.length;
  const percent = reviewedPercent(approvedCount, total);

  const approveDocument = () => {
    approveAll();
    router.push("/success");
  };

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex flex-col gap-1.5">
        <p className="text-label text-muted-foreground tabular-figures">
          {reviewedSummary(approvedCount, total)}
        </p>
        <Progress
          value={percent}
          aria-label="Fields reviewed"
          className="h-1.5"
        />
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full"
        // Nothing to approve means no extraction landed, which the review route
        // does not render at all — the guard is here so the button cannot claim
        // an empty document was reviewed.
        disabled={total === 0}
        onClick={approveDocument}
      >
        <Check aria-hidden strokeWidth={3} />
        Approve Document
      </Button>
    </div>
  );
}
