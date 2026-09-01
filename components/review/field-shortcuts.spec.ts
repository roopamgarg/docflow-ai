import { describe, it, expect } from "vitest";
import {
  isTextEntryTarget,
  fieldShortcutFor,
  editorActionFor,
} from "./field-shortcuts";

describe("isTextEntryTarget", () => {
  it("treats an INPUT as text entry", () => {
    expect(isTextEntryTarget({ tagName: "INPUT" })).toBe(true);
  });

  it("treats a TEXTAREA as text entry", () => {
    expect(isTextEntryTarget({ tagName: "TEXTAREA" })).toBe(true);
  });

  it("treats a SELECT as text entry (typing jumps options, also a consumed keystroke)", () => {
    expect(isTextEntryTarget({ tagName: "SELECT" })).toBe(true);
  });

  it("does not treat a DIV as text entry", () => {
    expect(isTextEntryTarget({ tagName: "DIV" })).toBe(false);
  });

  it("treats isContentEditable as text entry regardless of tag", () => {
    expect(isTextEntryTarget({ isContentEditable: true })).toBe(true);
  });

  it("is case-insensitive on tagName", () => {
    expect(isTextEntryTarget({ tagName: "input" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isTextEntryTarget(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isTextEntryTarget(undefined)).toBe(false);
  });
});

describe("fieldShortcutFor", () => {
  it("maps 'e' on a card (LI) to edit", () => {
    expect(fieldShortcutFor({ key: "e", target: { tagName: "LI" } })).toBe(
      "edit",
    );
  });

  it("maps 'A' to approve, case-insensitively", () => {
    expect(fieldShortcutFor({ key: "A", target: { tagName: "LI" } })).toBe(
      "approve",
    );
  });

  // This is the most important assertion in the ticket: a regression here
  // means typing a vendor name (which contains the letter "a") would
  // silently toggle the field's approval instead of just entering text.
  it("does NOT fire while the target is an input — typing 'a' into a value must not toggle approval", () => {
    expect(
      fieldShortcutFor({ key: "a", target: { tagName: "INPUT" } }),
    ).toBeNull();
  });

  it("does not fire with the meta modifier held (⌘A is select-all, not ours)", () => {
    expect(
      fieldShortcutFor({ key: "a", metaKey: true, target: { tagName: "LI" } }),
    ).toBeNull();
  });

  it("does not fire with the ctrl modifier held", () => {
    expect(
      fieldShortcutFor({ key: "a", ctrlKey: true, target: { tagName: "LI" } }),
    ).toBeNull();
  });

  it("does not fire with the alt modifier held", () => {
    expect(
      fieldShortcutFor({ key: "e", altKey: true, target: { tagName: "LI" } }),
    ).toBeNull();
  });

  it("returns null for a key with no shortcut meaning", () => {
    expect(fieldShortcutFor({ key: "x", target: { tagName: "LI" } })).toBeNull();
  });

  it("still fires with no target at all (undefined target is not text entry)", () => {
    expect(fieldShortcutFor({ key: "e" })).toBe("edit");
  });
});

describe("editorActionFor", () => {
  it("maps Enter to save", () => {
    expect(editorActionFor({ key: "Enter" })).toBe("save");
  });

  it("maps Escape to cancel", () => {
    expect(editorActionFor({ key: "Escape" })).toBe("cancel");
  });

  it("does not fire on ⌘Enter (belongs to the OS/browser)", () => {
    expect(editorActionFor({ key: "Enter", metaKey: true })).toBeNull();
  });

  it("does not fire on Ctrl+Enter", () => {
    expect(editorActionFor({ key: "Enter", ctrlKey: true })).toBeNull();
  });

  it("does not fire on Alt+Escape", () => {
    expect(editorActionFor({ key: "Escape", altKey: true })).toBeNull();
  });

  it("returns null for an unrelated key", () => {
    expect(editorActionFor({ key: "Tab" })).toBeNull();
  });
});
