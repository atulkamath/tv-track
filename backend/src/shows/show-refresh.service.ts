import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TMDB_CLIENT, type TmdbClient, type TmdbSeason } from '../integrations/tmdb/tmdb-client';

const ENDED_STATUS = 'Ended';

type MirroredSeason = { id: string; tmdbId: number; episodes: { tmdbId: number }[] };

/**
 * The daily Show Refresh job (CONTEXT.md, docs/mvp-scope.md). One pass over
 * every distinct, non-`Ended` Show in the shared mirror: diffs TMDB against
 * what we already have and inserts any new Seasons/Episodes as unwatched.
 * Never touches `watched_episodes` — this job only ever grows the mirror, it
 * never expresses an opinion about anyone's personal watch state.
 */
@Injectable()
export class ShowRefreshService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TMDB_CLIENT) private readonly tmdb: TmdbClient,
  ) {}

  @Cron('0 3 * * *')
  async run(): Promise<void> {
    const shows = await this.prisma.show.findMany({
      where: { status: { not: ENDED_STATUS } },
      include: { seasons: { include: { episodes: true } } },
    });

    for (const show of shows) {
      const detail = await this.tmdb.getShowDetail(show.tmdbId);

      // A show TMDB now reports Ended is skipped entirely on this pass (per
      // the ticket) — only the local status flips, so every future pass can
      // filter it out via the cheap local check above without calling TMDB
      // again at all. Judgment call: the ticket's wording is ambiguous
      // between filtering on local status before ever calling TMDB, or
      // calling TMDB and then deciding; this filters after the call, so the
      // status flip itself always lands on the same pass TMDB actually
      // reports Ended rather than one pass late.
      if (detail.status === ENDED_STATUS) {
        await this.prisma.show.update({ where: { id: show.id }, data: { status: ENDED_STATUS } });
        continue;
      }

      await this.insertNewSeasonsAndEpisodes(show.id, show.seasons, detail.seasons);
    }
  }

  private async insertNewSeasonsAndEpisodes(
    showId: string,
    existingSeasons: MirroredSeason[],
    tmdbSeasons: TmdbSeason[],
  ): Promise<void> {
    const existingSeasonByTmdbId = new Map(existingSeasons.map((season) => [season.tmdbId, season]));

    for (const tmdbSeason of tmdbSeasons) {
      const existingSeason = existingSeasonByTmdbId.get(tmdbSeason.tmdbId);

      if (!existingSeason) {
        await this.prisma.season.create({
          data: {
            showId,
            tmdbId: tmdbSeason.tmdbId,
            seasonNumber: tmdbSeason.seasonNumber,
            episodes: {
              create: tmdbSeason.episodes.map((episode) => ({
                tmdbId: episode.tmdbId,
                episodeNumber: episode.episodeNumber,
                runtimeMinutes: episode.runtimeMinutes,
              })),
            },
          },
        });
        continue;
      }

      const existingEpisodeTmdbIds = new Set(existingSeason.episodes.map((episode) => episode.tmdbId));
      const newEpisodes = tmdbSeason.episodes.filter((episode) => !existingEpisodeTmdbIds.has(episode.tmdbId));
      if (newEpisodes.length === 0) continue;

      await this.prisma.episode.createMany({
        data: newEpisodes.map((episode) => ({
          seasonId: existingSeason.id,
          tmdbId: episode.tmdbId,
          episodeNumber: episode.episodeNumber,
          runtimeMinutes: episode.runtimeMinutes,
        })),
      });
    }
  }
}
