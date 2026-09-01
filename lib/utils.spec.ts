import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins plain class strings", () => {
    expect(cn("px-2", "text-sm")).toBe("px-2 text-sm");
  });

  it("drops falsy/conditional values via clsx", () => {
    expect(cn("px-2", false && "hidden", undefined, null, "text-sm")).toBe(
      "px-2 text-sm"
    );
  });

  it("resolves conflicting tailwind classes, keeping the last one", () => {
    // tailwind-merge should dedupe same-group utilities instead of
    // concatenating both, which is what plain clsx/template strings would do.
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("merges conditional objects and resolves conflicts within them", () => {
    expect(cn("text-sm", { "text-lg": true, "text-red-500": false })).toBe(
      "text-lg"
    );
  });
});
