"use client";

import { useState } from "react";
import { AppShell, type NavKey } from "@/components/AppShell/AppShell";
import { PosterGrid } from "@/components/PosterGrid/PosterGrid";
import { Leaderboard } from "@/components/Leaderboard/Leaderboard";

export default function Home() {
  const [active, setActive] = useState<NavKey>("home");

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
