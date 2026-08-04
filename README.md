# tv-track

**Work in progress.** A personal TV-watching tracker — log what you watch via natural language, accrue Watch Time, compare with friends on a Leaderboard.

The real point of this project is learning agentic engineering: building a real product spec-first, ticket-by-ticket, with an AI agent doing the implementation and me doing the direction, review, and judgment calls. `backend/` is a NestJS API; `frontend/` is Next.js (see `docs/adr/`). Progress is tracked as GitHub Issues, one per ticket.

## Where to look

- `CONTEXT.md` — domain glossary (User, Friend Code, Watch State, etc.)
- `docs/mvp-scope.md` — agreed MVP scope and API surface
- `docs/design.md` — visual design system (tokens, components, copy rules)
- `docs/adr/` — architectural decisions and why
- `CLAUDE.md` — how an agent should work in this repo

## Running it

- Backend: `cd backend && npm install && npm test`
- Frontend: `cd frontend && npm install && npm run dev`

Each folder has its own `package.json` and deploys independently (see ADR 0005).
