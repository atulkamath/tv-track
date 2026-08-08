"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal/Modal";
import { Button } from "@/components/ui/button";
import { PosterArt } from "@/lib/poster-art";

/** The NestJS backend this frontend calls cross-origin (ADR 0004). Re-declared locally, not imported, to avoid a circular import with Home.tsx — same pattern as PosterGrid.tsx / SpotlightPalette.tsx. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

/** The wire shape of one TMDB candidate inside an ambiguous mention (search-shows.dto.ts). */
interface CandidateWire {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  episode_count: number;
}

/** The wire shape of one `POST /shows/parse` ambiguous mention (parse-shows.dto.ts) — matches `SpotlightPalette`'s `AmbiguousMentionWire`, redeclared here so this component stays self-contained like every other component in this app. */
export interface AmbiguousMentionWire {
  title: string;
  seasons: number[] | null;
  candidates: CandidateWire[];
}

/** The wire shape of `POST /shows`'s response — only the field this component needs to confirm success. */
interface ShowCardWire {
  id: string;
}

interface DisambiguationModalProps {
  /**
   * The queue for this batch, fixed for the component's whole lifetime —
   * `Home.tsx` mounts a fresh instance (via a bumped `key`) per batch rather
   * than mutating this prop mid-flow, so the current-mention cursor below
   * never needs to reconcile against a changing array.
   */
  mentions: AmbiguousMentionWire[];
  /** Called once the last mention has been picked or skipped — Home clears its queue, which unmounts this modal. */
  onDone: () => void;
  /** Called after a successful pick so Home can bump `showsRefreshKey` the same way a Spotlight-palette add does. */
  onShowAdded: () => void;
}

/**
 * The Disambiguation Step (#13): a centered modal presenting one `ambiguous`
 * `POST /shows/parse` mention at a time, its TMDB candidates as poster cards.
 * Picking a candidate calls `POST /shows` with that `tmdb_id` and the
 * mention's own `seasons`, then advances; "Skip" advances without creating
 * anything. `Home.tsx` only ever renders this once resolved shows from the
 * same parse are already visible on the wall (its own gating logic, not
 * this component's concern) — by the time this mounts, that's already true.
 *
 * No glow-pop/skeleton treatment here (#12's choreography is specifically
 * for shows landing straight from a parse) — a pick here just bumps the
 * ordinary `showsRefreshKey` refetch, same as the plain single-title add.
 */
export function DisambiguationModal({ mentions, onDone, onShowAdded }: DisambiguationModalProps) {
  const { getToken } = useAuth();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mention = mentions[index];
  if (!mention) return null;

  function advance() {
    setErrorMessage(null);
    if (index + 1 >= mentions.length) {
      onDone();
    } else {
      setIndex((i) => i + 1);
    }
  }

  async function handlePick(candidate: CandidateWire) {
    if (busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/shows`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // `seasons: null` means "the whole show" to the LLM/parse layer, but
        // `CreateShowDto` treats a present `seasons` key as an explicit list
        // — an actual `null` there fails validation rather than meaning
        // "all seasons". Omit the key entirely instead.
        body: JSON.stringify({
          tmdb_id: candidate.tmdb_id,
          ...(mention.seasons !== null ? { seasons: mention.seasons } : {}),
        }),
      });
      if (!response.ok) throw new Error(`POST /shows failed: ${response.status}`);
      await (response.json() as Promise<ShowCardWire>);

      onShowAdded();
      advance();
    } catch {
      setErrorMessage(`Couldn't add "${candidate.title}". Try again, or skip it.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onDone} ariaLabel="Which show did you mean?">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Which show did you mean?</p>
          <h2 className="text-base font-bold">&quot;{mention.title}&quot;</h2>
        </div>

        {mentions.length > 1 && <ProgressDots total={mentions.length} current={index} />}

        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <ul aria-label="Candidates" className="flex flex-wrap gap-3">
          {mention.candidates.map((candidate) => (
            <li key={candidate.tmdb_id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handlePick(candidate)}
                className="flex w-[130px] flex-col gap-1.5 rounded-md text-left disabled:opacity-60"
              >
                <PosterArt
                  title={candidate.title}
                  posterUrl={candidate.poster_path ? `${TMDB_IMAGE_BASE}${candidate.poster_path}` : null}
                  className="relative aspect-[2/3] w-full overflow-hidden rounded-sm text-sm font-bold text-white shadow-card [transition:transform_150ms_ease] hover:scale-[1.03] motion-reduce:[transition:none]"
                />
                <span className="truncate text-sm font-semibold">{candidate.title}</span>
                {candidate.year !== null && <span className="text-xs text-muted-foreground">{candidate.year}</span>}
              </button>
            </li>
          ))}
        </ul>

        <Button type="button" variant="secondary" className="w-fit" onClick={advance} disabled={busy}>
          Skip — don&apos;t add this one
        </Button>
      </div>
    </Modal>
  );
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div role="status" aria-label={`Mention ${current + 1} of ${total}`} className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, dotIndex) => (
        <span
          key={dotIndex}
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            dotIndex === current ? "bg-[var(--accent-solid)]" : "bg-[var(--surface-2)]",
          )}
        />
      ))}
    </div>
  );
}
