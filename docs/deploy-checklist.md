# Deploy checklist (free tier: Vercel + Render + Neon)

## 1. Database — Neon
- [ ] Create a free Neon Postgres project.
- [ ] Copy its connection string.
- [ ] Run `npx prisma migrate deploy` against it (from `backend/`, with `DATABASE_URL` set to the Neon string) to create the schema.

## 2. Backend — Render
- [ ] New Web Service on Render, connect the GitHub repo, root directory `backend/`.
- [ ] Build command: `npm install && npm run build`
- [ ] Start command: `npm run start:prod` (confirmed — runs `node dist/main`)
- [ ] Env vars: `DATABASE_URL` (Neon string), `CLERK_SECRET_KEY` (live, see step 4), `TMDB_ACCESS_TOKEN`, `OPENROUTER_API_KEY`, `FRONTEND_ORIGIN` (your Vercel URL, from step 3 — CORS reads this in `backend/src/configure-app.ts:16`, defaults to `localhost:3000` if unset) — copy every var currently in `backend/.env`.
- [ ] Deploy, then note the Render URL (e.g. `https://tv-track-api.onrender.com`).

## 3. Frontend — Vercel
- [ ] Import the repo into Vercel, root directory `frontend/`.
- [ ] Env vars: `NEXT_PUBLIC_API_URL` = your Render backend URL, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` (live, see step 4).
- [ ] Deploy, note the Vercel URL (e.g. `https://tv-track.vercel.app`).

## 4. Clerk — switch from dev to production keys
- [ ] In the Clerk dashboard, create a **Production** instance.
- [ ] Copy its `pk_live_...` / `sk_live_...` keys into Vercel's and Render's env vars (replacing the `pk_test_`/`sk_test_` ones from local dev).
- [ ] Add the real Vercel domain to Clerk's allowed origins / redirect URLs.

## 5. Wire it together
- [ ] Double check `FRONTEND_ORIGIN` on Render exactly matches the Vercel URL (no trailing slash) — CORS will silently reject requests otherwise.
- [ ] Redeploy both after any env var changes (Vercel/Render don't always hot-reload env vars).

## 6. Smoke test
- [ ] Visit the Vercel URL, sign up with a real (non-dev) Clerk account.
- [ ] Log a show via the Spotlight palette, confirm it lands on the poster wall.
- [ ] Check the Leaderboard and Settings pages load without CORS/auth errors.
