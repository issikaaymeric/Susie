/**
 * Development authentication middleware.
 *
 * Authentication is temporarily disabled so the VS Code extension can
 * communicate with the deployed backend without registering install tokens.
 *
 * WARNING:
 * Do not use this in production. Re-enable authentication before releasing
 * the extension publicly.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
import crypto from 'crypto';

const BEARER_PREFIX = 'Bearer ';

/**
 * @param {import('fastify').FastifyRequest} request
 * @returns {string | null}
 */
export function getInstallTokenHashFromRequest(request) {
  const authorization = request.headers?.authorization || request.headers?.Authorization;
  if (!authorization || typeof authorization !== 'string' || !authorization.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = authorization.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    return null;
  }

  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function authMiddleware(request, reply) {
  const installTokenHash = getInstallTokenHashFromRequest(request);
  if (!installTokenHash) {
    reply.status(401).send({ error: 'UNAUTHORIZED' });
    return;
  }

  request.installTokenHash = installTokenHash;
}