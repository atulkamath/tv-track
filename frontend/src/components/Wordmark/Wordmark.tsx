import { cn } from "@/lib/utils";

interface WordmarkProps {
  /** Extra class for layout-specific placement (margin, etc.) — merged, not replaced. */
  className?: string;
}

/** The "tv·track" mark. Shared by the sidebar, the signed-out hero, and the auth screens. */
export function Wordmark({ className }: WordmarkProps) {
  return (
    <div className={cn("text-[17px] font-extrabold tracking-[-0.01em]", className)}>
      tv<span className="text-primary">·</span>track
    </div>
  );
}
