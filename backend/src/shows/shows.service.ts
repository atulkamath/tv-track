import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TMDB_CLIENT, type TmdbClient, type TmdbShowSummary } from '../integrations/tmdb/tmdb-client';
import type { CreateShowDto } from './create-show.dto';
import { toShowCardDto, toShowDetailDto, type ShowCardDto, type ShowDetailDto, type ShowTree } from './show.dto';
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
      include: showTreeInclude(user.id),
    });
    return toShowCardDto(show);
  }

  /** Backs `GET /shows` — every show the caller has watched at least one episode of. */
  async listShows(user: User): Promise<ShowCardDto[]> {
    const shows = await this.prisma.show.findMany({
      where: { seasons: { some: { episodes: { some: { watchedBy: { some: { userId: user.id } } } } } } },
      include: showTreeInclude(user.id),
      orderBy: { title: 'asc' },
    });
    return shows.map(toShowCardDto);
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
    const watched = await this.prisma.watchedEpisode.findMany({
      where: { userId: user.id },
      select: { episode: { select: { runtimeMinutes: true } } },
    });
    // An episode with no published runtime contributes nothing — not the same
    // claim as "this episode is 0 minutes long," but the same arithmetic
    // either way, so a plain `?? 0` here is correct, not a shortcut.
    return watched.reduce((total, { episode }) => total + (episode.runtimeMinutes ?? 0), 0);
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
