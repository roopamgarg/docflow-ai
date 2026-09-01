import { describe, it, expect } from "vitest";
import { isActive } from "./IconRail";

describe("isActive", () => {
  it("matches the home route exactly when pathname is /", () => {
    expect(isActive("/", "/")).toBe(true);
  });

  it("does not match the home route when pathname is /review", () => {
    expect(isActive("/review", "/")).toBe(false);
  });

  it("matches /review when pathname is /review", () => {
    expect(isActive("/review", "/review")).toBe(true);
  });

  it("matches /review for a nested path via prefix matching", () => {
    expect(isActive("/review/x", "/review")).toBe(true);
  });

  it("does not match a clearly unrelated pathname", () => {
    expect(isActive("/settings", "/review")).toBe(false);
  });
});
