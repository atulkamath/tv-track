import { ConfigService } from '@nestjs/config';
import { TmdbHttpClient } from './tmdb-http-client';

/**
 * The one class the HTTP suites can't cover: they all swap `TMDB_CLIENT` for a
 * fake, so without this the real TMDB call — and what it does with the
 * response — would ship untested. `fetch` is mocked because the alternative is
 * a real API key and a network round-trip.
 */
describe('TmdbHttpClient', () => {
  const config = (values: Record<string, string>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  const jsonResponse = (body: unknown, ok = true) =>
    ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('refuses to start without an access token, rather than failing per request', () => {
    expect(() => new TmdbHttpClient(config({}))).toThrow(/TMDB_ACCESS_TOKEN/);
  });

  it('maps search results and fetches each one’s episode count', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { id: 2316, name: 'The Office', first_air_date: '2005-03-24', poster_path: '/us.jpg' },
            { id: 17552, name: 'The Office', first_air_date: '2001-07-09', poster_path: '/uk.jpg' },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ number_of_episodes: 201 }))
      .mockResolvedValueOnce(jsonResponse({ number_of_episodes: 14 }));

    const client = new TmdbHttpClient(config({ TMDB_ACCESS_TOKEN: 'test-token' }));
    const results = await client.searchShows('the office');

    expect(results).toEqual([
      { tmdbId: 2316, title: 'The Office', year: 2005, posterPath: '/us.jpg', episodeCount: 201 },
      { tmdbId: 17552, title: 'The Office', year: 2001, posterPath: '/uk.jpg', episodeCount: 14 },
    ]);

    const [searchUrl, searchInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(searchUrl.pathname).toBe('/3/search/tv');
    expect(searchUrl.searchParams.get('query')).toBe('the office');
    expect(searchUrl.searchParams.get('api_key')).toBeNull();
    expect(searchInit.headers).toEqual({ Authorization: 'Bearer test-token' });
  });

  it('keeps only the five most popular hits, and never pays for the episode counts of the rest', async () => {
    // Ten hits in deliberately shuffled popularity order — a real "The Office"
    // search returns twenty, each costing a /tv/{id} call it must not make.
    const results = [9, 3, 10, 1, 7, 5, 8, 2, 6, 4].map((popularity, index) => ({
      id: index + 1,
      name: `Show ${index + 1}`,
      first_air_date: '2005-01-01',
      poster_path: null,
      popularity,
    }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ results }));
    for (let call = 0; call < 5; call += 1) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ number_of_episodes: 10 }));
    }

    const client = new TmdbHttpClient(config({ TMDB_ACCESS_TOKEN: 'test-token' }));
    const summaries = await client.searchShows('the office');

    // Popularity 10, 9, 8, 7, 6 — ids 3, 1, 7, 5, 9.
    expect(summaries.map((summary) => summary.tmdbId)).toEqual([3, 1, 7, 5, 9]);
    // One search plus five detail calls, not one plus ten.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('treats a missing air date and episode count as null/zero rather than throwing', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: 1, name: 'Untitled', first_air_date: null, poster_path: null }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ number_of_episodes: null }));

    const client = new TmdbHttpClient(config({ TMDB_ACCESS_TOKEN: 'test-token' }));
    const results = await client.searchShows('untitled');

    expect(results).toEqual([
      { tmdbId: 1, title: 'Untitled', year: null, posterPath: null, episodeCount: 0 },
    ]);
  });

  it('surfaces a non-OK response as an error rather than a silently empty result', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    const client = new TmdbHttpClient(config({ TMDB_ACCESS_TOKEN: 'test-token' }));

    await expect(client.searchShows('the office')).rejects.toThrow(/status 500/);
  });
});
