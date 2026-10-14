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
import { codeCorrectionService } from '../services/code_correction_service.js';

describe('codeCorrectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns corrected code and explanation on cache miss', async () => {
    cache.get.mockResolvedValue(null);
    deepseekProvider.complete.mockResolvedValue({
      correctedCode: 'const x = 1;',
      explanation: 'Changed let to const since x is never reassigned.',
    });

    const result = await codeCorrectionService({ code: 'let x = 1;', language: 'javascript' });

    expect(result.correctedCode).toBe('const x = 1;');
    expect(cache.set).toHaveBeenCalledOnce();
  });

  it('propagates provider errors without caching', async () => {
    cache.get.mockResolvedValue(null);
    deepseekProvider.complete.mockRejectedValue(new Error('DEEPSEEK_EMPTY_RESPONSE'));

    await expect(codeCorrectionService({ code: 'x', language: 'javascript' })).rejects.toThrow('DEEPSEEK_EMPTY_RESPONSE');
    expect(cache.set).not.toHaveBeenCalled();
  });
});
