"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Plus } from "lucide-react";
import { AppShell, type NavKey } from "@/components/AppShell/AppShell";
import { DisambiguationModal } from "@/components/DisambiguationModal/DisambiguationModal";
import { PosterGrid } from "@/components/PosterGrid/PosterGrid";
import { Leaderboard } from "@/components/Leaderboard/Leaderboard";
import { Settings } from "@/components/Settings/Settings";
import { SpotlightPalette, type AmbiguousMentionWire } from "@/components/SpotlightPalette/SpotlightPalette";
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
  // The Disambiguation Step's (#13) queue for the current parse batch, plus
  // a counter bumped alongside it so DisambiguationModal remounts (a fresh
  // `key`) with a clean internal cursor per batch rather than reconciling
  // its current-mention index against a replaced array.
  const [ambiguousQueue, setAmbiguousQueue] = useState<AmbiguousMentionWire[]>([]);
  const [ambiguousBatchId, setAmbiguousBatchId] = useState(0);
  // AC: "shown only after resolved shows are already visible on the wall."
  // Set whenever a parse resolved at least one show (there's now a wall
  // update worth waiting for), cleared by PosterGrid's `onShowsLoaded` —
  // fired on every settled `GET /shows` attempt, success or failure, so this
  // never gets stuck true if that refetch happens to error out.
  const [awaitingWallUpdate, setAwaitingWallUpdate] = useState(false);
  const { getToken } = useAuth();
  const router = useRouter();

  function handleParseSettled(resolvedShowIds: string[]) {
    setPendingParseCount(0);
    if (resolvedShowIds.length === 0) return;

    setAwaitingWallUpdate(true);
    setShowsRefreshKey((key) => key + 1);
    setGlowShowIds(resolvedShowIds);
    window.setTimeout(() => setGlowShowIds([]), GLOW_DURATION_MS);
  }

  function handleAmbiguous(mentions: AmbiguousMentionWire[]) {
    setAmbiguousQueue(mentions);
    setAmbiguousBatchId((id) => id + 1);
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
          onShowsLoaded: () => setAwaitingWallUpdate(false),
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
        onAmbiguous={handleAmbiguous}
      />
      {/* Mounted only once there's something to show, and only once the
          same parse's resolved shows have already landed (AC) — a fresh
          `key` per batch gives DisambiguationModal a clean cursor rather
          than reconciling against a replaced `mentions` array. */}
      {ambiguousQueue.length > 0 && !awaitingWallUpdate && (
        <DisambiguationModal
          key={ambiguousBatchId}
          mentions={ambiguousQueue}
          onDone={() => setAmbiguousQueue([])}
          onShowAdded={() => setShowsRefreshKey((key) => key + 1)}
        />
      )}
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
    onShowsLoaded,
  }: {
    onAddFriend: () => void;
    onOpenPalette: () => void;
    showsRefreshKey: number;
    friendsRefreshKey: number;
    onFriendAccepted: () => void;
    pendingParseCount: number;
    glowShowIds: string[];
    onShowsLoaded: () => void;
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
          onShowsLoaded={onShowsLoaded}
        />
      );
    case "leaderboard":
      return <Leaderboard onAddFriend={onAddFriend} refreshKey={friendsRefreshKey} />;
    case "settings":
      return <Settings onFriendAccepted={onFriendAccepted} />;
  }
}
