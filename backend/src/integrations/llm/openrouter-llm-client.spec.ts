import { ConfigService } from '@nestjs/config';
import { OpenRouterLlmClient } from './openrouter-llm-client';

/**
 * The one class the HTTP suites can't cover: they all swap `LLM_CLIENT` for a
 * fake, so without this the real OpenRouter call — and what it does with the
 * response — would ship untested. `fetch` is mocked because the alternative
 * is a real API key and a network round-trip.
 */
describe('OpenRouterLlmClient', () => {
  const config = (values: Record<string, string>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  const chatResponse = (content: unknown, ok = true) =>
    ({
      ok,
      status: ok ? 200 : 500,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    }) as Response;

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('refuses to build without an API key, rather than failing per request', () => {
    expect(() => new OpenRouterLlmClient(config({}))).toThrow(/OPENROUTER_API_KEY/);
  });

  it('refuses a configured model that is not free, rather than risking a bill', () => {
    expect(
      () => new OpenRouterLlmClient(config({ OPENROUTER_API_KEY: 'key', OPENROUTER_MODEL: 'openai/gpt-4o' })),
    ).toThrow(/not a free OpenRouter model/);
  });

  it('defaults to the pinned Gemma model when OPENROUTER_MODEL is unset', async () => {
    fetchMock.mockResolvedValueOnce(chatResponse({ mentions: [] }));

    const client = new OpenRouterLlmClient(config({ OPENROUTER_API_KEY: 'key' }));
    await client.parseShowMentions('the wire');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('google/gemma-4-26b-a4b-it:free');
  });

  it('sends the system prompt, the raw text, and the settings that keep output deterministic and cheap', async () => {
    fetchMock.mockResolvedValueOnce(chatResponse({ mentions: [] }));

    const client = new OpenRouterLlmClient(config({ OPENROUTER_API_KEY: 'key', OPENROUTER_MODEL: 'openrouter/free' }));
    await client.parseShowMentions('the wire, sopranos season 2');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer key' });

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('openrouter/free');
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'the wire, sopranos season 2' });
    expect(body.temperature).toBe(0);
    expect(body.reasoning).toEqual({ effort: 'none' });
    expect(body.response_format.type).toBe('json_schema');
    expect(body.provider).toEqual({ require_parameters: true });
  });

  it('extracts the mentions from the completion content', async () => {
    const mentions = [{ title: 'The Wire', seasons: null }, { title: 'Sopranos', seasons: [2] }];
    fetchMock.mockResolvedValueOnce(chatResponse({ mentions }));

    const client = new OpenRouterLlmClient(config({ OPENROUTER_API_KEY: 'key' }));
    const result = await client.parseShowMentions('the wire, sopranos season 2');

    expect(result).toEqual(mentions);
  });

  it('surfaces a non-OK response as an error rather than a silently empty result', async () => {
    fetchMock.mockResolvedValueOnce(chatResponse({ mentions: [] }, false));

    const client = new OpenRouterLlmClient(config({ OPENROUTER_API_KEY: 'key' }));

    await expect(client.parseShowMentions('the wire')).rejects.toThrow(/status 500/);
  });

  it('surfaces a response with no message content as an error rather than crashing on JSON.parse(undefined)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [] }) } as Response);

    const client = new OpenRouterLlmClient(config({ OPENROUTER_API_KEY: 'key' }));

    await expect(client.parseShowMentions('the wire')).rejects.toThrow(/no message content/);
  });
});
