import { ScanText } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The demo invoice, as a rendered sheet.
 *
 * This component is the **source of the asset**, not a screen: it is
 * screenshotted to `public/demo-invoice.png` (the exact `agent-browser`
 * command is recorded in `tasks/015-demo-invoice/status.md`) and that PNG is
 * what `Try Demo Invoice` feeds to `startExtraction`. Nothing in the app
 * renders it at runtime.
 *
 * Two constraints shape every choice below, and both are load-bearing:
 *
 * 1. **This document is OCR input.** Every value is real text — no grey filler
 *    bars — set at a size and contrast tesseract reads reliably, and the labels
 *    the rule engine keys off are genuinely present and spelled the way the
 *    rules expect: `Invoice #` before the id, `Date` before the date,
 *    `Total Due` on the last money line, and a `Description` / `Qty` / `Value`
 *    header over the table. If the extraction gets something wrong, the fix is
 *    here — bigger, bolder, more contrast — never a looser rule.
 * 2. **Geometry is part of the contract.** `matchVendorName` takes the topmost
 *    substantial line in the upper-left of the page, so `TechSolutions Inc.`
 *    sits top-left and the `DocFlow AI` lockup sits in the right half of the
 *    header, where the vendor region cannot see it. `extractLineItems` derives
 *    the table's columns from the gutters between the header words, so the
 *    descriptions stay well left of `Qty` and the amounts well right of it.
 *
 * The sheet carries no purely decorative block of ink. A solid rule across the
 * page comes back from OCR as a row of em dashes — a zero-confidence word the
 * rule engine then has to survive — so the only large fills here are the ones
 * that sit behind text.
 *
 * Sized for capture at A4/96dpi (794 x 1123 CSS px) and screenshotted at a 2x
 * device scale factor, which puts the 15px body text at ~30px in the PNG — the
 * range tesseract reads without guessing. The sheet is a plain white rectangle
 * with no rounding or shadow, so the capture is the page and nothing else.
 */

/** A4 at 96dpi, in CSS pixels — the capture viewport's height. */
const SHEET_MIN_HEIGHT = "min-h-[1123px]";

/**
 * The billed rows. `Consultation Services` is first because it is the row the
 * ticket's acceptance criteria name; the five amounts sum to the `₹1,250.00`
 * printed in the totals block, because a demo whose arithmetic does not add up
 * is a demo that invites the wrong question.
 */
const LINE_ITEMS = [
  { description: "Consultation Services", quantity: "5", amount: "500.00" },
  { description: "Implementation Support", quantity: "2", amount: "300.00" },
  { description: "Cloud Migration Audit", quantity: "1", amount: "250.00" },
  { description: "Security Review Workshop", quantity: "1", amount: "150.00" },
  { description: "Priority Support Retainer", quantity: "1", amount: "50.00" },
] as const;

/**
 * An amount: the rupee sign as its own token, then the figure.
 *
 * The gap is not styling. `₹` (U+20B9) appears nowhere in the vendored
 * `eng.traineddata`, so tesseract cannot emit it however the sheet is drawn —
 * and set flush against the figure it drags the *figure's* word confidence to
 * zero, which would put a 0% beside the headline number on the review screen.
 * Given its own word gap it is misread on its own and the figure next to it
 * comes back clean.
 */
function Amount({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("flex items-baseline gap-2", className)}>
      <span>₹</span>
      <span className="tabular-figures">{value}</span>
    </span>
  );
}

export function DemoInvoice({ className }: { className?: string }) {
  return (
    <article
      className={cn(
        "flex w-full flex-col bg-surface px-14 py-14 text-foreground",
        SHEET_MIN_HEIGHT,
        className,
      )}
    >
      {/*
        The vendor goes left and the lockup goes right, and that is a rule
        rather than a taste: the vendor matcher reads the top-left band of the
        page, so a `DocFlow AI` line there would be extracted as the vendor.
      */}
      <header className="flex items-start justify-between gap-10">
        <div className="flex flex-col gap-1.5">
          <p className="text-headline font-semibold">TechSolutions Inc.</p>
          <p className="text-label text-muted-foreground">
            Level 4, Prestige Trade Tower
          </p>
          <p className="text-label text-muted-foreground">
            Bengaluru, Karnataka 560001
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-4">
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-9 items-center justify-center rounded-control bg-primary text-primary-foreground"
            >
              <ScanText className="size-5" />
            </span>
            <span className="text-subtitle font-semibold">DocFlow AI</span>
          </span>

          {/*
            `Invoice #` is the label `matchInvoiceId` looks for, and the id has
            to be the next token to its right on the same line — so the two stay
            on one row, never wrapped.

            Set in capitals, and that is not a style choice: at this size
            tesseract reads a mixed-case `Invoice #` by splitting the tittle of
            the `i` off as its own `.` word, which lands between `Invoice` and
            `#` and stops the label matching at all. `INVOICE` has no tittle to
            lose, and reads at 93% where the mixed-case form read at 60%.
          */}
          <p className="text-subtitle font-semibold whitespace-nowrap">
            INVOICE # INV-2024-001
          </p>
        </div>
      </header>

      <section className="mt-12 flex items-start justify-between gap-10">
        <div className="flex flex-col gap-2">
          <p className="text-label font-semibold uppercase text-muted-foreground">
            Bill To
          </p>
          <p className="text-subtitle font-semibold">Acme Corp</p>
          <p className="text-label text-muted-foreground">22 Marine Drive</p>
          <p className="text-label text-muted-foreground">
            Mumbai, Maharashtra 400020
          </p>
        </div>

        {/*
          The meta block: a light row for the date, a solid orange row for the
          headline figure. Both keep their label and value on one line, which is
          what lets `matchDate` and `matchTotalAmount` read the value as
          label-adjacent rather than guessing from position.
        */}
        <dl className="w-72 shrink-0 overflow-hidden rounded-card">
          <div className="flex items-baseline justify-between gap-4 bg-inset px-5 py-3.5">
            <dt className="text-body font-medium">Date</dt>
            <dd className="text-body font-semibold tabular-figures">
              Oct 26, 2024
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 bg-primary px-5 py-3.5 text-primary-foreground">
            <dt className="text-body font-semibold">Total Due</dt>
            <dd>
              <Amount value="1,250.00" className="text-body font-semibold" />
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-12">
        {/*
          Both header words the table pass needs are here — a description column
          and an amount column — with `Qty` between them as the gutter that
          keeps the two apart. Widths are fixed so the amounts sit right of
          `Qty` and the descriptions stay left of it at every row.
        */}
        <div className="flex items-center gap-4 rounded-card bg-primary px-5 py-3.5 text-primary-foreground">
          <span className="flex-1 text-body font-semibold">Description</span>
          <span className="w-16 shrink-0 text-right text-body font-semibold">
            Qty
          </span>
          <span className="w-28 shrink-0 text-right text-body font-semibold">
            Value
          </span>
        </div>

        <div className="divide-y divide-border">
          {LINE_ITEMS.map((item) => (
            <div
              key={item.description}
              className="flex items-center gap-4 px-5 py-4"
            >
              <span className="flex-1 text-body">{item.description}</span>
              <span className="w-16 shrink-0 text-right text-body tabular-figures">
                {item.quantity}
              </span>
              <Amount
                value={item.amount}
                className="w-28 shrink-0 justify-end text-body"
              />
            </div>
          ))}
        </div>
      </section>

      {/*
        `Subtotal` ends the table (the table pass stops at the first totals
        line) and `Total Due` is the last total-labelled line on the sheet,
        which is the one `matchTotalAmount` reads.
      */}
      <section className="mt-10 flex justify-end">
        <dl className="flex w-72 flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-body text-muted-foreground">Subtotal</dt>
            <dd>
              <Amount value="1,250.00" className="text-body font-medium" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
            <dt className="text-body font-semibold">Total Due</dt>
            <dd>
              <Amount value="1,250.00" className="text-title font-semibold" />
            </dd>
          </div>
        </dl>
      </section>

      {/*
        Payment details sit below the totals rather than beside them: the totals
        block is the last thing on the sheet that carries a total-labelled
        amount, and keeping anything money-shaped out of the way after it is
        what makes `Total Due` unambiguously the final word.
      */}
      <section className="mt-12 flex flex-col gap-2">
        <p className="text-label font-semibold uppercase text-muted-foreground">
          Payment Details
        </p>
        <p className="text-body">HDFC Bank, Indiranagar Branch</p>
        <p className="text-label text-muted-foreground">
          A/C 5011 4477 2093 · IFSC HDFC0001234
        </p>
      </section>

      <footer className="mt-auto flex items-end justify-between gap-12 pt-16">
        <p className="max-w-[17rem] text-label text-muted-foreground">
          Thank you for your business. Payment by bank transfer within 15 days.
        </p>

        <div className="flex w-72 shrink-0 flex-col items-stretch gap-2.5">
          <span aria-hidden className="h-px w-full bg-foreground" />
          <span className="text-label text-muted-foreground">
            Authorised Signature
          </span>
        </div>
      </footer>
    </article>
  );
}
