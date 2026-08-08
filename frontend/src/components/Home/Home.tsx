"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Plus } from "lucide-react";
import { AppShell, type NavKey } from "@/components/AppShell/AppShell";
import { PosterGrid } from "@/components/PosterGrid/PosterGrid";
import { Leaderboard } from "@/components/Leaderboard/Leaderboard";
import { Settings } from "@/components/Settings/Settings";
import { SpotlightPalette } from "@/components/SpotlightPalette/SpotlightPalette";
import { Button } from "@/components/ui/button";

/** The NestJS backend this frontend calls cross-origin (ADR 0004). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Slightly longer than the 1.4s CSS animation (globals.css's `--animate-glow-pop`) so the glow class isn't cleared mid-animation. */
const GLOW_DURATION_MS = 1500;

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
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Bumped after a successful Spotlight-palette add so PosterGrid — which
  // owns its own `GET /shows` fetch — refetches rather than going stale
  // (#8: "the poster grid should end up showing it").
  const [showsRefreshKey, setShowsRefreshKey] = useState(0);
  // Same pattern, bumped after Settings accepts a Friend Request so
  // Leaderboard refetches immediately (#16, per #15).
  const [friendsRefreshKey, setFriendsRefreshKey] = useState(0);
  // The parse choreography's (#12) pending/landed state, lifted up from
  // SpotlightPalette the same way `showsRefreshKey` is — the skeleton cards
  // and glow-pop render on PosterGrid's wall itself (docs/design.md:
  // "skeleton cards where shows will land"), not inside the palette modal,
  // so PosterGrid needs to know about a parse in flight even though it has
  // no reference to the palette instance driving it.
  const [pendingParseCount, setPendingParseCount] = useState(0);
  const [glowShowIds, setGlowShowIds] = useState<string[]>([]);
  const { getToken } = useAuth();
  const router = useRouter();

  function handleParseSettled(resolvedShowIds: string[]) {
    setPendingParseCount(0);
    if (resolvedShowIds.length === 0) return;

    setShowsRefreshKey((key) => key + 1);
    setGlowShowIds(resolvedShowIds);
    window.setTimeout(() => setGlowShowIds([]), GLOW_DURATION_MS);
  }

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
    <>
      <AppShell active={active} onNavigate={setActive}>
        {renderScreen(active, {
          onAddFriend: () => setActive("settings"),
          onOpenPalette: () => setPaletteOpen(true),
          showsRefreshKey,
          friendsRefreshKey,
          onFriendAccepted: () => setFriendsRefreshKey((key) => key + 1),
          pendingParseCount,
          glowShowIds,
        })}
      </AppShell>
      {/* The Spotlight palette's FAB (#8, docs/design.md): full-round,
          accent-colored, bottom-right, persistent across tabs — rendered
          at the Home level rather than per-screen. */}
      <Button
        onClick={() => setPaletteOpen(true)}
        aria-label="Log watching"
        className="fixed right-6 bottom-6 z-20 size-14 rounded-full p-0 shadow-modal"
      >
        <Plus className="size-6" aria-hidden="true" />
      </Button>
      <SpotlightPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onShowAdded={() => setShowsRefreshKey((key) => key + 1)}
        onParseStart={setPendingParseCount}
        onParseSettled={handleParseSettled}
      />
    </>
  );
}

// "Add a friend" routes to Settings since that's where docs/design.md puts
// the real affordance ("Settings = ... Add a friend, Pending requests.").
function renderScreen(
  active: NavKey,
  {
    onAddFriend,
    onOpenPalette,
    showsRefreshKey,
    friendsRefreshKey,
    onFriendAccepted,
    pendingParseCount,
    glowShowIds,
  }: {
    onAddFriend: () => void;
    onOpenPalette: () => void;
    showsRefreshKey: number;
    friendsRefreshKey: number;
    onFriendAccepted: () => void;
    pendingParseCount: number;
    glowShowIds: string[];
  },
) {
  switch (active) {
    case "home":
      return (
        <PosterGrid
          onOpenPalette={onOpenPalette}
          refreshKey={showsRefreshKey}
          pendingSkeletonCount={pendingParseCount}
          glowShowIds={glowShowIds}
        />
      );
    case "leaderboard":
      return <Leaderboard onAddFriend={onAddFriend} refreshKey={friendsRefreshKey} />;
    case "settings":
      return <Settings onFriendAccepted={onFriendAccepted} />;
  }
}
