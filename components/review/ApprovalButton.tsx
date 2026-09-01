/**
 * One field's approval toggle: `Approve` ⇄ `Approved`.
 *
 * Stateless — the approval lives on the field in context and the press goes
 * straight back out. It is a toggle rather than a one-way commit, so it carries
 * `aria-pressed` and keeps its accessible name (`Approve` / `Approved`)
 * prefixing the field label, which is what a screen-reader user hears when
 * walking a panel of otherwise identical buttons.
 *
 * Deliberately never disabled by approval: an approved field stays reviewable,
 * and a control that vanishes once used leaves the human no way back.
 */

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ApprovalButtonProps {
  approved: boolean;
  /** The field's label, used to disambiguate the accessible name. */
  fieldLabel: string;
  onToggle: () => void;
  className?: string;
}

export function ApprovalButton({
  approved,
  fieldLabel,
  onToggle,
  className,
}: ApprovalButtonProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant={approved ? "secondary" : "outline"}
      aria-pressed={approved}
      aria-label={`${approved ? "Approved" : "Approve"} ${fieldLabel}`}
      onClick={onToggle}
      className={cn(approved && "text-primary", className)}
    >
      {approved ? <Check aria-hidden strokeWidth={3} /> : null}
      {approved ? "Approved" : "Approve"}
    </Button>
  );
}
