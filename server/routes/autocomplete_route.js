import { autocompleteCodeService } from '../services/autocomplete_code_service.js';

const bodySchema = {
  type: 'object',
  required: ['codePrefix', 'language'],
  additionalProperties: false,
  properties: {
    codePrefix: { type: 'string', minLength: 1, maxLength: 50000 },
    language: { type: 'string', minLength: 1, maxLength: 50 },
  },
};

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function autocompleteRoute(fastify) {
  fastify.post('/api/autocomplete', { schema: { body: bodySchema } }, async (request, reply) => {
    try {
      const result = await autocompleteCodeService(request.body);
      return reply.send(result);
    } catch (err) {
      request.log.error({ err }, 'autocomplete failed');
      return reply.status(502).send({ error: 'AI_PROVIDER_ERROR' });
    }
  });
}
