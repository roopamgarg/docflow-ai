import { ScanText } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The DocFlow brand mark: an orange tile with a white glyph. Decorative on its
 * own — the surrounding link owns the accessible name.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-control bg-primary text-primary-foreground",
        className,
      )}
    >
      <ScanText className="size-5" />
    </span>
  );
}
