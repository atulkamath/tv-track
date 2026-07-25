# MVP Scope

Agreed via `/grill-with-docs`. Domain terms in `CONTEXT.md`; hard decisions in `docs/adr/`. This file captures the working scope and API surface so `/to-spec` starts from a fixed list, not conversation memory.

## In scope

- Clerk auth (ADR 0003), with **lazy user creation**: our `users` row is created on a user's first authenticated request — no Clerk webhook.
- NLP Entry: free text → LLM parse → TMDB resolution → cards default to fully watched; ambiguous mentions go to a non-blocking Disambiguation Stepper.
- Typeahead add (Spotlight palette): type one title, pick from live suggestions, show is added with all episodes watched. Picking is the disambiguation, so no stepper on this path.
- Show detail modal: seasons collapsed by default, expand to toggle individual episodes; mark-all at show, season, and episode level. Watch State is carried by the poster, not a text badge — see `docs/design.md`.
- Show delete (removes only the user's own watched rows; shared TMDB mirror untouched).
- Daily Show Refresh job: diffs TMDB against the local mirror, inserts new episodes as unwatched; skips shows TMDB marks `Ended`. Server-side cron — never triggered by app launch.
- Friends: Friend Code (6-char, regenerable) or email → pending Friend Request → accept/decline → mutual Friendship.
- Leaderboard: live-computed Watch Time totals for self + accepted friends.
- Settings: display friend code (via `GET /me`), regenerate it.

## API surface — 16 routes + 1 job

_Was 15. `GET /shows/search` added 2026-07-26 during `/to-spec` — a deliberate scope addition, recorded below._

### NLP entry
- `POST /shows/parse` — raw text in; returns `resolved` (cards created, marked watched) + `ambiguous` (candidates for the stepper, nothing saved yet). Re-entering an existing show updates the existing card — never duplicates.
- `POST /shows/resolve-ambiguous` — one stepper choice in (`tmdb_id` + seasons); creates the card. Skipping = simply not calling this.

### Typeahead
- `GET /shows/search?q=` — thin TMDB passthrough for the Spotlight palette's live suggestions: title, year, poster, `tmdb_id`, total episode count. No per-user state, writes nothing, short cache. Exists because picking from the suggestion list **is** the disambiguation — candidates have to be shown before anything is saved, so the Disambiguation Step never fires on this path.

### Shows
- `GET /shows` — home list: title, poster, derived badge per show.
- `GET /shows/:id` — full season/episode tree for one show's accordion.
- `PUT /shows/:id/episodes/:episodeId` — `{ watched: bool }`; insert/delete one `watched_episodes` row. Idempotent.
- `PUT /shows/:id/seasons/:seasonNumber` — same, for every episode in the season.
- `DELETE /shows/:id` — removes the user's watched rows + card; no effect on other users or the mirror.

### Watch time & leaderboard
- `GET /me/watch-time` — sum of watched episode runtimes, computed live.
- `GET /leaderboard` — same sum for self + accepted friends, sorted.

### Profile & friends
- `GET /me` — profile incl. `friend_code` (folded in; no separate read endpoint).
- `POST /me/friend-code/regenerate` — new code; old one stops working.
- `POST /friend-requests` — by `{ code }` or `{ email }`; always creates a **pending** request.
- `GET /friend-requests` — incoming + outgoing pending requests.
- `PUT /friend-requests/:id/accept` — creates the Friendship.
- `PUT /friend-requests/:id/decline` — discards the request.

### Job (not a route)
- **Show Refresh** — daily scheduled job; one pass over distinct non-ended shows in the mirror, shared by all users.

All routes require the Clerk auth token (authentication = Clerk; authorization rules like friendship-gated leaderboards = ours).

## Out of scope / parked

- Notifications; unfriending.
- **View Mosaic** (post-MVP idea): user picks a favorite show; "view all shows" zooms posters out into a mosaic of that show's art. Needs only a `favorite_show` profile field + frontend rendering — no data-model rework, can land anytime.
- LLM provider choice (leaning OpenRouter); wrap the call behind one interface regardless (swappable).
