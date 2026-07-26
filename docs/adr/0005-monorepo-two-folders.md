# Monorepo: backend/ and frontend/ in one git repo

ADR 0004 decided two codebases (NestJS backend, separate Next.js frontend) but not whether that's one git repo or two. Ticket #2 (backend skeleton) and ticket #3 (app shell) each start `/implement` in a fresh session, so this needs to be settled once, in writing, rather than left for the first ticket to improvise and the second to guess.

Chosen: one repo, two top-level folders.

```
tv-track/
  backend/    ← NestJS
  frontend/   ← Next.js
  docs/
  CONTEXT.md
```

## Considered Options

- **Two separate git repos (rejected)**: matches "two deployments" most literally, but this is a solo project — separate repos add remote-juggling and cross-repo versioning with no corresponding benefit here.
- **One repo, two folders (chosen)**: keeps the single issue tracker, docs, and CONTEXT.md meaningfully attached to both halves of the app. Each folder still has its own `package.json` and deploys independently (frontend to Vercel, backend wherever); the repo boundary and the deploy boundary don't have to match.

## Consequences

- Backend and frontend dependency trees stay fully independent (no shared `node_modules`, no workspace tooling required unless later needed).
- A ticket touching both sides (rare, given the API-surface split) produces one PR instead of two.
