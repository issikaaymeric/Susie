import { codeBreakdownService } from '../services/code_breakdown_service.js';

const bodySchema = {
  type: 'object',
  required: ['code', 'language'],
  additionalProperties: false,
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 50000 },
    language: { type: 'string', minLength: 1, maxLength: 50 },
  },
};

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function codeBreakdownRoute(fastify) {
  fastify.post('/api/code-breakdown', { schema: { body: bodySchema } }, async (request, reply) => {
    try {
      const result = await codeBreakdownService(request.body);
      return reply.send(result);
    } catch (err) {
      request.log.error({ err }, 'code-breakdown failed');
      return reply.status(502).send({ error: 'AI_PROVIDER_ERROR' });
    }
  });
}
