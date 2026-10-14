import { chatbotService } from '../services/chatbot_service.js';

const bodySchema = {
  type: 'object',
  required: ['messages'],
  additionalProperties: false,
  properties: {
    messages: {
      type: 'array',
      minItems: 1,
      maxItems: 50,
      items: {
        type: 'object',
        required: ['role', 'content'],
        properties: {
          role: { type: 'string', enum: ['user', 'assistant'] },
          content: { type: 'string', minLength: 1, maxLength: 50000 },
        },
      },
    },
  },
};

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function chatbotRoute(fastify) {
  fastify.post('/api/chatbot', { schema: { body: bodySchema } }, async (request, reply) => {
    try {
      const result = await chatbotService(request.body);
      return reply.send(result);
    } catch (err) {
      request.log.error({ err }, 'chatbot failed');
      return reply.status(502).send({ error: 'AI_PROVIDER_ERROR' });
    }
  });
}
