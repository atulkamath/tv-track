# tv-track — visual design

Chosen 2026-07-26 from a four-direction design pass styled onto the decided layout
(sidebar + poster grid + Spotlight add-palette; 3-across poster wall on mobile).
Winner: **"Poster Wall"** — near-black, poster-forward, Netflix-inflected.
Reference prototype: `prototype/tv-track-design-directions.html` (`?dir=4`, throwaway).

**Refined 2026-07-26 (v2, same day, before any ticket existed):** same bones —
same layout, same components, same signature element — with the token layer
reworked from flat hex to a warmer, layered surface: gradients instead of flat
fills, soft multi-layer shadows, and a warm off-white ink instead of pure
white. This was a direct response to the flat version reading "clean but
boring." Reference: claude.ai design artifact export, `Design System.dc.html`
(not committed — throwaway, like the prototype file above).

Every UI ticket builds inside this file. Don't introduce new colors, fonts, or
spacing values without updating this doc first.

**Implementation note (frontend, post-Tailwind/shadcn migration):** in
`frontend/src/app/globals.css`, the brand gradient below is the CSS custom
property `--brand` and the secondary-text token is `--ink-muted` — not
`--accent`/`--muted` as named here. Those two names are reserved for
shadcn's own semantic slots (hover-surface and muted-surface respectively,
currently unused). Same values, different variable names — write
`var(--brand)` / `var(--ink-muted)` in new frontend CSS, not the names below.

## Color tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `linear-gradient(175deg, #181310 0%, #100d0b 55%, #0a0908 100%)` | App background (also the sidebar — no panel color). A gradient, not a flat fill — warm brown undertone, not grey. |
| `--surface` | `linear-gradient(160deg, #241f1b, #1a1613)` | Cards, modals, palette box, list rows |
| `--surface-2` | `#2B2521` | Nested surfaces: sticky season headers, input wells, bar tracks |
| `--line` | `rgba(255,255,255,.07)` | Borders and hairlines (softer variant `rgba(255,255,255,.045)` for inner row dividers) |
| `--ink` | `#F3EEE8` | Primary text — warm off-white, not pure white |
| `--muted` | `rgba(243,238,232,.5)` (use `.4`–`.62` depending on emphasis) | Secondary text, placeholders, inactive nav |
| `--accent` | `linear-gradient(135deg, #e8434f, #c81c28)` | The one brand color: primary buttons, FAB, progress fill, the YOU row. Text on accent is white. Solid `#c81c28` where a gradient can't apply (e.g. a 1px underline). |
| `--full` | `#3EBE6B` | Full Watch State: the ✓ chip, done stepper dots |
| `--partial` | `#E0A83E` | Partial Watch State accents (stepper "current" dot); the poster progress bar itself stays red |

Scrim behind modals: `rgba(0,0,0,.72)`. Leaderboard podium numerals only:
gold `#F5C445`, silver `#C9CFD9`, bronze `#D08A4E`.

**Depth via light, not glow.** Every surface gets a soft, multi-layer shadow
(e.g. `0 1px 2px rgba(0,0,0,.5), 0 10px 24px rgba(0,0,0,.4)`) plus a 1px inner
highlight (`inset 0 1px 0 rgba(255,255,255,.05)`) rather than a flat card with
a hard border. This is what separates v2 from the original flat treatment —
apply it to posters, cards, modals, and the sidebar/main split, not just
modals.

## Typography

- **One family: [Figtree](https://fonts.google.com/specimen/Figtree)** (Google Fonts), for display, body, and numbers. Weight does all the work — no second typeface.
- Display: 700–800, tight tracking (h1 ~22–26px).
- Body: 400–500 at 15px/1.5.
- Emphasis (names, buttons, times): 600–700.
- Numbers that align in columns (times, episode counts) use `font-variant-numeric: tabular-nums`.

## Spacing & shape

- Spacing scale: **4 / 8 / 12 / 16 / 24 / 32** px. Grid gap opened from 10px to **16px** in v2 — density is still the point, but the extra room reads premium rather than cramped.
- Radii: **8px** posters and small controls, **12px** cards/rows, **16px** modals. (v2 sizes — up from 4/6/8, matched to the deeper shadow treatment.) Pills (chips, FAB) are full-round.
- Poster grid: `repeat(auto-fill, minmax(168px, 1fr))` desktop; fixed 3-across under 720px.

## Signature element: the poster carries the state

No text badges on cards. A show's Watch State is read off the poster itself:

- Thin (4px) **red progress bar** along the poster's bottom edge, fill = watched %.
- **Green ✓ chip** (22px circle, top-right) when Full.
- Small **percentage label** bottom-right while Partial.
- **Not-started shows render dimmed** (`brightness(.6) saturate(.8)`), restoring on hover.
- Title sits on the poster's bottom scrim (white, 700, ellipsized) — nothing under the tile.
- Hover: tile scales to 1.045, 180ms ease. This poster treatment is the one signature; everything else stays quiet.

## Decided component patterns

- **Show detail = centered modal** (max 640px, 84vh), not a drawer. Header: poster thumb, title, count, **"Mark all watched" / "Unmark all"** for the whole show, then ✕. Body is a list of **seasons, collapsed by default at every scale** — each row carries season number, watched-of-total, derived state, and its own mark-all. Expanding reveals that season's episodes inline; several can be open at once, and an expanded season's header **sticks** while you scroll its episodes. Collapsed-by-default so a 793-episode show fits one screen; identical behavior for small shows, because a modal that changes shape per show is harder to learn than one extra click. Esc and outside-click close. (This is what prototype variant E did — collapsed season rows with sticky headers; the pattern is confirmed, not new.)
- **Disambiguation Step = centered modal**: candidates as full poster cards side by side, progress dots when several mentions queue, "Skip — don't add this one" always available. Shown only after clear mentions have already landed (never blocks them).
- **Leaderboard = plain ranked list** (max 560px): rank numeral (podium colors for top 3), avatar, name, one big right-aligned time. **Your row is the only loud element**: accent outline, dark red tint, red YOU chip. No bars, no banners.
- **Settings = single narrow column of hairline-separated rows**: label + one-line explanation left, action right. Friend Code (with Copy), Regenerate, Add a friend, Pending requests.
- **Spotlight palette**: ＋ FAB (accent, bottom-right) opens the centered box. When empty it shows the **"Try one of these"** helper — three clickable example rows (`simpsons` / `breaking bad 3 seasons` / `friends, the office 2 seasons`) each with a plain-language note; helper hides while typing. "✓ added" chips accumulate as shows are added; box stays open.
- **Parse choreography**: dots-pill + shimmer skeleton cards where shows will land; landed cards pop with a brief accent glow (1.4s). Respect `prefers-reduced-motion`.
- **Posters**: real TMDB art in production; seeded-placeholder + gradient/initials fallback while loading or offline.

## Entry, auth, empty, and error surfaces

Decided 2026-07-26 (post-design-pass):

- **Signed-out landing = one-screen hero** in the product's own style: wordmark, one line ("Log what you watch. Outwatch your friends."), Sign in / Sign up buttons, and a mock poster grid beneath. No multi-section marketing page in MVP.
- **Sign-in/sign-up = Clerk prebuilt components** (`<SignIn/>`, `<SignUp/>`) themed via Clerk's appearance API to the tokens above (`--bg`, `--surface`, `--accent`, Figtree) — Clerk's appearance API takes flat colors, so use the solid fallbacks (`#0a0908`, `#1a1613`, `#c81c28`) rather than the gradients. No custom auth forms.
- **First-run Home (zero shows) = empty-state card** where the grid would be: "Nothing here yet. Type what you watch — we do the rest.", a large "＋ Log watching" button, and the same three clickable examples as the palette helper. The FAB remains.
- **Errors appear inline, where the user acted.** A failed parse shows a strip inside the palette ("Couldn't match that. Check the spelling, or try \"show name 3 seasons\"."); a failed toggle reverts the checkbox with an inline notice; a failed friend request explains next to the Send button. Toasts exist only as brief confirmations of a user action ("Friend Code copied"). Errors state what happened and what to do — never apologize, never just "something went wrong".
- **Show Refresh announces nothing.** New overnight episodes simply flip the poster out of Full (✓ chip gone, progress bar dips) — the signature element is the signal. No toast, no badge, no notification (notifications are parked per `docs/mvp-scope.md`).
- Other empty states follow the settings example: one sentence, then the action ("Nothing pending. Share your code to get started."). Leaderboard with no friends: "It's just you so far. Add a friend to start the race." + Add-friend affordance.

## Copy rules

- **Active voice; the control names the outcome**: "Mark all watched", "Send request", "Copy" — never "Submit" / "OK".
- **An action keeps its name through the whole flow**: the FAB says "Log watching"; a button that says "Add 2 shows" leads to a toast about those shows being added.
- **Domain terms come from `CONTEXT.md` and appear verbatim in UI**: Watch Time, Leaderboard, Friend Code, Friend Request. Watch State reads "Full" / "Partial" / "Not started" (user-facing spelling of None).
- **Consequences are stated where the action is**: "The old code stops working." next to Regenerate; "they have to accept" next to Send request.
- **Empty states invite the next action**, no mood: "Nothing pending. Share your code to get started."
- Sentence case everywhere; no exclamation marks; numbers formatted `29d 2h` / `4h 20m`.

## Out of scope for now

- Light theme (direction rejected), View Mosaic (post-MVP, per `docs/mvp-scope.md`).
- The rejected directions (Test Card, Marquee, Sticker Sheet) live only in the prototype file for the record.
