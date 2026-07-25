# Per-episode watch rows, with a local TMDB mirror

Watch State needs to support fast Watch Time sums, fast Full/Partial/None derivation, and the Show Refresh behavior (new episodes default to unwatched) already agreed in `CONTEXT.md`. We store one row per `(user, episode)` that exists only when that episode is watched, rather than a compressed "watched through season N" claim plus an exceptions list. We also mirror TMDB's show/season/episode metadata (including runtime) into our own tables, refreshed periodically, rather than calling TMDB live on every read.

## Considered Options

- **Compressed claim + exceptions** (e.g. `seasons_claimed_up_to` + per-episode overrides): rejected. Looks more compact, but if TMDB ever inserts a new episode into a season a user already claimed as fully watched, that episode is silently counted as watched unless someone remembers to add an exception — a trap that produces quietly wrong data rather than a clean failure.
- **Live TMDB calls, no local copy**: rejected. Computing a single Leaderboard total can require summing thousands of episode runtimes; doing that via live API calls on every page load is too slow and risks TMDB's rate limits, and makes the app's core feature depend on TMDB's uptime.
- **Generic TTL cache of raw TMDB responses (e.g. Redis)**: rejected. Reduces call volume, but Watch Time and accordion state need a real join — "sum the runtime of these 2,000 specific episode IDs" — which a cache of opaque JSON blobs can't do in one query; the app would have to fetch, parse, and sum in application code. A cache miss also falls straight back to a live call, reintroducing the exact problem above. A mirror stores the data in the queryable shape the reads actually need, refreshed proactively rather than reactively.
- **Per-episode rows + local mirror (chosen)**: every derived value (Watch Time, Season/Show state) is a plain join over data already in our own database. New episodes default to unwatched automatically, with no special-case logic.

## Consequences

- Requires a periodic sync job against TMDB to keep the local mirror current — this is the same Show Refresh job already needed to detect new seasons/episodes on still-running shows, not additional work.
- Row counts for `watched_episodes` are trivial at personal-app scale (tens of thousands of rows even for a heavy user), so no compression is needed.
