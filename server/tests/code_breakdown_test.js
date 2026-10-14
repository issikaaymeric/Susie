import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../cache/valkey_client.js', () => ({
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock('../providers/deepseek_provider.js', () => ({
  complete: vi.fn(),
}));

import * as cache from '../cache/valkey_client.js';
import * as deepseekProvider from '../providers/deepseek_provider.js';
import { codeBreakdownService } from '../services/code_breakdown_service.js';

describe('codeBreakdownService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached result without calling the provider', async () => {
    const cached = { summary: 'cached summary', issues: [] };
    cache.get.mockResolvedValue(cached);

    const result = await codeBreakdownService({ code: 'const x = 1;', language: 'javascript' });

    expect(result).toEqual(cached);
    expect(deepseekProvider.complete).not.toHaveBeenCalled();
  });

  it('calls the provider, validates, and caches on a cache miss', async () => {
    cache.get.mockResolvedValue(null);
    deepseekProvider.complete.mockResolvedValue({
      summary: 'Found one issue',
      issues: [{ line: 0, message: 'Unused variable', severity: 'warning' }],
    });

    const result = await codeBreakdownService({ code: 'let x = 1;', language: 'javascript' });

    expect(result.issues).toHaveLength(1);
    expect(cache.set).toHaveBeenCalledWith(
      'code-breakdown',
      'javascript:let x = 1;',
      expect.objectContaining({ summary: 'Found one issue' })
    );
  });

  it('throws when the provider response fails schema validation', async () => {
    cache.get.mockResolvedValue(null);
    deepseekProvider.complete.mockResolvedValue({ summary: 'missing issues field' });

    await expect(codeBreakdownService({ code: 'x', language: 'javascript' })).rejects.toThrow();
  });
});
