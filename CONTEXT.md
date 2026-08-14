# tv-track

A personal TV-watching tracker: each user logs their own watching, accrues total watch time, and compares standings against friends on a leaderboard.

## Language

**User**:
A person with an account in the app. Owns their own watch history; nothing about another user's data is editable by anyone but them.
_Avoid_: Account, member

**Friend Request**:
An invitation from one User to another to become friends, initiated by looking the other User up via their Friend Code or email. Exists in a pending state until accepted or declined — looking someone up never creates a Friendship by itself.
_Avoid_: Invite, follow request

**Friend Code**:
A 6-character alphanumeric identifier (excludes ambiguous characters like 0/O, 1/I/L), unique per User, shown in Settings and regenerable. Used, alongside email, to look someone up when sending a Friend Request.
_Avoid_: Invite code, referral code

**Friendship**:
A mutual, accepted connection between two Users, formed once a Friend Request is accepted. Only Users with an active Friendship can see each other on a Leaderboard.
_Avoid_: Follow, connection

**Leaderboard**:
A ranking of a User and their Friends by total watch time, used to compare who is "leading."
_Avoid_: Rankings, standings

**Watch Time**:
A User's total, computed live as the sum of runtimes across every Episode currently in the Full or Partial-and-checked state on their own list, each counted once per Rewatch. Not a historical ledger — unchecking, refreshing, or deleting a Show simply removes its Episodes from the sum, with no effect on any other User's total.
_Avoid_: Score, points

**Rewatch**:
Another pass through a Show the User has already watched, logged from the show itself rather than by re-ticking Episodes. Each Rewatch accrues that Show's runtime to Watch Time again, and can be taken back one at a time. It only counts the Episodes they had actually checked — a Rewatch of a Partial Show accrues the watched part and leaves the Show Partial. Watch State never changes; a Show watched five times is still just Full, and undoing every Rewatch bottoms out at the first watch rather than unmarking anything.
_Avoid_: Replay, second watch

**NLP Entry**:
A free-text box where a User types shows and season counts in natural language (e.g. "the office us 5 seasons"); the app resolves each mention to a Show via TMDB and marks every Episode in the stated Seasons as watched by default. Unambiguous mentions resolve into cards immediately; mentions matching multiple TMDB Shows (e.g. "the office") are queued into a Disambiguation Step shown right after, never blocking the mentions that were clear.
_Avoid_: AI entry, smart add

**Disambiguation Step**:
A one-at-a-time prompt shown after NLP Entry submission for each show mention that matched more than one TMDB Show, asking the User to pick which one they meant before that card is created.
_Avoid_: Confirmation dialog, resolver

**Watch State**:
The watched/unwatched status of an Episode, Season, or Show, expressed as one of three values: **Full** (everything watched), **Partial** (some but not all watched), or **None** (nothing watched). A Season's state is derived from its Episodes; a Show's state is derived from its Seasons.
_Avoid_: Progress, completion

**Episode**, **Season**, **Show**:
The TMDB catalog hierarchy a User logs against. A Show has Seasons; a Season has Episodes. Watch time is summed from Episode runtimes.

**Show Refresh**:
A background check against TMDB that detects new Seasons/Episodes added to a Show a User has logged. New Episodes are added in the **None** Watch State, which can flip an already-Full Show down to **Partial** until the User confirms them.
_Avoid_: Sync, update
