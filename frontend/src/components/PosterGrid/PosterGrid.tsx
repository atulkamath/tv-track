interface PosterGridProps {
  /** Number of placeholder tiles to render. Real show data lands in a later ticket. */
  count?: number;
}

const DEFAULT_COUNT = 8;

/**
 * Proves the grid breakpoint this early, before any show data exists:
 * `repeat(auto-fill, minmax(168px, 1fr))` on desktop, fixed 3-across under
 * 720px (see docs/design.md).
 */
export function PosterGrid({ count = DEFAULT_COUNT }: PosterGridProps) {
  return (
    <ul
      className="grid list-none grid-cols-3 gap-4 min-[720px]:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]"
      aria-label="Shows"
    >
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          className="aspect-[2/3] rounded-sm bg-surface shadow-card [transition:transform_180ms_ease] hover:scale-[1.045] motion-reduce:[transition:none]"
          data-testid="poster-placeholder"
          aria-hidden="true"
        />
      ))}
    </ul>
  );
}
