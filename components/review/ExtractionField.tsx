"use client";

/**
 * One extracted field, as a reviewable card — the core interaction of the
 * product.
 *
 * Layout, per the reference: the label over the value on the left, `Confidence:
 * 98%` over the bar on the right, then `Edit` and the approval control.
 *
 * Three product rules are encoded here, and all three are easy to break by
 * accident:
 *
 * 1. **Editing is inline, never a dialog.** `Edit` replaces the value with an
 *    `<input>` in the same card, focused with its text selected, plus `Save` /
 *    `Cancel`. A modal would hide the document the value has to be checked
 *    against, which is the whole point of the two-column screen.
 * 2. **An approved field stays editable, and an edit keeps the approval.** The
 *    reducer already preserves `approved` through `field/updated`; this card
 *    must not add UI that fights it — no disabled `Edit` on approved fields, no
 *    "you must re-approve". It is the same human confirming a correction, and
 *    the `Updated` badge makes the change visible instead.
 * 3. **A not-found field is a designed state, not a failure.** It renders the
 *    0% tier with an empty input already on screen and `Not found — please
 *    enter`, so the only thing left to do is type.
 *
 * The single piece of local state is the edit draft. Nothing else is stored:
 * the value, the approval and the active field all live in context, so two
 * cards can never disagree about what the document says.
 *
 * Hovering or focusing the card sets `activeFieldId`, which is the only link
 * between the two review columns — 013's overlay draws whatever this points at.
 */

import { useCallback, useRef, useState } from "react";
import { PenLine } from "lucide-react";

import { ApprovalButton } from "@/components/review/ApprovalButton";
import { ConfidenceBar } from "@/components/review/ConfidenceBar";
import { confidenceTone } from "@/components/review/field-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDocument } from "@/lib/document-context";
import { tierFor } from "@/lib/extraction/confidence";
import type { ExtractedField as ExtractedFieldModel } from "@/lib/extraction/types";
import { cn } from "@/lib/utils";

export interface ExtractionFieldProps {
  field: ExtractedFieldModel;
}

export function ExtractionField({ field }: ExtractionFieldProps) {
  const { activeFieldId, setActiveField, updateField, toggleApproval } =
    useDocument();

  /**
   * The edit in progress, or `null` when there is none. Holding the draft here
   * rather than writing every keystroke through `updateField` is what makes
   * `Cancel` possible at all — the field in context is untouched until `Save`.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Set when an edit starts before the input exists, so its mount can focus. */
  const pendingFocusRef = useRef(false);

  const tier = tierFor(field.confidence);
  const tone = confidenceTone(tier);
  const notFound = tier === "not-found";
  const editing = draft !== null;
  /** No value to show: a not-found field, or one the human has cleared. */
  const empty = field.value.trim().length === 0;
  /**
   * An empty field keeps its input on screen permanently — that is the
   * "invitation" state. It is not autofocused: several fields can be empty and
   * a page that grabs focus on load steals it from wherever the human was.
   */
  const open = editing || empty;

  const active = activeFieldId === field.id;

  /** Focuses and selects on mount, for an edit that had no input to focus yet. */
  const attachInput = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (node && pendingFocusRef.current) {
      pendingFocusRef.current = false;
      node.focus();
      node.select();
    }
  }, []);

  const startEditing = () => {
    setDraft(field.value);
    // An empty field already has its input mounted, so focusing it has to
    // happen here; a filled one is about to grow one, and `attachInput` does it.
    const node = inputRef.current;
    if (node) {
      node.focus();
      node.select();
    } else {
      pendingFocusRef.current = true;
    }
  };

  const save = () => {
    const next = (draft ?? "").trim();
    // An edit that changed nothing is not an update: dispatching it anyway
    // would stamp `Updated` on a field the human only looked at.
    if (next !== field.value) updateField(field.id, next);
    setDraft(null);
  };

  /** Leaves the stored value untouched by construction — only the draft goes. */
  const cancel = () => {
    setDraft(null);
  };

  const activate = () => {
    if (!active) setActiveField(field.id);
  };

  const release = () => {
    if (active) setActiveField(null);
  };

  return (
    <li
      data-field-id={field.id}
      data-tier={tier}
      onMouseEnter={activate}
      onMouseLeave={(event) => {
        // Editing keeps the highlight: the human is typing into this card and
        // the region it came from is the thing they are checking against.
        if (event.currentTarget.contains(document.activeElement)) return;
        release();
      }}
      // `onFocus` / `onBlur` bubble in React (focusin / focusout), so a press
      // on any control inside the card counts as focusing the field. 017 makes
      // the card itself focusable; nothing here has to change for that.
      onFocus={activate}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (event.currentTarget.matches(":hover")) return;
        release();
      }}
      className={cn(
        "rounded-card border border-border bg-card px-3.5 py-3 shadow-card transition-shadow",
        tone.card,
        // The pointer-side half of the link to the document: the card the
        // overlay is currently drawing is the one wearing the accent ring.
        active && "ring-2 ring-primary/30",
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-start gap-x-3">
        <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-label font-medium text-muted-foreground">
            {field.label}
          </span>
          {/*
            Persistent, not a toast: "this number is not what the engine read"
            is a fact about the field, and the reviewer coming back to the card
            an hour later needs it as much as the one who just typed it.
          */}
          {field.edited ? (
            <Badge variant="secondary" className="text-primary">
              Updated
            </Badge>
          ) : null}
        </div>

        <ConfidenceBar
          confidence={field.confidence}
          className="col-start-2 row-start-1"
        />

        {/*
          The value — or the input that replaced it, in place. It spans both
          columns while editing so a long value has the whole card to breathe;
          the confidence block above it does not move either way.
        */}
        <div
          className={cn(
            "row-start-2 mt-1.5 min-w-0",
            open ? "col-span-2 col-start-1" : "col-start-1",
          )}
        >
          {open ? (
            <div className="flex flex-col gap-1.5">
              {empty && !editing ? (
                <p className="flex items-center gap-1.5 text-label text-warn">
                  <PenLine aria-hidden className="size-3.5 shrink-0" />
                  {notFound ? "Not found — please enter" : "Please enter a value"}
                </p>
              ) : null}
              <Input
                ref={attachInput}
                value={draft ?? ""}
                aria-label={field.label}
                placeholder={`Enter ${field.label.toLowerCase()}`}
                onChange={(event) => setDraft(event.target.value)}
                className="h-9 bg-surface"
              />
            </div>
          ) : (
            <p className="truncate text-body font-medium text-foreground tabular-figures">
              {field.value}
            </p>
          )}
        </div>
      </div>

      {/*
        Everything below the high tier explains itself: the rule that produced
        the value, and any competing reading the OCR engine offered. A reviewer
        deciding whether to trust `Total Amount` needs to know it came from
        `Largest amount near "Total Due"` rather than from a label match.
      */}
      {tier !== "high" ? (
        <div className="mt-2.5 flex flex-col gap-1 border-t border-border pt-2.5 text-label text-muted-foreground">
          <p className="break-words">{field.reason}</p>
          {field.alternatives.length > 0 ? (
            <p className="break-words">
              OCR also read: {field.alternatives.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <Button type="button" size="sm" onClick={save}>
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={cancel}
              >
                Cancel
              </Button>
            </>
          ) : (
            /*
              Present on every card, approved or not. An approved field that
              cannot be corrected is a dead end, and the reducer keeps the
              approval through the edit anyway.
            */
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={startEditing}
              aria-label={`Edit ${field.label}`}
            >
              <PenLine aria-hidden />
              Edit
            </Button>
          )}
        </div>

        <ApprovalButton
          approved={field.approved}
          fieldLabel={field.label}
          onToggle={() => toggleApproval(field.id)}
        />
      </div>
    </li>
  );
}
