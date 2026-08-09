import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/Wordmark/Wordmark";
import { formatWatchTime } from "@/lib/format-watch-time";
import { PosterArt } from "@/lib/poster-art";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

/** Minimal sample data — you + 3 friends, inline. "You" always wins, since this is selling the competitive hook. */
const PREVIEW_ENTRIES: { name: string; minutes: number; isSelf: boolean }[] = [
  { name: "You", minutes: 4700, isSelf: true },
  { name: "Sam", minutes: 3120, isSelf: false },
  { name: "Priya", minutes: 2460, isSelf: false },
  { name: "Jordan", minutes: 1980, isSelf: false },
];

function PreviewLeaderboardEntry({ rank, name, minutes, isSelf }: { rank: number; name: string; minutes: number; isSelf: boolean }) {
  return (
    <li className={cn("flex items-baseline gap-1.5 border-l border-border pl-3 first:border-l-0 first:pl-0", isSelf && "text-brand")}>
      <span className={cn("text-sm font-bold tabular-nums", !isSelf && "text-muted-foreground")}>{rank}</span>
      <span className="text-sm font-semibold">{name}</span>
      <span className={cn("text-sm font-bold tabular-nums", !isSelf && "text-muted-foreground")}>{formatWatchTime(minutes)}</span>
    </li>
  );
}

/** Minimal inline mock of the real Leaderboard, always showing the viewer in 1st — sells the "outwatch your friends" hook at a glance, in the app's own plain flat-list grammar rather than a boxed/chip treatment. */
function PreviewLeaderboard() {
  return (
    <ol aria-hidden="true" className="flex flex-wrap justify-center gap-3">
      {PREVIEW_ENTRIES.map((entry, index) => (
        <PreviewLeaderboardEntry key={entry.name} rank={index + 1} {...entry} />
      ))}
    </ol>
  );
}

/** Sample states only — the poster paths are real (TMDB's public image CDN needs no auth), looked up once and hardcoded, same pattern as PosterGrid's EMPTY_STATE_EXAMPLES tmdb_ids. */
const PREVIEW_SHOWS: { title: string; posterPath: string; state: "full" | "partial" | "none"; percent?: number }[] = [
  { title: "Breaking Bad", posterPath: "/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg", state: "full" },
  { title: "The Bear", posterPath: "/eKfVzzEazSIjJMrw9ADa2x8ksLz.jpg", state: "partial", percent: 62 },
  { title: "Severance", posterPath: "/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg", state: "full" },
  { title: "Fleabag", posterPath: "/27vEYsRKa3eAniwmoccOoluEXQ1.jpg", state: "none" },
  { title: "The Wire", posterPath: "/4lbclFySvugI51fwsyxBTOm4DqK.jpg", state: "full" },
  { title: "Dark", posterPath: "/apbrbWs8M9lyOpJYU5WXrpFbk1Z.jpg", state: "partial", percent: 40 },
  { title: "Stranger Things", posterPath: "/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg", state: "full" },
  { title: "The Office", posterPath: "/7DJKHzAi83BmQrWLrYYOqcoKfhR.jpg", state: "none" },
  { title: "Friends", posterPath: "/2koX1xLkpTQM4IZebYvKysFW1Nh.jpg", state: "full" },
  { title: "Game of Thrones", posterPath: "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg", state: "partial", percent: 78 },
  { title: "The Simpsons", posterPath: "/uWpG7GqfKGQqX4YMAo3nv5OrglV.jpg", state: "none" },
  { title: "The Crown", posterPath: "/1M876KPjulVwppEpldhdc8V4o68.jpg", state: "full" },
  { title: "Succession", posterPath: "/z0XiwdrCQ9yVIr4O0pxzaAYRxdW.jpg", state: "full" },
  { title: "Ted Lasso", posterPath: "/uRHsiw1wLxPHFXkkv4Ix1s0O6f4.jpg", state: "partial", percent: 55 },
  { title: "Chernobyl", posterPath: "/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg", state: "none" },
  { title: "Better Call Saul", posterPath: "/zjg4jpK1Wp2kiRvtt5ND0kznako.jpg", state: "full" },
];

/** Same visual grammar as the real PosterTile (checkmark, progress bar, dimmed-for-none), hand-rolled and static since this never needs to be clickable. */
function PreviewPosterTile({
  title,
  posterPath,
  state,
  percent,
}: {
  title: string;
  posterPath: string;
  state: "full" | "partial" | "none";
  percent?: number;
}) {
  const isFull = state === "full";
  const isNone = state === "none";
  const fillPercent = isFull ? 100 : (percent ?? 0);

  return (
    <div className={cn("relative aspect-[2/3] overflow-hidden rounded-sm shadow-md", isNone && "brightness-[.6] saturate-[.8]")}>
      <PosterArt title={title} posterUrl={`${TMDB_IMAGE_BASE}${posterPath}`} />
      {isFull && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 flex size-[16px] items-center justify-center rounded-full bg-green-500 text-white"
        >
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      )}
      {!isNone && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-muted">
          <div className={cn("h-full", isFull ? "bg-green-500" : "bg-brand")} style={{ width: `${fillPercent}%` }} />
        </div>
      )}
    </div>
  );
}

/** The actual wall, full width — same grid classes as the real PosterGrid, not a boxed-in preview card. */
function PreviewWall() {
  return (
    <ul aria-hidden="true" className="grid list-none grid-cols-4 gap-3 min-[720px]:grid-cols-8">
      {PREVIEW_SHOWS.map((show) => (
        <li key={show.title}>
          <PreviewPosterTile {...show} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Signed-out landing: a one-screen hero, not a multi-section marketing page.
 * Sign up is the one loud brand-accented action (matches Home's "Log
 * watching" CTA); Sign in stays quiet, since a returning user already knows
 * where they're going. Below: a mock Leaderboard with the viewer in 1st
 * (the "outwatch your friends" hook, shown not just said), then the actual
 * poster wall, full width, real art, real full/partial/none language.
 */
export function Hero() {
  return (
    <section className="flex min-h-dvh flex-col items-center gap-8 px-4 py-10 text-center">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <Wordmark className="animate-empty-in text-[28px] motion-reduce:animate-none" />
        <p
          className="max-w-[32ch] animate-empty-in text-[17px] font-medium text-muted-foreground motion-reduce:animate-none"
          style={{ animationDelay: "90ms" }}
        >
          Log what you watch. Outwatch your friends.
        </p>
        <div className="flex animate-empty-in gap-3 motion-reduce:animate-none" style={{ animationDelay: "180ms" }}>
          <Link
            href="/sign-in"
            className="cursor-pointer rounded-md border border-border bg-transparent px-5 py-2.5 text-[15px] font-bold text-foreground hover:bg-muted"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="cursor-pointer rounded-md bg-brand px-5 py-2.5 text-[15px] font-bold text-brand-foreground shadow-lg hover:bg-brand/90"
          >
            Sign up
          </Link>
        </div>
      </div>
      <div className="flex w-full max-w-6xl animate-empty-in flex-col gap-6 motion-reduce:animate-none" style={{ animationDelay: "270ms" }}>
        <PreviewLeaderboard />
        <PreviewWall />
      </div>
    </section>
  );
}
