import type { TmdbClient, TmdbShowSummary } from '../integrations/tmdb/tmdb-client';
import { ShowsService } from './shows.service';

function summary(tmdbId: number): TmdbShowSummary {
  return { tmdbId, title: 'The Office', year: 2005, posterPath: '/us.jpg', episodeCount: 201 };
}

describe('ShowsService', () => {
  let tmdb: { searchShows: jest.Mock };
  let service: ShowsService;

  beforeEach(() => {
    tmdb = { searchShows: jest.fn().mockResolvedValue([summary(2316)]) };
    // None of these tests touch the database — only `search()`, which never
    // reaches `prisma` or `llm` — so untyped stand-ins are enough here.
    service = new ShowsService(tmdb as unknown as TmdbClient, undefined as never, undefined as never);
    jest.spyOn(Date, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes the query straight through to TMDB', async () => {
    const results = await service.search('the office');

    expect(tmdb.searchShows).toHaveBeenCalledWith('the office');
    expect(results).toEqual([summary(2316)]);
  });

  it('serves an identical query from cache instead of calling TMDB again', async () => {
    await service.search('the office');
    await service.search('the office');

    expect(tmdb.searchShows).toHaveBeenCalledTimes(1);
  });

  it('treats surrounding whitespace and case as the same query', async () => {
    await service.search('The Office');
    await service.search('  the office  ');

    expect(tmdb.searchShows).toHaveBeenCalledTimes(1);
  });

  it('calls TMDB again once the cache entry expires', async () => {
    await service.search('the office');

    jest.spyOn(Date, 'now').mockReturnValue(60_000);
    await service.search('the office');

    expect(tmdb.searchShows).toHaveBeenCalledTimes(2);
  });

  it('calls TMDB separately for distinct queries', async () => {
    await service.search('the office');
    await service.search('the wire');

    expect(tmdb.searchShows).toHaveBeenCalledTimes(2);
    expect(tmdb.searchShows).toHaveBeenNthCalledWith(1, 'the office');
    expect(tmdb.searchShows).toHaveBeenNthCalledWith(2, 'the wire');
  });
});
