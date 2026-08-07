interface PlaceholderGridProps {
  /** Number of placeholder tiles to render. */
  count?: number;
}

const DEFAULT_COUNT = 8;

/**
 * The decorative mock grid for the signed-out Hero (docs/design.md: "mock
 * poster grid beneath" the sign-in/sign-up actions) — seeded empty tiles,
 * no fetch, no auth. This used to be `PosterGrid` itself before #7 turned
 * that component into Home's real, data-fetching wall; this piece was split
 * out so Hero keeps a static preview instead of trying to authenticate.
 */
export function PlaceholderGrid({ count = DEFAULT_COUNT }: PlaceholderGridProps) {
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
