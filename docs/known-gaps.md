# Known gaps vs. the original spec

Investigated 2026-08-09, against issue #1 (the parent spec — 130 user
stories), `docs/mvp-scope.md`, `docs/design.md`, and the actual shipped code.
For each item: whether it's a genuine dropped requirement or scope that was
simply never asked for, the evidence, and what fixing it would take.

## 1. No sign-out button

**Confirmed missing — a real spec item, never picked up by any ticket.**

Issue #1, User Story #7: *"As a signed-in user, I want to sign out from the
app, so that I can leave a shared computer safely."*

No built ticket ever turned this into an acceptance criterion:
- #5 (Landing hero + themed Clerk auth) covers sign-in, sign-up, and the
  expired-session redirect — not sign-out.
- #16 (Settings screen) covers Friend Code, Regenerate, Add a friend,
  Pending requests — no account-level row at all.

`grep -rn "SignOutButton\|UserButton\|signOut" frontend/src` returns nothing.
It isn't hidden inside some other Clerk component either — it's genuinely
absent.

**Fix is small**: Clerk ships a ready `<SignOutButton>` component. It just
needs a home — most naturally a row in Settings, or the sidebar footer in
`AppShell.tsx`. No backend work.

## 2. Motion design

**Partially built — what the spec asked for exists; what you may be missing wasn't ever asked for.**

Built, and traceable to real stories:
- Parse choreography — dots-pill, shimmer skeleton, glow-pop on landed
  cards (#12; stories #32, #34, #37, including `prefers-reduced-motion`).
- Poster hover-scale, dimmed→bright on hover (#3/#7; story #52).
- Dialog open/close fade + zoom (built into the shared `Dialog` component
  via `tw-animate-css`, used by every modal in the app).

Not built, and not asked for anywhere in issue #1's 130 stories or any
ticket's AC:
- Any transition when switching between Home / Leaderboard / Settings
  (the tab content just swaps instantly).
- Micro-interactions beyond color-state changes on buttons/rows.

So this isn't a dropped requirement — it's real scope nobody ever wrote
down. If you want it, it's a new ticket, not a bug.

## 3. Skeleton loading on Home page mount

**Confirmed missing for the ordinary case — present, but scoped narrowly, for one specific case. Your memory of "shimmer" is correct, just narrower than you may have meant.**

`SkeletonPosterTile` (the shimmer component) genuinely exists in
`PosterGrid.tsx` — but it only renders while `pendingSkeletonCount > 0`,
which is only true during an NLP-Entry parse in flight (#12). The very
first `GET /shows` fetch when Home mounts (or after a plain refresh) shows
plain text instead:

```tsx
<p role="status" className="text-sm text-muted-foreground">Loading your shows…</p>
```

Checked every relevant spec source (#1's stories, #3's AC, #7's AC) — none
of them ever asked for a skeleton on ordinary load. Story #32 only asks for
"a parsing indicator and placeholder cards where shows will land" in the
NLP-parse context specifically, which is what got built.

**Fix is small and low-risk**: the shimmer component already exists and is
already tested — reusing it for the initial-load branch is a few lines in
`PosterGrid.tsx`, not new design work.

## 4. Total Watch Time is never displayed — the real finding

**Confirmed missing, and this one is not a scope question. It's the app's headline feature, explicitly spec'd multiple times, fully built on the backend, and never wired to any screen.**

The parent spec's own Problem Statement is literally about this:

> "Once I have given up, the number I care about — how much time have I
> actually spent, and am I ahead of my friends — never exists."

And the Solution section is explicit about where it belongs:

> "The sidebar shows your Watch Time and rank **at all times**."

Backed by seven separate user stories (#70, #77–82), including:
- #77: *"I want my total Watch Time always visible in the sidebar."*
- #82: *"I want my rank shown next to my Watch Time in the sidebar."*
- #70: *"I want my Watch Time in the sidebar to move as I tick episodes."*

**What actually exists:**
- `GET /me/watch-time` — built, fully tested (#6), computes the live sum
  correctly, handles null runtimes.
- `grep -rn "watch-time\|watchTime" frontend/src` shows it is **never
  called anywhere in the frontend.** Zero fetches to this endpoint exist.
- The only place any watch time appears at all is inside individual
  Leaderboard rows (`formatWatchTime`, `Leaderboard.tsx`) — and that's
  gated: `if (entries.length <= 1)` shows the "It's just you so far" empty
  state instead of any row. A user with zero accepted friends — the exact
  person the app's own pitch is written for — currently has **no way to
  see their own total anywhere in the app.**

**Why it likely happened**: `AppShell.tsx` (#3) is where the sidebar lives,
and its acceptance criteria never mention Watch Time or rank — just nav
placeholders and the modal primitive. No later ticket ever picked it back
up either. It reads like the requirement was captured faithfully in the
parent spec and then simply dropped during ticket-writing, since #3 was
the ticket that owned "the sidebar" and its own scope never mentioned it.

**Fix**: needs a small new ticket. AppShell's sidebar needs a persistent
Watch Time + rank display, calling `GET /me/watch-time` (already exists)
and something for rank — either a new lightweight backend field or
deriving it client-side from `GET /leaderboard`, which already returns
every friend sorted.
