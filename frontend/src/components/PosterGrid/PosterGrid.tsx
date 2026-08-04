import styles from "./PosterGrid.module.css";

interface PosterGridProps {
  /** Number of placeholder tiles to render. Real show data lands in a later ticket. */
  count?: number;
}

const DEFAULT_COUNT = 8;

/**
 * Proves the grid breakpoint this early, before any show data exists:
 * `repeat(auto-fill, minmax(168px, 1fr))` on desktop, fixed 3-across under
 * 720px (see AppShell.module.css's breakpoint and docs/design.md).
 */
export function PosterGrid({ count = DEFAULT_COUNT }: PosterGridProps) {
  return (
    <ul className={styles.grid} aria-label="Shows">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={styles.tile} data-testid="poster-placeholder" aria-hidden="true" />
      ))}
    </ul>
  );
}
