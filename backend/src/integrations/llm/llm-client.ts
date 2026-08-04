/**
 * The seam to whichever LLM provider ends up parsing NLP Entry text. The
 * provider is still open (leaning OpenRouter, see `docs/mvp-scope.md`), which
 * is exactly why callers only ever see this interface.
 */
export interface ShowMention {
  /** The show title as the user wrote it, before TMDB resolution. */
  title: string;
  /** Season numbers the user claimed, or null when they named none. */
  seasons: number[] | null;
}

export interface LlmClient {
  /** Backs `POST /shows/parse` — free text in, structured mentions out. */
  parseShowMentions(text: string): Promise<ShowMention[]>;
}

export const LLM_CLIENT = Symbol('LLM_CLIENT');
