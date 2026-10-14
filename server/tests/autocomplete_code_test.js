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
import { autocompleteCodeService } from '../services/autocomplete_code_service.js';

describe('autocompleteCodeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caches with a 60-second TTL', async () => {
    cache.get.mockResolvedValue(null);
    deepseekProvider.complete.mockResolvedValue({ suggestion: 'return x + y;' });

    await autocompleteCodeService({ codePrefix: 'function add(x, y) {', language: 'javascript' });

    expect(cache.set).toHaveBeenCalledWith(
      'autocomplete',
      'javascript:function add(x, y) {',
      { suggestion: 'return x + y;' },
      60
    );
  });

  it('requests a smaller max token budget than other endpoints', async () => {
    cache.get.mockResolvedValue(null);
    deepseekProvider.complete.mockResolvedValue({ suggestion: 'x' });

    await autocompleteCodeService({ codePrefix: 'const x =', language: 'javascript' });

    expect(deepseekProvider.complete).toHaveBeenCalledWith(expect.anything(), { maxTokens: 256 });
  });
});
