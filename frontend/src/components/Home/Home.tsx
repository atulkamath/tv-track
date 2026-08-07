"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { AppShell, type NavKey } from "@/components/AppShell/AppShell";
import { PosterGrid } from "@/components/PosterGrid/PosterGrid";
import { Leaderboard } from "@/components/Leaderboard/Leaderboard";

/** The NestJS backend this frontend calls cross-origin (ADR 0004). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * What a signed-in visitor lands on. Rendered only once Clerk confirms a
 * session exists (see `app/page.tsx`'s `<Show when="signed-in">`), so this
 * component's job is narrower: make the *first authenticated call* to the
 * backend, which is what lazily creates the `users` row (#2 — no Clerk
 * webhook, see docs/mvp-scope.md). If that call comes back 401 — the token
 * Clerk handed us expired between page load and the request — send the user
 * to sign-in instead of leaving a broken, half-loaded Home behind.
 */
export function Home() {
  const [active, setActive] = useState<NavKey>("home");
  const { getToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function ensureUserExists() {
      const token = await getToken();
      if (!token || cancelled) return;

      const response = await fetch(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!cancelled && response.status === 401) {
        router.replace("/sign-in");
      }
    }

    void ensureUserExists();
    return () => {
      cancelled = true;
    };
  }, [getToken, router]);

  return (
    <AppShell active={active} onNavigate={setActive}>
      {renderScreen(active, () => setActive("settings"))}
    </AppShell>
  );
}

// Settings has no screen yet — a later ticket's job — so its tab renders
// nothing rather than inventing placeholder copy this ticket wasn't asked
// for. "Add a friend" routes there since that's where docs/design.md puts
// the real affordance ("Settings = ... Add a friend, Pending requests.").
function renderScreen(active: NavKey, onAddFriend: () => void) {
  switch (active) {
    case "home":
      return <PosterGrid />;
    case "leaderboard":
      return <Leaderboard onAddFriend={onAddFriend} />;
    case "settings":
      return null;
  }
}
