import { subscribeToUserNotifications } from '../services/notify_user_service.js';

/**
 * WebSocket route used by the VS Code extension.
 * Authentication is temporarily disabled for development.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function notifyUserRoute(fastify) {
  fastify.get('/api/notify-user', { websocket: true }, async (connection, request) => {
    // Development-only identifier since auth is disabled.
    const clientId = 'development-client';

    const unsubscribe = await subscribeToUserNotifications(
      clientId,
      (event) => {
        try {
          connection.socket.send(JSON.stringify(event));
        } catch (err) {
          request.log.error({ err }, 'failed to send websocket message');
        }
      }
    );

    connection.socket.on('close', () => {
      unsubscribe().catch((err) => {
        request.log.error({ err }, 'failed to unsubscribe cleanly');
      });
    });
  });
}