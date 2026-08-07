import { describe, expect, it } from "vitest";
import { clerkAppearance } from "./clerk-appearance";

describe("clerkAppearance", () => {
  it("themes the primary color to the accent solid fallback, not the gradient", () => {
    expect(clerkAppearance.variables?.colorPrimary).toBe("#c81c28");
  });

  it("themes the card background to the surface solid fallback, not the gradient", () => {
    expect(clerkAppearance.variables?.colorBackground).toBe("#1a1613");
  });

  it("never hands Clerk a gradient — every variable is a flat color or string value", () => {
    const values = Object.values(clerkAppearance.variables ?? {});
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(String(value)).not.toMatch(/gradient/i);
    }
  });

  it("uses the app's one typeface", () => {
    expect(clerkAppearance.variables?.fontFamily).toMatch(/figtree/i);
  });

  it("uses the modal radius for the auth card, per docs/design.md", () => {
    expect(clerkAppearance.variables?.borderRadius).toBe("16px");
  });
});
