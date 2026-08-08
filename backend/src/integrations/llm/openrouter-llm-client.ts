import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmClient, ShowMention } from './llm-client';
import { PARSE_RESPONSE_SCHEMA, PARSE_SYSTEM_PROMPT } from './parse-prompt';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * The pinned parse model, used when `OPENROUTER_MODEL` is unset. 26B total /
 * ~3.8B active per token (MoE), 262K context, native structured output
 * support — one of the few free OpenRouter models that honors
 * `response_format` at all. Deliberately a fixed model rather than
 * `openrouter/free`: `PARSE_SYSTEM_PROMPT`'s rules are patches for this
 * model's specific mistakes (dropped titles, misattached season lists), so a
 * router swapping models per call would mean parse quality that varies by
 * request and a prompt that can't be evaluated against a stable baseline.
 */
const DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it:free';

/**
 * Refuses to call anything that could bill. OpenRouter charges by model, and
 * a paid model is one typo away from a free one (`gpt-oss-20b` vs
 * `gpt-oss-20b:free`), so the free-ness is enforced here rather than assumed
 * — this also covers `OPENROUTER_MODEL` being set by hand in `.env`, which no
 * DTO validation ever sees.
 */
function assertFreeModel(model: string): string {
  if (model === 'openrouter/free' || model.endsWith(':free')) return model;
  throw new Error(`Refusing to call "${model}": not a free OpenRouter model.`);
}

interface OpenRouterChoice {
  message?: { content?: string | null };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
}

interface ParsedMentionsBody {
  mentions: ShowMention[];
}

/**
 * The real `LlmClient` behind `POST /shows/parse` (#11). Only constructed
 * when `OPENROUTER_API_KEY` is set (see `IntegrationsModule`) — this ticket's
 * HTTP tests never reach it, they override `LLM_CLIENT` with a fake, so this
 * class is exercised by its own unit spec with `fetch` mocked, the same split
 * `TmdbHttpClient` uses for TMDB.
 */
@Injectable()
export class OpenRouterLlmClient implements LlmClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set — the LLM client cannot be built.');
    }
    this.apiKey = apiKey;
    this.model = assertFreeModel(config.get<string>('OPENROUTER_MODEL') ?? DEFAULT_MODEL);
  }

  async parseShowMentions(text: string): Promise<ShowMention[]> {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: PARSE_SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        // The same sentence must parse the same way every time.
        temperature: 0,
        // The whole completion budget. Headroom for a reasoning model that
        // ignores `reasoning.effort` and thinks anyway — extraction itself
        // needs well under 200 tokens of JSON.
        max_tokens: 800,
        // Extraction is not a thinking task — the rules are stated literally
        // in the system prompt — so reasoning here is pure cost: its tokens
        // count as output tokens, competing with the answer for `max_tokens`.
        reasoning: { effort: 'none' },
        response_format: { type: 'json_schema', json_schema: PARSE_RESPONSE_SCHEMA },
        // Pinning the model doesn't pin a provider — several companies host
        // it, and without this a request can land on one that ignores
        // `response_format` and answers in prose. This restricts routing to
        // providers that honor every parameter sent.
        provider: { require_parameters: true },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter request failed with status ${response.status}.`);
    }

    const body = (await response.json()) as OpenRouterResponse;
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('OpenRouter response had no message content.');
    }

    const parsed = JSON.parse(content) as ParsedMentionsBody;
    return parsed.mentions;
  }
}
