import { redis } from '../cache/valkey_client.js';

const CHANNEL_PREFIX = 'mistral-assistant:notify';

export async function notifyUserService(installTokenHash, event) {
  if (!redis) {
    console.log('[notify-user] skipped: Valkey disabled');
    return;
  }

  const channel = `${CHANNEL_PREFIX}:${installTokenHash}`;

  await redis.publish(
    channel,
    JSON.stringify({
      ...event,
      timestamp: Date.now(),
    })
  );
}


export async function subscribeToUserNotifications(
  installTokenHash,
  onMessage
) {
  if (!redis) {
    return async () => {};
  }

  const subscriber = redis.duplicate();

  const channel = `${CHANNEL_PREFIX}:${installTokenHash}`;

  await subscriber.subscribe(channel);

  subscriber.on('message', (receivedChannel, payload) => {
    if (receivedChannel !== channel) return;

    try {
      onMessage(JSON.parse(payload));
    } catch (err) {
      console.error(
        '[notify-user] failed to parse event payload:',
        err.message
      );
    }
  });

  return async () => {
    await subscriber.unsubscribe(channel);
    subscriber.disconnect();
  };
}