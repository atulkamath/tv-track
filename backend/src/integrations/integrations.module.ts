import { Module, NotImplementedException } from '@nestjs/common';
import { LLM_CLIENT, type LlmClient } from './llm/llm-client';
import { TMDB_CLIENT, type TmdbClient } from './tmdb/tmdb-client';

/**
 * Outbound clients, bound to their interfaces. The real implementations arrive
 * with the tickets that need them (`GET /shows/search`, `POST /shows/parse`);
 * until then these placeholders fail loudly rather than silently returning
 * empty results, and tests override both tokens with stubs.
 */
const unimplementedTmdbClient: TmdbClient = {
  searchShows() {
    return Promise.reject(new NotImplementedException('TMDB client not wired up yet.'));
  },
};

const unimplementedLlmClient: LlmClient = {
  parseShowMentions() {
    return Promise.reject(new NotImplementedException('LLM client not wired up yet.'));
  },
};

@Module({
  providers: [
    { provide: TMDB_CLIENT, useValue: unimplementedTmdbClient },
    { provide: LLM_CLIENT, useValue: unimplementedLlmClient },
  ],
  exports: [TMDB_CLIENT, LLM_CLIENT],
})
export class IntegrationsModule {}
