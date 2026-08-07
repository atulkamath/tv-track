import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

type ClerkAppearance = NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

/**
 * Themes Clerk's prebuilt `<SignIn/>`/`<SignUp/>` to this app's tokens
 * (docs/design.md → "Entry, auth, empty, and error surfaces"). Set once on
 * `<ClerkProvider>` in the root layout, so every Clerk component inherits it —
 * no per-component appearance props, no custom auth forms.
 *
 * Clerk's appearance API takes flat CSS colors, not gradients, so the two
 * gradient tokens (`--bg`, `--accent`) fall back to their solid anchor colors
 * from docs/design.md rather than being approximated:
 *   - `--bg`      → `#0a0908` (the page around the card — set in each auth
 *                    route's own CSS, not here; Clerk only themes the card)
 *   - `--surface` → `#1a1613` (`colorBackground`, the card itself)
 *   - `--accent`  → `#c81c28` (`colorPrimary`, the primary button)
 */
export const clerkAppearance: ClerkAppearance = {
  variables: {
    colorPrimary: "#c81c28",
    colorPrimaryForeground: "#f3eee8",
    colorBackground: "#1a1613",
    colorInput: "#2b2521",
    colorInputForeground: "#f3eee8",
    colorForeground: "#f3eee8",
    colorMutedForeground: "rgba(243, 238, 232, 0.5)",
    colorNeutral: "#f3eee8",
    colorBorder: "rgba(255, 255, 255, 0.07)",
    colorShadow: "rgba(0, 0, 0, 0.5)",
    fontFamily: "var(--font-figtree), -apple-system, 'Segoe UI', sans-serif",
    borderRadius: "16px",
  },
  elements: {
    card: {
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.5), 0 10px 24px rgba(0, 0, 0, 0.4)",
    },
    formButtonPrimary: {
      backgroundColor: "#c81c28",
      color: "#ffffff",
    },
    footerActionLink: {
      color: "#c81c28",
    },
  },
};
