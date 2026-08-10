"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Deterministic per-title background so a missing/unloaded poster is still readable and distinct, not a flat gray box. */
export function seededGradient(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return `linear-gradient(160deg, hsl(${hue} 45% 22%), hsl(${(hue + 40) % 360} 40% 12%))`;
}

export function initials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
}

interface PosterArtProps {
  title: string;
  posterUrl: string | null;
  /** Overrides the default full-bleed sizing — the Spotlight palette's suggestion rows (#8) need a small thumbnail, not a full poster tile. */
  className?: string;
}

/**
 * Real TMDB art when available, else a deterministic seeded gradient with
 * initials (docs/design.md: "seeded-placeholder + gradient/initials fallback
 * while loading or offline"). Shared by PosterGrid's poster tiles and the
 * Spotlight palette's suggestion-row thumbnails so both read the same
 * missing-art treatment — extracted here rather than duplicated per
 * docs/design.md's fallback-art pattern.
 *
 * The gradient+initials placeholder stays visible under the `<img>` until it
 * finishes loading, then the image crossfades in — the standard pattern for
 * image-heavy grids (a skeleton across a whole wall of tiles reads as broken,
 * not loading; a placeholder that already looks like content doesn't).
 */
export function PosterArt({ title, posterUrl, className }: PosterArtProps) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showFallback = !posterUrl || errored;

  return (
    <div
      className={className ?? "relative flex size-full items-center justify-center text-lg font-bold text-white"}
      style={{ background: seededGradient(title) }}
    >
      {!showFallback && (
        <img
          // A cached image can finish loading before React attaches onLoad (e.g. on a refresh) — the
          // ref callback catches that case via `complete`, which onLoad alone would miss forever.
          ref={(el) => {
            if (el?.complete) setLoaded(true);
          }}
          src={posterUrl}
          alt={title}
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-300 ease-out",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}
      {(showFallback || !loaded) && <span aria-hidden="true">{initials(title)}</span>}
    </div>
  );
}
