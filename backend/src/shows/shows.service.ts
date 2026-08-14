import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LLM_CLIENT, type LlmClient } from '../integrations/llm/llm-client';
import { TMDB_CLIENT, type TmdbClient, type TmdbShowSummary } from '../integrations/tmdb/tmdb-client';
import type { CreateShowDto } from './create-show.dto';
import { pickConfidentMatch } from './match-candidate';
import {
  toAmbiguousMentionDto,
  type AmbiguousMentionDto,
  type ParseShowsResultDto,
  type UnmatchedMentionDto,
} from './parse-shows.dto';
import {
  toShowCardDtoFromCounts,
  toShowDetailDto,
  type ShowCardDto,
  type ShowCounts,
  type ShowDetailDto,
} from './show.dto';
import type { ToggleWatchedDto } from './toggle-watched.dto';

/** `Show.seasons[].episodes[].watchedBy` filtered to one caller — see `ShowTree`. */
function showTreeInclude(userId: string) {
  return {
    seasons: {
      orderBy: { seasonNumber: 'asc' as const },
      include: {
        episodes: {
          orderBy: { episodeNumber: 'asc' as const },
          include: { watchedBy: { where: { userId } } },
        },
      },
    },
  };
}

/** How long an identical query is served from cache instead of hitting TMDB. */
const CACHE_TTL_MS = 30_000;

/**
 * Caps how many distinct queries are remembered at once, so a stream of
 * never-repeated typeahead keystrokes can't grow the cache forever. Eviction
 * is oldest-first (Map preserves insertion order) rather than a real LRU —
 * plenty for a typeahead's cache, not worth more machinery.
 */
const MAX_CACHE_ENTRIES = 100;

interface CacheEntry {
  expiresAt: number;
  results: TmdbShowSummary[];
}

/**
 * Backs `GET /shows/search`. A thin passthrough to TMDB — this ticket writes
 * nothing to the local mirror (see `docs/mvp-scope.md`) — with a short cache
 * so retyping or re-focusing the Spotlight palette doesn't refire the same
 * TMDB call on every keystroke.
 */
@Injectable()
export class ShowsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @Inject(TMDB_CLIENT) private readonly tmdb: TmdbClient,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    private readonly prisma: PrismaService,
  ) {}

  async search(query: string): Promise<TmdbShowSummary[]> {
    const key = normalize(query);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.results;
    }

    const results = await this.tmdb.searchShows(query);
    this.remember(key, results);
    return results;
  }

  /** Backs `POST /shows`. See `create-show.dto.ts` for the payload shape. */
  async addShow(user: User, dto: CreateShowDto): Promise<ShowCardDto> {
    const mirrored = await this.mirrorShow(dto.tmdb_id);

    const targetEpisodeIds = mirrored.seasons
      .filter((season) => !dto.seasons || dto.seasons.includes(season.seasonNumber))
      .flatMap((season) => season.episodes.map((episode) => episode.id));

    await this.prisma.watchedEpisode.createMany({
      data: targetEpisodeIds.map((episodeId) => ({ userId: user.id, episodeId })),
      skipDuplicates: true,
    });

    const show = await this.prisma.show.findUniqueOrThrow({
      where: { id: mirrored.id },
      select: { id: true, title: true, posterPath: true },
    });
    const counts = await this.countEpisodesForShows(user.id, [show.id]);
    return toShowCardDtoFromCounts(show, counts.get(show.id));
  }

  /**
   * Backs `POST /shows/parse` (#11). Runs the LLM once for the whole
   * sentence, then resolves each mention against TMDB independently — one
   * mention failing to resolve never blocks the others. A mention whose
   * `seasons` came back `[]` (LLM understood the show but not how much was
   * watched) never reaches TMDB at all: creating it anyway would either
   * silently write nothing (an empty `seasons` filter matches no season) or,
   * worse, get misread as "mark it all watched."
   */
  async parseText(user: User, text: string): Promise<ParseShowsResultDto> {
    const mentions = await this.llm.parseShowMentions(text);

    const resolved: ShowCardDto[] = [];
    const ambiguous: AmbiguousMentionDto[] = [];
    const unmatched: UnmatchedMentionDto[] = [];

    for (const mention of mentions) {
      if (mention.seasons !== null && mention.seasons.length === 0) {
        unmatched.push({ title: mention.title, reason: 'progress_not_understood' });
        continue;
      }

      const candidates = await this.search(mention.title);
      if (candidates.length === 0) {
        unmatched.push({ title: mention.title, reason: 'no_tmdb_match' });
        continue;
      }

      const match = pickConfidentMatch(mention.title, candidates);
      if (!match) {
        ambiguous.push(toAmbiguousMentionDto(mention.title, mention.seasons, candidates));
        continue;
      }

      const card = await this.addShow(user, { tmdb_id: match.tmdbId, seasons: mention.seasons ?? undefined });
      resolved.push(card);
    }

    return { resolved, ambiguous, unmatched };
  }

  /**
   * Backs `GET /shows` — every show the caller has watched at least one
   * episode of. Counts come from a `GROUP BY`, not a hydrated season/episode
   * tree: a card needs two integers, and fetching every Episode row to count
   * them meant a large library moved megabytes out of the database per load
   * to produce a few KB of JSON. Costs two queries flat, whatever the size.
   */
  async listShows(user: User): Promise<ShowCardDto[]> {
    const shows = await this.prisma.show.findMany({
      where: { seasons: { some: { episodes: { some: { watchedBy: { some: { userId: user.id } } } } } } },
      select: { id: true, title: true, posterPath: true },
      orderBy: { title: 'asc' },
    });

    const counts = await this.countEpisodesForShows(
      user.id,
      shows.map((show) => show.id),
    );
    return shows.map((show) => toShowCardDtoFromCounts(show, counts.get(show.id)));
  }

  /**
   * Episode/watched tallies for several shows in one query. `LEFT JOIN` so a
   * show with nothing watched still reports its episode count, and the
   * `user_id` predicate lives in the join rather than the `WHERE` — in the
   * `WHERE` it would drop those unwatched rows and turn the outer join back
   * into an inner one.
   */
  private async countEpisodesForShows(userId: string, showIds: string[]): Promise<Map<string, ShowCounts>> {
    if (showIds.length === 0) return new Map();

    const rows = await this.prisma.$queryRaw<
      { show_id: string; episode_count: number; watched_count: number; max_plays: number }[]
    >`
      SELECT s.show_id,
             COUNT(e.id)::int AS episode_count,
             COUNT(we.id)::int AS watched_count,
             COALESCE(MAX(we.plays), 0)::int AS max_plays
      FROM seasons s
      JOIN episodes e ON e.season_id = s.id
      LEFT JOIN watched_episodes we ON we.episode_id = e.id AND we.user_id = ${userId}::uuid
      WHERE s.show_id IN (${Prisma.join(showIds.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY s.show_id
    `;

    return new Map(
      rows.map((row) => [
        row.show_id,
        { episodeCount: Number(row.episode_count), watchedCount: Number(row.watched_count), maxPlays: Number(row.max_plays) },
      ]),
    );
  }

  /** Backs `GET /shows/:id` — the full season/episode tree for one show's accordion. */
  async getShowDetail(user: User, showId: string): Promise<ShowDetailDto> {
    const show = await this.prisma.show.findUnique({
      where: { id: showId },
      include: showTreeInclude(user.id),
    });
    if (!show) {
      throw new NotFoundException('Show not found.');
    }
    return toShowDetailDto(show);
  }

  /**
   * Backs `PUT /shows/:id/episodes/:episodeId`. `dto.watched` is the target
   * state, not a flip — marking an already-watched episode watched (or an
   * already-unwatched one unwatched) is a no-op, which is what makes this a
   * true idempotent PUT rather than a toggle.
   */
  async setEpisodeWatched(user: User, showId: string, episodeId: string, dto: ToggleWatchedDto): Promise<ShowDetailDto> {
    const episode = await this.prisma.episode.findFirst({ where: { id: episodeId, season: { showId } } });
    if (!episode) {
      throw new NotFoundException('Episode not found.');
    }

    if (dto.watched) {
      await this.prisma.watchedEpisode.upsert({
        where: { userId_episodeId: { userId: user.id, episodeId } },
        create: { userId: user.id, episodeId },
        update: {},
      });
    } else {
      await this.prisma.watchedEpisode.deleteMany({ where: { userId: user.id, episodeId } });
    }

    return this.getShowDetail(user, showId);
  }

  /**
   * Backs `PUT /shows/:id/seasons/:seasonNumber`. Marks/unmarks every episode
   * in the season in one shot — same target-state idempotency as the episode
   * toggle, just applied to the whole set.
   */
  async setSeasonWatched(user: User, showId: string, seasonNumber: number, dto: ToggleWatchedDto): Promise<ShowDetailDto> {
    const season = await this.prisma.season.findFirst({
      where: { showId, seasonNumber },
      include: { episodes: true },
    });
    if (!season) {
      throw new NotFoundException('Season not found.');
    }

    const episodeIds = season.episodes.map((episode) => episode.id);

    if (dto.watched) {
      await this.prisma.watchedEpisode.createMany({
        data: episodeIds.map((episodeId) => ({ userId: user.id, episodeId })),
        skipDuplicates: true,
      });
    } else {
      await this.prisma.watchedEpisode.deleteMany({ where: { userId: user.id, episodeId: { in: episodeIds } } });
    }

    return this.getShowDetail(user, showId);
  }

  /**
   * Backs `POST /shows/:id/rewatch`. Bumps `plays` on the episodes the caller
   * has *already* watched, so the show's runtime accrues to Watch Time a
   * second time. Deliberately creates no new rows: a Rewatch on a Partial show
   * counts the part they'd actually seen rather than quietly promoting the
   * show to Full, which would let a rewatch edit Watch State behind their back.
   */
  async rewatchShow(user: User, showId: string): Promise<ShowDetailDto> {
    const show = await this.prisma.show.findUnique({ where: { id: showId } });
    if (!show) {
      throw new NotFoundException('Show not found.');
    }

    await this.prisma.watchedEpisode.updateMany({
      where: { userId: user.id, episode: { season: { showId } } },
      data: { plays: { increment: 1 } },
    });

    return this.getShowDetail(user, showId);
  }

  /**
   * Backs `DELETE /shows/:id/rewatch` — takes back one Rewatch. The `plays > 1`
   * filter is the floor: a watched Episode is always at least one play, so
   * undoing past the first watch is a no-op rather than a way to zero out
   * Watch Time while the Episode still reads as watched.
   */
  async undoRewatchShow(user: User, showId: string): Promise<ShowDetailDto> {
    const show = await this.prisma.show.findUnique({ where: { id: showId } });
    if (!show) {
      throw new NotFoundException('Show not found.');
    }

    await this.prisma.watchedEpisode.updateMany({
      where: { userId: user.id, episode: { season: { showId } }, plays: { gt: 1 } },
      data: { plays: { decrement: 1 } },
    });

    return this.getShowDetail(user, showId);
  }

  /**
   * Backs `DELETE /shows/:id`. Removes only the caller's own `WatchedEpisode`
   * rows for this show — the TMDB mirror (`Show`/`Season`/`Episode`) is shared
   * (ADR 0002) and is never touched, so another user's copy of the same show,
   * and their Watch Time, are unaffected.
   */
  async removeShow(user: User, showId: string): Promise<void> {
    const show = await this.prisma.show.findUnique({ where: { id: showId } });
    if (!show) {
      throw new NotFoundException('Show not found.');
    }

    await this.prisma.watchedEpisode.deleteMany({
      where: { userId: user.id, episode: { season: { showId } } },
    });
  }

  /** Backs `GET /me/watch-time` — summed live, never stored (CONTEXT.md → Watch Time). */
  async getWatchTime(user: User): Promise<number> {
    const totals = await this.getWatchTimeForUsers([user.id]);
    return totals.get(user.id) ?? 0;
  }

  /** Watch Time for several people in one round trip, so the Leaderboard costs one query rather than one per Friend. Raw SQL because the sum crosses a relation, which Prisma's `groupBy` cannot aggregate over. */
  async getWatchTimeForUsers(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    // COALESCE mirrors the old `?? 0`: an episode with no published runtime
    // contributes nothing, and someone with no watched rows totals zero.
    // `* we.plays` is what makes a Rewatch accrue Watch Time again.
    const rows = await this.prisma.$queryRaw<{ user_id: string; minutes: number }[]>`
      SELECT we.user_id, COALESCE(SUM(e.runtime_minutes * we.plays), 0)::int AS minutes
      FROM watched_episodes we
      JOIN episodes e ON e.id = we.episode_id
      WHERE we.user_id IN (${Prisma.join(userIds.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY we.user_id
    `;

    const totals = new Map(userIds.map((id) => [id, 0]));
    for (const row of rows) totals.set(row.user_id, Number(row.minutes));
    return totals;
  }

  /**
   * Finds the show already mirrored by `tmdbId`, or fetches it from TMDB and
   * mirrors it in — this is what makes re-adding an existing show update the
   * same card instead of duplicating it (ADR 0002).
   */
  private async mirrorShow(tmdbId: number) {
    const existing = await this.prisma.show.findUnique({
      where: { tmdbId },
      include: { seasons: { include: { episodes: true } } },
    });
    if (existing) return existing;

    const detail = await this.tmdb.getShowDetail(tmdbId);
    return this.prisma.show.create({
      data: {
        tmdbId: detail.tmdbId,
        title: detail.title,
        firstAirYear: detail.year,
        posterPath: detail.posterPath,
        status: detail.status,
        seasons: {
          create: detail.seasons.map((season) => ({
            tmdbId: season.tmdbId,
            seasonNumber: season.seasonNumber,
            episodes: {
              create: season.episodes.map((episode) => ({
                tmdbId: episode.tmdbId,
                episodeNumber: episode.episodeNumber,
                runtimeMinutes: episode.runtimeMinutes,
              })),
            },
          })),
        },
      },
      include: { seasons: { include: { episodes: true } } },
    });
  }

  private remember(key: string, results: TmdbShowSummary[]): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
  }
}

function normalize(query: string): string {
  return query.trim().toLowerCase();
}
