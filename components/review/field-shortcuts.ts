/**
 * The review panel's keyboard grammar, as pure functions.
 *
 * Two decisions live here and nowhere else:
 *
 * 1. **Which single-key shortcut a keystroke means** on a focused field card —
 *    `e` to edit, `a` to approve.
 * 2. **When a keystroke must be left alone**, which is the rule that is easiest
 *    to regress: while the human is typing into the value input, `a` is the
 *    letter `a` and nothing else. A card that toggled approval mid-word would
 *    make the panel unusable for exactly the field that needed correcting.
 *
 * Extracted from `ExtractionField` deliberately. The card's focus and selection
 * behaviour needs a browser, but the suppression rule does not, and it is the
 * one genuinely unit-testable piece of 017 — so it is expressed against a
 * duck-typed shape rather than `HTMLElement`: a real DOM event target satisfies
 * it as-is, and a test can pass `{ tagName: "INPUT" }`.
 *
 * No React, no DOM, no state.
 */

/**
 * The parts of an event target these rules read.
 *
 * `HTMLElement` structurally satisfies this, so `isTextEntryTarget(event.target)`
 * needs no cast at the call site beyond narrowing `EventTarget`.
 */
export interface ShortcutTargetLike {
  /** Upper-case in the DOM, but compared case-insensitively here. */
  tagName?: string;
  /** True inside a `contenteditable` subtree. */
  isContentEditable?: boolean;
}

/** The parts of a keyboard event these rules read. */
export interface ShortcutEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: ShortcutTargetLike | null;
}

/**
 * Elements that own their keystrokes.
 *
 * `SELECT` is here alongside the text controls because typing a letter into a
 * native select jumps to the matching option — also a keystroke the element is
 * using. The panel has no textarea or select today; they are listed so adding
 * one later cannot quietly reintroduce the bug.
 */
const TEXT_ENTRY_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Whether the keystroke landed in something that is consuming characters.
 *
 * Deliberately based on the event *target* rather than on the card's `editing`
 * flag: the flag says an edit is in progress, while the target says where the
 * key actually went, and only the second one is true for the always-mounted
 * input of an empty field (which is on screen with no edit started).
 */
export function isTextEntryTarget(
  target: ShortcutTargetLike | null | undefined,
): boolean {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  const tagName = target.tagName;
  if (typeof tagName !== "string") return false;
  return TEXT_ENTRY_TAGS.has(tagName.toUpperCase());
}

/** What a bare keystroke on a focused field card asks for. */
export type FieldShortcut = "edit" | "approve";

/**
 * The shortcut a keystroke means, or `null` for "not ours — let it through".
 *
 * Modified keystrokes are never ours: `⌘A` selects the page and `Ctrl+E` is a
 * browser binding, and stealing either to approve a field would be a bug rather
 * than a feature. Shift is not excluded, so `Shift+A` still approves — the hint
 * line shows the shortcuts as capitals and a human who takes that literally
 * should not find them dead.
 */
export function fieldShortcutFor(
  event: ShortcutEventLike,
): FieldShortcut | null {
  if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) {
    return null;
  }
  if (isTextEntryTarget(event.target)) return null;

  switch (event.key.toLowerCase()) {
    case "e":
      return "edit";
    case "a":
      return "approve";
    default:
      return null;
  }
}

/** What a keystroke inside the value input asks the edit to do. */
export type EditorAction = "save" | "cancel";

/**
 * `Enter` commits the draft, `Escape` discards it.
 *
 * The same modifier guard as above, for the same reason — `⌘Enter` and
 * `Alt+Escape` belong to the OS. Unlike `fieldShortcutFor` this one is *for*
 * text entry, so it does not consult the target: these two keys are not
 * characters and an input has no default action for either outside a form.
 */
export function editorActionFor(
  event: ShortcutEventLike,
): EditorAction | null {
  if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) {
    return null;
  }

  switch (event.key) {
    case "Enter":
      return "save";
    case "Escape":
      return "cancel";
    default:
      return null;
  }
}
