import { Module, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_CLIENT, type LlmClient } from './llm/llm-client';
import { OpenRouterLlmClient } from './llm/openrouter-llm-client';
import { TMDB_CLIENT } from './tmdb/tmdb-client';
import { TmdbHttpClient } from './tmdb/tmdb-http-client';

/**
 * `OPENROUTER_API_KEY` is optional (see `.env.example`) — without it the API
 * still boots, and only `POST /shows/parse` fails, loudly, rather than
 * silently returning empty results. Tests override `LLM_CLIENT` with a fake
 * either way, so this placeholder is only ever seen by a real checkout that
 * hasn't configured OpenRouter yet.
 */
const unimplementedLlmClient: LlmClient = {
  parseShowMentions() {
    return Promise.reject(new NotImplementedException('OPENROUTER_API_KEY is not set — LLM parsing is unavailable.'));
  },
};

@Module({
  providers: [
    { provide: TMDB_CLIENT, useClass: TmdbHttpClient },
    {
      provide: LLM_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmClient =>
        config.get<string>('OPENROUTER_API_KEY') ? new OpenRouterLlmClient(config) : unimplementedLlmClient,
    },
  ],
  exports: [TMDB_CLIENT, LLM_CLIENT],
})
export class IntegrationsModule {}
