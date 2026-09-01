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
 *
 * 017 makes the card itself a tab stop, which is what turns tabbing down the
 * panel into a guided tour of the document. Two choices in that are deliberate:
 *
 * - **The card stays a `<li>` with no interactive role.** It is a focusable
 *   list item, not a `role="button"` — an element with an interactive role that
 *   contains focusable buttons is the nested-interactive problem, and re-roling
 *   the `<li>` to `group` would also break the `<ul>`'s list semantics. A
 *   focusable `listitem` carrying `aria-label` announces "<label>, <value>" on
 *   focus, keeps `Edit` and `Approve` as their own ordinary tab stops after it,
 *   and leaves the tab order exactly the reading order.
 * - **Shortcuts are suppressed by the event target, not by the edit flag**, in
 *   the pure rules in `./field-shortcuts`. An empty field has its input mounted
 *   with no edit started, so a flag would let `a` toggle approval mid-word
 *   there.
 */

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { PenLine } from "lucide-react";

import { ApprovalButton } from "@/components/review/ApprovalButton";
import { ConfidenceBar } from "@/components/review/ConfidenceBar";
import { confidenceTone } from "@/components/review/field-display";
import {
  editorActionFor,
  fieldShortcutFor,
} from "@/components/review/field-shortcuts";
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
  /** The card, so an edit that ends can hand focus back to it. */
  const cardRef = useRef<HTMLLIElement | null>(null);

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

  /**
   * Returns focus to the card once an edit is over.
   *
   * Not a nicety: saving a filled field unmounts the input the human was typing
   * in, and focus would fall to `<body>`, sending the next Tab back to the top
   * of the page. Landing on the card instead leaves them one keystroke from
   * `a` and one Tab from the next field.
   */
  const focusCard = () => {
    cardRef.current?.focus();
  };

  const save = () => {
    const next = (draft ?? "").trim();
    // An edit that changed nothing is not an update: dispatching it anyway
    // would stamp `Updated` on a field the human only looked at.
    if (next !== field.value) updateField(field.id, next);
    setDraft(null);
    focusCard();
  };

  /** Leaves the stored value untouched by construction — only the draft goes. */
  const cancel = () => {
    setDraft(null);
    focusCard();
  };

  const activate = () => {
    if (!active) setActiveField(field.id);
  };

  const release = () => {
    if (active) setActiveField(null);
  };

  /**
   * The card's keyboard grammar. Both branches are decided by the pure rules in
   * `./field-shortcuts`; this only carries them out.
   *
   * `preventDefault` on a shortcut is required, not tidiness: `e` starts an
   * edit and focuses the input *synchronously*, so the browser would then
   * deliver that same keystroke as a character into the input the handler just
   * focused, and the field would begin with a stray `e`.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    // Named fields rather than the event itself: the rules are pure and take a
    // plain shape, and spelling out what they read keeps them that way.
    const keystroke = {
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      target: event.target as HTMLElement | null,
    };

    if (editing) {
      const action = editorActionFor(keystroke);
      if (action !== null) {
        event.preventDefault();
        if (action === "save") save();
        else cancel();
        return;
      }
    }

    const shortcut = fieldShortcutFor(keystroke);
    if (shortcut === null) return;
    event.preventDefault();
    if (shortcut === "edit") startEditing();
    else toggleApproval(field.id);
  };

  return (
    <li
      ref={cardRef}
      data-field-id={field.id}
      data-tier={tier}
      /*
        A tab stop, so the panel can be walked without a mouse — and because
        `onFocus` below sets the active field, that walk drives the document
        highlight. No interactive role: see the note at the top of the file.
      */
      tabIndex={0}
      /*
        What a screen reader hears on landing here. Built from the two facts a
        reviewer needs before deciding — which field, and what it currently says
        — rather than left to the card's whole subtree, which would read the
        confidence, the reason and both button labels first.
      */
      aria-label={`${field.label}: ${empty ? "no value" : field.value}`}
      onKeyDown={handleKeyDown}
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
        // The keyboard's own ring: the same accent as the rest of the app's
        // focus treatment (`--ring` is the orange accent), thicker and more
        // opaque than the active-card ring below so a focused card is
        // unmistakable even when both are on the same element. `outline-none`
        // only removes the UA outline that this replaces.
        "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
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
              {/*
                `Enter` / `Escape` are not wired here: the card's `onKeyDown`
                sees them bubble up, which is also what makes them work from
                `Save` and `Cancel` while an edit is open.
              */}
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
