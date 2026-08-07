"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal/Modal";
import { Button } from "@/components/ui/button";
import { PosterArt } from "@/lib/poster-art";

/** The NestJS backend this frontend calls cross-origin (ADR 0004). Re-declared locally, not imported, to avoid a circular import with Home.tsx — same pattern as PosterGrid.tsx. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

/** Debounce window for search-as-you-type, per the ticket (#8). */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Mirrors PosterGrid's `EMPTY_STATE_EXAMPLES` — real, safe, well-known TMDB
 * titles for the "Try one of these" helper (docs/design.md). Since NL
 * parsing is out of scope for #8, these are plain titles to search for, not
 * literal commands.
 */
const HELPER_EXAMPLES = ["Breaking Bad", "The Office", "The Wire"];

/** The wire shape of one `GET /shows/search` candidate. Snake-case, matching the backend (search-shows.dto.ts). */
interface ShowSearchResultWire {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  episode_count: number;
}

/** The wire shape of `POST /shows`'s response — only the fields this component needs to confirm success. */
interface ShowCardWire {
  id: string;
  title: string;
  poster_path: string | null;
  watch_state: "full" | "partial" | "none";
}

interface SearchResult {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
}

function mapSearchResult(wire: ShowSearchResultWire): SearchResult {
  return {
    tmdbId: wire.tmdb_id,
    title: wire.title,
    year: wire.year,
    posterUrl: wire.poster_path ? `${TMDB_IMAGE_BASE}${wire.poster_path}` : null,
  };
}

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; results: SearchResult[] };

interface SpotlightPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Called after each successful add so the caller (Home) can reconcile its `GET /shows` list — see Home.tsx's `showsRefreshKey`. */
  onShowAdded?: () => void;
}

/**
 * Spotlight palette (#8): a centered typeahead over `GET /shows/search`,
 * adding one candidate at a time via `POST /shows` (all episodes watched —
 * `seasons` omitted). docs/design.md also describes a fancier
 * natural-language "parse choreography" (multi-mention commands like
 * "breaking bad 3 seasons", shimmer skeletons, an LLM parse step) — that is
 * a different, not-yet-built ticket; this component only ever searches one
 * plain title at a time and adds one candidate at a time.
 *
 * "Already added" tracking: `ShowCardDto` (`GET /shows`'s wire shape) has no
 * `tmdb_id`, so there's no shared key to match a search result back to an
 * already-added local show without new backend surface. Rather than invent
 * one, this component tracks the `tmdb_id`s the caller has clicked Add on
 * *in this component's lifetime* (the same set the "✓ added" chip already
 * needs) and marks those as added. A show added via the empty-state example
 * buttons (PosterGrid's `EMPTY_STATE_EXAMPLES`) *before* the palette was ever
 * opened won't show as already-added until it's added again here — a real,
 * accepted gap for this ticket, not solved by adding a backend endpoint.
 */
export function SpotlightPalette({ open, onClose, onShowAdded }: SpotlightPaletteProps) {
  const { getToken } = useAuth();
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle" });
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [addingId, setAddingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // `trimmedQuery === ""` alone already hides suggestions/loading/error at
  // render time (below), so there's no separate "idle" reset to perform
  // when the query is cleared — stale `searchState` just goes unrendered.
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!open || trimmedQuery === "") return;

    const requestId = ++requestIdRef.current;

    // Every state transition below — including the "now loading" flip —
    // lives inside this async callback rather than directly in the effect
    // body, matching PosterGrid.tsx's cancellation pattern: a React-Compiler
    // lint (no synchronous setState in an effect) flags setState calls made
    // straight in an effect's own scope, but not ones reached through an
    // async function the effect merely kicks off.
    const timer = setTimeout(() => {
      void (async () => {
        setSearchState({ status: "loading" });
        setErrorMessage(null);
        try {
          const token = await getToken();
          if (requestId !== requestIdRef.current) return;

          const response = await fetch(`${API_URL}/shows/search?q=${encodeURIComponent(trimmedQuery)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (requestId !== requestIdRef.current) return;
          if (!response.ok) throw new Error(`GET /shows/search failed: ${response.status}`);

          const body = (await response.json()) as ShowSearchResultWire[];
          if (requestId !== requestIdRef.current) return;

          setSearchState({ status: "ready", results: body.map(mapSearchResult) });
          setHighlightedIndex(0);
        } catch {
          if (requestId !== requestIdRef.current) return;
          setSearchState({ status: "error" });
          setErrorMessage("Couldn't search shows. Check the spelling, or try again.");
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmedQuery, open, getToken]);

  async function handleAdd(result: SearchResult) {
    if (addedIds.has(result.tmdbId) || addingId !== null) return;

    setAddingId(result.tmdbId);
    setErrorMessage(null);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/shows`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tmdb_id: result.tmdbId }),
      });
      if (!response.ok) throw new Error(`POST /shows failed: ${response.status}`);
      await (response.json() as Promise<ShowCardWire>);

      setAddedIds((prev) => new Set(prev).add(result.tmdbId));
      onShowAdded?.();
    } catch {
      setErrorMessage(`Couldn't add "${result.title}". Try again.`);
    } finally {
      setAddingId(null);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (searchState.status !== "ready" || searchState.results.length === 0) return;
    const { results } = searchState;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[highlightedIndex];
      if (target) void handleAdd(target);
    }
    // Esc isn't handled here — it bubbles to the underlying Dialog, which
    // already closes on Escape (Modal.tsx / Modal.spec.tsx).
  }

  // Reopening should start from a clean box — clear the query, results, and
  // any stale error, but keep `addedIds`: those chips should still read as
  // added if the user reopens the palette and searches for the same show.
  // This lives in the close *event* handler, not an effect watching `open`,
  // per the "derived event" pattern — the parent (Modal/Dialog) already
  // hands us the moment the palette closes; there's no need to infer it by
  // comparing state across renders.
  function handleClose() {
    setQuery("");
    setSearchState({ status: "idle" });
    setHighlightedIndex(0);
    setErrorMessage(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} ariaLabel="Spotlight palette">
      <div className="flex flex-col gap-4 p-5">
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Log watching…"
          aria-label="Search for a show"
          className="h-11 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        {trimmedQuery === "" && <HelperExamples onPick={setQuery} />}

        {trimmedQuery !== "" && searchState.status === "loading" && (
          <p role="status" className="text-sm text-muted-foreground">
            Searching…
          </p>
        )}

        {trimmedQuery !== "" && searchState.status === "ready" && (
          <ul aria-label="Suggestions" role="listbox" className="flex flex-col gap-1">
            {searchState.results.map((result, index) => (
              <SuggestionRow
                key={result.tmdbId}
                result={result}
                highlighted={index === highlightedIndex}
                added={addedIds.has(result.tmdbId)}
                adding={addingId === result.tmdbId}
                onAdd={() => handleAdd(result)}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function HelperExamples({ onPick }: { onPick: (title: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">Try one of these</p>
      <ul className="flex flex-col gap-1">
        {HELPER_EXAMPLES.map((title) => (
          <li key={title}>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => onPick(title)}
            >
              {title}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SuggestionRow({
  result,
  highlighted,
  added,
  adding,
  onAdd,
}: {
  result: SearchResult;
  highlighted: boolean;
  added: boolean;
  adding: boolean;
  onAdd: () => void;
}) {
  return (
    <li
      role="option"
      aria-selected={highlighted}
      className={cn("flex items-center gap-3 rounded-md p-2", highlighted && "bg-secondary")}
    >
      <PosterArt
        title={result.title}
        posterUrl={result.posterUrl}
        className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm text-xs font-bold text-white"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{result.title}</span>
        {result.year !== null && <span className="text-xs text-muted-foreground">{result.year}</span>}
      </div>
      {added ? (
        <span className="shrink-0 rounded-full bg-[var(--full)] px-2 py-0.5 text-[11px] font-bold text-white">
          ✓ added
        </span>
      ) : (
        <Button size="sm" onClick={onAdd} disabled={adding}>
          Add
        </Button>
      )}
    </li>
  );
}
