import crypto from 'crypto';
import { Redis } from 'ioredis';

const DEFAULT_TTL_SECONDS = 60 * 30; // 30 minutes

// Create a Redis client only if a Valkey/Redis URL is provided.
export const redis = process.env.VALKEY_URL
  ? new Redis(process.env.VALKEY_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    })
  : null;

if (redis) {
  redis.on('error', (err) => {
    console.error('[valkey] connection error:', err.message);
  });

  console.log('[valkey] Cache enabled');
} else {
  console.log('[valkey] No VALKEY_URL provided. Running without cache.');
}

/**
 * Builds a namespaced, hashed cache key.
 *
 * @param {string} namespace
 * @param {string} content
 * @returns {string}
 */
export function buildCacheKey(namespace, content) {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `mistral-assistant:${namespace}:${hash}`;
}

/**
 * Retrieves a cached value.
 *
 * @param {string} namespace
 * @param {string} content
 * @returns {Promise<object|null>}
 */
export async function get(namespace, content) {
  // Cache disabled
  if (!redis) return null;

  try {
    const key = buildCacheKey(namespace, content);
    const raw = await redis.get(key);

    if (!raw) return null;

    return JSON.parse(raw);
  } catch (err) {
    console.error('[valkey] get failed:', err.message);
    return null;
  }
}

/**
 * Stores a value in the cache.
 *
 * @param {string} namespace
 * @param {string} content
 * @param {object} value
 * @param {number} ttlSeconds
 */
export async function set(
  namespace,
  content,
  value,
  ttlSeconds = DEFAULT_TTL_SECONDS
) {
  // Cache disabled
  if (!redis) return;

  try {
    const key = buildCacheKey(namespace, content);

    await redis.set(
      key,
      JSON.stringify(value),
      'EX',
      ttlSeconds
    );
  } catch (err) {
    console.error('[valkey] set failed:', err.message);
  }
}