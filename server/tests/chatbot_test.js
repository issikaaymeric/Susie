import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../providers/deepseek_provider.js', () => ({
  complete: vi.fn(),
}));

import * as deepseekProvider from '../providers/deepseek_provider.js';
import { chatbotService } from '../services/chatbot_service.js';

describe('chatbotService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the assistant reply for a valid conversation', async () => {
    deepseekProvider.complete.mockResolvedValue({ reply: 'This function sorts the array in place.' });

    const result = await chatbotService({
      messages: [{ role: 'user', content: 'What does this function do?' }],
    });

    expect(result.reply).toBe('This function sorts the array in place.');
  });

  it('rejects a conversation with no user message', async () => {
    await expect(
      chatbotService({ messages: [{ role: 'assistant', content: 'Hello!' }] })
    ).rejects.toThrow('NO_USER_MESSAGE');

    expect(deepseekProvider.complete).not.toHaveBeenCalled();
  });

  it('does not cache — provider is called on every request with identical input', async () => {
    deepseekProvider.complete.mockResolvedValue({ reply: 'ok' });
    const messages = [{ role: 'user', content: 'Hi' }];

    await chatbotService({ messages });
    await chatbotService({ messages });

    expect(deepseekProvider.complete).toHaveBeenCalledTimes(2);
  });
});
