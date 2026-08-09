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

/** Grouped so the two modes (one show vs. several) read as a choice, not three identical rows. Clicking fills the input verbatim. */
const HELPER_GROUPS: { label: string; examples: { text: string; caption: string }[] }[] = [
  { label: "One show at a time", examples: [{ text: "simpsons", caption: "Searches as you type, then Add" }] },
  {
    label: "Multiple, in one line",
    examples: [
      { text: "breaking bad 3 seasons", caption: "Marks seasons 1–3 watched" },
      { text: "friends, the office 2 seasons", caption: "Adds both at once" },
    ],
  },
];

/**
 * The NLP-mode heuristic (#12 AC: "Multi-title or seasons-bearing input
 * flips the CTA to 'Add N shows'"). Client-side and deliberately simple —
 * the server (`POST /shows/parse`) does the real resolution, so this only
 * has to route docs/design.md's three canonical examples correctly:
 * "simpsons" (plain, stays in typeahead mode), "breaking bad 3 seasons" and
 * "friends, the office 2 seasons" (both NLP mode).
 */
const NLP_MODE_PATTERN = /,| and |\bseasons?\b|\bepisodes?\b/i;

function isNlpMode(text: string): boolean {
  return NLP_MODE_PATTERN.test(text);
}

/** Titles whose own "and" must survive the split below — mirrors PARSE_SYSTEM_PROMPT's own examples on the backend. */
const AND_TITLES = [/rick\s+and\s+morty/gi, /law\s+and\s+order/gi, /will\s+and\s+grace/gi];

/** A client-side estimate for the CTA label and skeleton count — not authoritative, the real count comes back from `POST /shows/parse`. */
function estimateMentionCount(text: string): number {
  const masked = AND_TITLES.reduce((acc, pattern) => acc.replace(pattern, (m) => m.replace(/\s+and\s+/i, " & ")), text);
  return masked
    .split(/,| and /i)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

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

/** The wire shape of one `POST /shows/parse` unmatched mention (parse-shows.dto.ts). */
interface UnmatchedMentionWire {
  title: string;
  reason: "no_tmdb_match" | "progress_not_understood";
}

/** The wire shape of one `POST /shows/parse` ambiguous mention — handed to `onAmbiguous` for the Disambiguation Step (#13) to consume; this component never renders it itself. */
export interface AmbiguousMentionWire {
  title: string;
  seasons: number[] | null;
  candidates: ShowSearchResultWire[];
}

/** The wire shape of `POST /shows/parse`'s response (parse-shows.dto.ts). */
interface ParseResponseWire {
  resolved: ShowCardWire[];
  ambiguous: AmbiguousMentionWire[];
  unmatched: UnmatchedMentionWire[];
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

type ParseState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; unmatched: UnmatchedMentionWire[] };

interface SpotlightPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Called after each successful single-title add so the caller (Home) can reconcile its `GET /shows` list — see Home.tsx's `showsRefreshKey`. */
  onShowAdded?: () => void;
  /**
   * Fired the moment a parse (#12, `POST /shows/parse`) starts, with the
   * client-side estimated mention count — lets Home render that many
   * shimmer skeleton cards on the poster wall itself, in the positions the
   * resolved shows are about to occupy (docs/design.md: "skeleton cards
   * where shows will land"), not just inside this modal.
   */
  onParseStart?: (pendingCount: number) => void;
  /**
   * Fired once a parse settles — success or failure — with the ids of any
   * `resolved` shows (empty on failure or when nothing resolved). Home uses
   * this to clear the skeleton count and, when non-empty, bump the same
   * `showsRefreshKey` refetch `onShowAdded` triggers and glow-pop exactly
   * those newly-landed tiles.
   */
  onParseSettled?: (resolvedShowIds: string[]) => void;
  /** Fired with a parse's `ambiguous` mentions (#13's Disambiguation Step queue) whenever the list is non-empty — never with an empty array, so Home doesn't have to filter a no-op call. */
  onAmbiguous?: (mentions: AmbiguousMentionWire[]) => void;
}

/**
 * Spotlight palette: a centered box over two backend calls depending on what
 * looks typed. Plain single-title text (#8) stays a live `GET /shows/search`
 * typeahead, adding one candidate at a time via `POST /shows` (all episodes
 * watched — `seasons` omitted). Multi-title or seasons/episodes-bearing text
 * (#12, `isNlpMode` above) instead runs `POST /shows/parse` on Enter/CTA
 * click — the typeahead search is skipped entirely so the two modes never
 * race. See docs/design.md's "Parse choreography" for the skeleton/glow
 * choreography, which is lifted into Home.tsx/PosterGrid.tsx via
 * `onParseStart`/`onParseSettled` above since it renders on the wall itself,
 * not in this modal.
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
export function SpotlightPalette({ open, onClose, onShowAdded, onParseStart, onParseSettled, onAmbiguous }: SpotlightPaletteProps) {
  const { getToken } = useAuth();
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle" });
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [addingId, setAddingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parseState, setParseState] = useState<ParseState>({ status: "idle" });
  const requestIdRef = useRef(0);

  // `trimmedQuery === ""` alone already hides suggestions/loading/error at
  // render time (below), so there's no separate "idle" reset to perform
  // when the query is cleared — stale `searchState` just goes unrendered.
  const trimmedQuery = query.trim();
  const nlpMode = trimmedQuery !== "" && isNlpMode(trimmedQuery);

  useEffect(() => {
    // NLP-mode input skips the typeahead search entirely (#12 AC:
    // "suggestions yield") — the two modes call different endpoints and
    // shouldn't race.
    if (!open || trimmedQuery === "" || nlpMode) return;

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
  }, [trimmedQuery, open, getToken, nlpMode]);

  async function handleParse() {
    if (parseState.status === "loading") return;

    const text = trimmedQuery;
    setParseState({ status: "loading" });
    setErrorMessage(null);
    onParseStart?.(estimateMentionCount(text));

    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/shows/parse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(`POST /shows/parse failed: ${response.status}`);

      const body = (await response.json()) as ParseResponseWire;
      if (body.ambiguous.length > 0) onAmbiguous?.(body.ambiguous);
      setParseState({ status: "done", unmatched: body.unmatched });
      onParseSettled?.(body.resolved.map((show) => show.id));
      // Nothing left to fix — clear the box for the next command. When
      // there's unmatched text, the query is left as-is (AC: "the original
      // text still visible").
      if (body.unmatched.length === 0) setQuery("");
    } catch {
      setParseState({ status: "idle" });
      setErrorMessage("Couldn't parse that. Check the spelling, or try again.");
      onParseSettled?.([]);
    }
  }

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
    if (nlpMode) {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleParse();
      }
      return;
    }

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
    setParseState({ status: "idle" });
    onClose();
  }

  const mentionCount = estimateMentionCount(trimmedQuery);

  return (
    <Modal open={open} onClose={handleClose} ariaLabel="Spotlight palette">
      <div className="flex flex-col gap-4 p-5">
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            // A fresh edit invalidates a stale "done" parse result (the
            // unmatched strip, in particular) — go back to idle rather than
            // showing feedback for text that's no longer what's typed.
            setParseState({ status: "idle" });
          }}
          onKeyDown={handleKeyDown}
          placeholder="Log watching…"
          aria-label="Search for a show"
          className="h-11 rounded-md border border-border bg-input/30 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        {trimmedQuery === "" && <HelperExamples onPick={setQuery} />}

        {trimmedQuery !== "" && !nlpMode && searchState.status === "loading" && (
          <p role="status" className="text-sm text-muted-foreground">
            Searching…
          </p>
        )}

        {trimmedQuery !== "" && !nlpMode && searchState.status === "ready" && (
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

        {trimmedQuery !== "" && nlpMode && (
          <div className="flex flex-col gap-3">
            {parseState.status === "loading" ? (
              <DotsPill />
            ) : (
              <Button type="button" className="w-fit" onClick={() => void handleParse()}>
                {`Add ${mentionCount} ${mentionCount === 1 ? "show" : "shows"}`}
              </Button>
            )}

            {parseState.status === "done" && parseState.unmatched.length > 0 && <UnmatchedStrip />}
          </div>
        )}
      </div>
    </Modal>
  );
}

function HelperExamples({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Try one of these</p>
      {HELPER_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</p>
          <ul className="flex flex-col gap-1">
            {group.examples.map((example) => (
              <li key={example.text}>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-auto w-full flex-col items-start gap-0.5 py-2"
                  onClick={() => onPick(example.text)}
                >
                  <span>{example.text}</span>
                  <span className="text-xs font-normal text-muted-foreground">{example.caption}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The dots-pill loading indicator (#12, docs/design.md: "Parse
 * choreography: dots-pill + shimmer skeleton cards..."). Placed here, next
 * to the CTA it replaces while a parse is in flight, rather than by the FAB
 * or on the grid — the grid's own feedback is the shimmer skeleton cards
 * (PosterGrid.tsx), and the FAB has no state of its own once the palette is
 * open.
 */
function DotsPill() {
  return (
    <div
      role="status"
      className="flex w-fit items-center gap-1.5 rounded-full bg-muted px-3 py-2"
    >
      <span className="sr-only">Parsing…</span>
      <span
        aria-hidden="true"
        className="size-1.5 animate-bounce rounded-full bg-muted-foreground motion-reduce:animate-none [animation-delay:-0.3s]"
      />
      <span
        aria-hidden="true"
        className="size-1.5 animate-bounce rounded-full bg-muted-foreground motion-reduce:animate-none [animation-delay:-0.15s]"
      />
      <span
        aria-hidden="true"
        className="size-1.5 animate-bounce rounded-full bg-muted-foreground motion-reduce:animate-none"
      />
    </div>
  );
}

/**
 * A parse that couldn't match some text (docs/design.md's error section,
 * exact copy). Inline and non-dismissing, not a toast/modal — the AC is
 * "not a dead end", and the typed text stays visible because `handleParse`
 * deliberately leaves `query` untouched whenever `unmatched` is non-empty.
 */
function UnmatchedStrip() {
  return (
    <p role="alert" className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
      Couldn&apos;t match that. Check the spelling, or try &quot;show name 3 seasons&quot;.
    </p>
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
        <span className="shrink-0 rounded-full bg-green-500 px-2 py-0.5 text-[11px] font-bold text-white">
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
