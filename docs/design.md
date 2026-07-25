# tv-track — visual design

Chosen 2026-07-26 from a four-direction design pass styled onto the decided layout
(sidebar + poster grid + Spotlight add-palette; 3-across poster wall on mobile).
Winner: **"Poster Wall"** — near-black, poster-forward, Netflix-inflected.
Reference prototype: `prototype/tv-track-design-directions.html` (`?dir=4`, throwaway).

Every UI ticket builds inside this file. Don't introduce new colors, fonts, or
spacing values without updating this doc first.

## Color tokens

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#141414` | App background (also the sidebar — no panel color) |
| `--surface` | `#1F1F1F` | Cards, modals, palette box, list rows |
| `--surface-2` | `#2B2B2B` | Nested surfaces: sticky season headers, input wells, bar tracks |
| `--line` | `#2E2E2E` | Borders and hairlines (softer variant `#262626` for inner row dividers) |
| `--ink` | `#FFFFFF` | Primary text |
| `--muted` | `#A3A3A3` | Secondary text, placeholders, inactive nav |
| `--accent` | `#E50914` | The one brand color: primary buttons, FAB, progress fill, the YOU row. Text on accent is white. |
| `--full` | `#46D369` | Full Watch State: the ✓ chip, done stepper dots |
| `--partial` | `#E8B339` | Partial Watch State accents (stepper "current" dot); the poster progress bar itself stays red |

Scrim behind modals: `rgba(0,0,0,.72)`. Leaderboard podium numerals only:
gold `#F5C445`, silver `#C9CFD9`, bronze `#D08A4E`.

## Typography

- **One family: [Figtree](https://fonts.google.com/specimen/Figtree)** (Google Fonts), for display, body, and numbers. Weight does all the work — no second typeface.
- Display: 700–800, tight tracking (h1 ~22–26px).
- Body: 400–500 at 15px/1.5.
- Emphasis (names, buttons, times): 600–700.
- Numbers that align in columns (times, episode counts) use `font-variant-numeric: tabular-nums`.

## Spacing & shape

- Spacing scale: **4 / 8 / 12 / 16 / 24 / 32** px. Grid gap is tight (10px) — density is the point.
- Radii: **4px** posters and small controls, **6px** cards/rows, **8px** modals. Pills (chips, FAB) are full-round.
- Poster grid: `repeat(auto-fill, minmax(170px, 1fr))` desktop; fixed 3-across under 720px.

## Signature element: the poster carries the state

No text badges on cards. A show's Watch State is read off the poster itself:

- Thin (4px) **red progress bar** along the poster's bottom edge, fill = watched %.
- **Green ✓ chip** (22px circle, top-right) when Full.
- Small **percentage label** bottom-right while Partial.
- **Not-started shows render dimmed** (`brightness(.6) saturate(.8)`), restoring on hover.
- Title sits on the poster's bottom scrim (white, 700, ellipsized) — nothing under the tile.
- Hover: tile scales to 1.045, 180ms ease. This poster treatment is the one signature; everything else stays quiet.

## Decided component patterns

- **Show detail = centered modal** (max 640px, 84vh), not a drawer. Header: poster thumb, title, count, **"Mark all watched" / "Unmark all"** for the whole show, then ✕. Body is a list of **seasons, collapsed by default at every scale** — each row carries season number, watched-of-total, derived state, and its own mark-all. Expanding reveals that season's episodes inline; several can be open at once. Collapsed-by-default so a 793-episode show fits one screen; identical behavior for small shows, because a modal that changes shape per show is harder to learn than one extra click. Esc and outside-click close.
- **Disambiguation Step = centered modal**: candidates as full poster cards side by side, progress dots when several mentions queue, "Skip — don't add this one" always available. Shown only after clear mentions have already landed (never blocks them).
- **Leaderboard = plain ranked list** (max 560px): rank numeral (podium colors for top 3), avatar, name, one big right-aligned time. **Your row is the only loud element**: accent outline, dark red tint, red YOU chip. No bars, no banners.
- **Settings = single narrow column of hairline-separated rows**: label + one-line explanation left, action right. Friend Code (with Copy), Regenerate, Add a friend, Pending requests.
- **Spotlight palette**: ＋ FAB (accent, bottom-right) opens the centered box. When empty it shows the **"Try one of these"** helper — three clickable example rows (`simpsons` / `breaking bad 3 seasons` / `friends, the office 2 seasons`) each with a plain-language note; helper hides while typing. "✓ added" chips accumulate as shows are added; box stays open.
- **Parse choreography**: dots-pill + shimmer skeleton cards where shows will land; landed cards pop with a brief accent glow (1.4s). Respect `prefers-reduced-motion`.
- **Posters**: real TMDB art in production; seeded-placeholder + gradient/initials fallback while loading or offline.

## Entry, auth, empty, and error surfaces

Decided 2026-07-26 (post-design-pass):

- **Signed-out landing = one-screen hero** in the product's own style: wordmark, one line ("Log what you watch. Outwatch your friends."), Sign in / Sign up buttons, and a mock poster grid beneath. No multi-section marketing page in MVP.
- **Sign-in/sign-up = Clerk prebuilt components** (`<SignIn/>`, `<SignUp/>`) themed via Clerk's appearance API to these tokens: `#141414` background, `#1F1F1F` surface, `#E50914` accent, Figtree. No custom auth forms.
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
