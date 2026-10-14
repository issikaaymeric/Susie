import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pkg from '../src/client/apiClient.js';

const { ApiClient } = pkg;

describe('ApiClient', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches the install token as a Bearer header', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ suggestion: 'ok' }) });

    const client = new ApiClient({ baseUrl: 'https://api.example.com', installToken: 'secret-token' });
    await client.autocomplete('const x =', 'javascript');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer secret-token');
  });

  it('throws with status and body text on a non-ok response', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 502, text: async () => 'upstream error' });

    const client = new ApiClient({ baseUrl: 'https://api.example.com', installToken: 't' });

    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('Backend error 502');
  });

  it('aborts the request when an external signal fires', async () => {
    const externalController = new AbortController();
    global.fetch.mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

    const client = new ApiClient({ baseUrl: 'https://api.example.com', installToken: 't' });
    const pending = client.codeBreakdown('const x = 1;', 'javascript', externalController.signal);

    externalController.abort();

    await expect(pending).rejects.toThrow();
  });

  it('setInstallToken updates the token used on subsequent requests', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ reply: 'ok' }) });

    const client = new ApiClient({ baseUrl: 'https://api.example.com', installToken: 'old-token' });
    client.setInstallToken('new-token');
    await client.chat([{ role: 'user', content: 'hi' }]);

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer new-token');
  });
});
