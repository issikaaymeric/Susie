import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPublish, mockSubscribe, mockUnsubscribe, mockDisconnect, mockOn } = vi.hoisted(() => ({
  mockPublish: vi.fn(),
  mockSubscribe: vi.fn(),
  mockUnsubscribe: vi.fn(),
  mockDisconnect: vi.fn(),
  mockOn: vi.fn(),
}));

vi.mock('../cache/valkey_client.js', () => ({
  redis: {
    publish: mockPublish,
    duplicate: () => ({
      subscribe: mockSubscribe,
      on: mockOn,
      unsubscribe: mockUnsubscribe,
      disconnect: mockDisconnect,
    }),
  },
}));

import { notifyUserService, subscribeToUserNotifications } from '../services/notify_user_service.js';

describe('notifyUserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes to a channel namespaced by the install token hash', async () => {
    await notifyUserService('abc123hash', { type: 'job_complete', message: 'Analysis finished' });

    expect(mockPublish).toHaveBeenCalledWith(
      'mistral-assistant:notify:abc123hash',
      expect.stringContaining('"type":"job_complete"')
    );
  });

  it('subscribes to the correct channel and returns an unsubscribe function', async () => {
    mockSubscribe.mockResolvedValue(undefined);
    const onMessage = vi.fn();

    const unsubscribe = await subscribeToUserNotifications('abc123hash', onMessage);

    expect(mockSubscribe).toHaveBeenCalledWith('mistral-assistant:notify:abc123hash');

    await unsubscribe();
    expect(mockUnsubscribe).toHaveBeenCalledWith('mistral-assistant:notify:abc123hash');
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
