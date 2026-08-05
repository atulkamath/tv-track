import { Module, NotImplementedException } from '@nestjs/common';
import { LLM_CLIENT, type LlmClient } from './llm/llm-client';
import { TMDB_CLIENT } from './tmdb/tmdb-client';
import { TmdbHttpClient } from './tmdb/tmdb-http-client';

/**
 * Outbound clients, bound to their interfaces. The real TMDB implementation
 * backs `GET /shows/search`; the LLM client's real implementation arrives with
 * `POST /shows/parse` — until then this placeholder fails loudly rather than
 * silently returning empty results. Tests override both tokens with fakes.
 */
const unimplementedLlmClient: LlmClient = {
  parseShowMentions() {
    return Promise.reject(new NotImplementedException('LLM client not wired up yet.'));
  },
};

@Module({
  providers: [
    { provide: TMDB_CLIENT, useClass: TmdbHttpClient },
    { provide: LLM_CLIENT, useValue: unimplementedLlmClient },
  ],
  exports: [TMDB_CLIENT, LLM_CLIENT],
})
export class IntegrationsModule {}
