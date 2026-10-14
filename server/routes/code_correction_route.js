import { codeCorrectionService } from '../services/code_correction_service.js';

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
export default async function codeCorrectionRoute(fastify) {
  fastify.post('/api/code-correction', { schema: { body: bodySchema } }, async (request, reply) => {
    try {
      const result = await codeCorrectionService(request.body);
      return reply.send(result);
    } catch (err) {
      request.log.error({ err }, 'code-correction failed');
      return reply.status(502).send({ error: 'AI_PROVIDER_ERROR' });
    }
  });
}
