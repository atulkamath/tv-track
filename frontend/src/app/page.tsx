"use client";

import { useState } from "react";
import { AppShell, type NavKey } from "@/components/AppShell/AppShell";
import { PosterGrid } from "@/components/PosterGrid/PosterGrid";

export default function Home() {
  const [active, setActive] = useState<NavKey>("home");

  return (
    <AppShell active={active} onNavigate={setActive}>
      <PosterGrid />
    </AppShell>
  );
}
