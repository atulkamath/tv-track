import { cn } from "@/lib/utils";

interface WordmarkProps {
  /** Extra class for layout-specific placement (margin, etc.) — merged, not replaced. */
  className?: string;
}

/** Ascending bars — a small nod to tracking progress over time, not a literal TV. */
function WordmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[1.3em] shrink-0" aria-hidden="true">
      <rect x="2" y="12" width="5" height="10" rx="1.5" fill="var(--brand)" opacity="0.45" />
      <rect x="9.5" y="7" width="5" height="15" rx="1.5" fill="var(--brand)" opacity="0.75" />
      <rect x="17" y="2" width="5" height="20" rx="1.5" fill="var(--brand)" />
    </svg>
  );
}

/** The "Tv Track" mark. Shared by the sidebar, the signed-out hero, and the auth screens. */
export function Wordmark({ className }: WordmarkProps) {
  return (
    <div className={cn("flex items-center gap-1.5 text-[17px] font-extrabold tracking-[-0.01em]", className)}>
      <WordmarkIcon />
      <span>
        Tv <span className="text-brand">Track</span>
      </span>
    </div>
  );
}
