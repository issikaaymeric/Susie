import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { pathToFileURL } from 'url';
import { authMiddleware } from './middleware/auth_middleware.js';

import codeBreakdownRoute from './routes/code_breakdown_route.js';
import codeCorrectionRoute from './routes/code_correction_route.js';
import autocompleteRoute from './routes/autocomplete_route.js';
import chatbotRoute from './routes/chatbot_route.js';
import notifyUserRoute from './routes/notify_user_route.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

/**
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      // Redact anything that could carry user source code or secrets —
      // request bodies are never logged at rest.
      redact: ['req.body', 'req.headers.authorization'],
    },
    bodyLimit: 1024 * 1024, // 1MB — generous for a single-file code payload, bounds memory use
  });

  await fastify.register(websocketPlugin);

  // Auth applies to every route registered after this hook. notify_user_route
  // validates the token itself (WebSocket upgrade requests bypass onRequest
  // hooks in some proxy configurations), so it's excluded here defensively
  // and re-checked inside the handler.
  fastify.addHook('onRequest', authMiddleware);

  await fastify.register(codeBreakdownRoute);
  await fastify.register(codeCorrectionRoute);
  await fastify.register(autocompleteRoute);
  await fastify.register(chatbotRoute);
  await fastify.register(notifyUserRoute);

  fastify.get('/', async () => ({
    service: 'Susie API',
    status: 'online',
  }));

  fastify.get('/health', async () => ({ status: 'ok' }));

  return fastify;
}

async function start() {
  const fastify = await buildServer();
  try {
    await fastify.listen({ port: PORT, host: HOST });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

/**
 * Determines whether this module was invoked directly (`node server.js`)
 * rather than imported by another module (e.g. a test file).
 *
 * A plain `===` on the URL strings is fragile on Windows: nodemon/child
 * process spawning can produce drive-letter casing differences between
 * `import.meta.url` and `pathToFileURL(process.argv[1]).href` even when
 * they point at the identical file. That mismatch causes `start()` to
 * silently never fire — no error, no log, the process just sits idle.
 * Comparing case-insensitively (safe on Windows/macOS, harmless on Linux
 * where paths are case-sensitive but casing mismatches don't occur from
 * this cause) avoids that failure mode.
 *
 * @returns {boolean}
 */
function isMainModule() {
  if (!process.argv[1]) return false;
  const invokedUrl = pathToFileURL(process.argv[1]).href;
  return import.meta.url.toLowerCase() === invokedUrl.toLowerCase();
}

if (isMainModule()) {
  start();
} else {
  // If this ever prints when you expect the server to start, the entrypoint
  // check above still isn't matching — bypass it and investigate the two
  // URLs it's comparing.
  console.warn('[server] module loaded but not recognized as main entrypoint; server will not start.');
  console.warn('[server] import.meta.url:', import.meta.url);
  console.warn('[server] argv[1] as URL:', process.argv[1] ? pathToFileURL(process.argv[1]).href : '(argv[1] is undefined)');
}