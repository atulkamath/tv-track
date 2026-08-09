import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

type ClerkAppearance = NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

/**
 * Themes Clerk's prebuilt `<SignIn/>`/`<SignUp/>` to this app's tokens. Set
 * once on `<ClerkProvider>` in the root layout, so every Clerk component
 * inherits it — no per-component appearance props, no custom auth forms.
 *
 * Clerk's appearance API takes flat CSS colors, not `var()` references, so
 * these are literal hex equivalents of `globals.css`'s shadcn stock
 * dark-neutral theme (Tailwind's own neutral scale) rather than the CSS
 * variables directly:
 *   - `--background` (oklch(0.145 0 0)) → neutral-950 `#0a0a0a`
 *   - `--card`       (oklch(0.205 0 0)) → neutral-900 `#171717`
 *   - `--input`                          → neutral-800 `#262626`
 *   - `--foreground` (oklch(0.985 0 0)) → neutral-50  `#fafafa`
 *   - `--primary`    (oklch(0.922 0 0)) → neutral-200 `#e5e5e5`
 *   - `--muted-foreground` (oklch(0.708 0 0)) → neutral-400 `#a3a3a3`
 */
export const clerkAppearance: ClerkAppearance = {
  variables: {
    colorPrimary: "#e5e5e5",
    colorPrimaryForeground: "#171717",
    colorBackground: "#171717",
    colorInput: "#262626",
    colorInputForeground: "#fafafa",
    colorForeground: "#fafafa",
    colorMutedForeground: "#a3a3a3",
    colorNeutral: "#fafafa",
    colorBorder: "rgba(255, 255, 255, 0.1)",
    colorShadow: "rgba(0, 0, 0, 0.5)",
    fontFamily: "var(--font-figtree), -apple-system, 'Segoe UI', sans-serif",
    borderRadius: "0.625rem",
  },
  elements: {
    card: {
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.5), 0 10px 24px rgba(0, 0, 0, 0.4)",
    },
    formButtonPrimary: {
      backgroundColor: "#e5e5e5",
      color: "#171717",
    },
    footerActionLink: {
      color: "#e5e5e5",
    },
  },
};
