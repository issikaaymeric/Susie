import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

describe('DeepSeek provider', () => {
  let complete;
  let fetchMock;

  beforeAll(async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-api-key');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    ({ complete } = await import('../providers/deepseek_provider.js'));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('sends JSON-mode chat completions to DeepSeek and parses the response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"reply":"Hello"}' } }] }),
    });

    await expect(complete({ system: 'Be helpful', user: 'Hi' })).resolves.toEqual({ reply: 'Hello' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'Be helpful' },
            { role: 'user', content: 'Hi' },
          ],
          max_tokens: 1024,
          response_format: { type: 'json_object' },
        }),
      })
    );
  });

  it('surfaces non-rate-limit HTTP errors', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
    });

    await expect(complete({ system: 'Be helpful', user: 'Hi' })).rejects.toThrow('DEEPSEEK_HTTP_ERROR: 401');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects responses without JSON content', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not JSON' } }] }),
    });

    await expect(complete({ system: 'Be helpful', user: 'Hi' })).rejects.toThrow('DEEPSEEK_INVALID_JSON');
  });
});
