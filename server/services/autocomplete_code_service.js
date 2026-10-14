import * as cache from '../cache/valkey_client.js';
import * as deepseekProvider from '../providers/deepseek_provider.js';
import { buildAutocompletePrompt } from '../prompts/autocomplete_prompt.js';
import { autocompleteResponseSchema } from '../model/ai_response_model.js';

const CACHE_NAMESPACE = 'autocomplete';
// Autocomplete prefixes are near-unique per keystroke, so cache hit rate is
// low — a short TTL avoids filling Valkey with entries that will never be
// read again, while still covering the common case of repeated triggers on
// an unchanged line (e.g., re-opening the suggestion popup).
const AUTOCOMPLETE_TTL_SECONDS = 60;

/**
 * @param {{ codePrefix: string, language: string }} input
 * @returns {Promise<import('zod').infer<typeof autocompleteResponseSchema>>}
 */
export async function autocompleteCodeService({ codePrefix, language }) {
  const cacheContent = `${language}:${codePrefix}`;

  const cached = await cache.get(CACHE_NAMESPACE, cacheContent);
  if (cached) {
    return cached;
  }

  const prompt = buildAutocompletePrompt(codePrefix, language);
  const rawResult = await deepseekProvider.complete(prompt, { maxTokens: 256 });
  const result = autocompleteResponseSchema.parse(rawResult);

  await cache.set(CACHE_NAMESPACE, cacheContent, result, AUTOCOMPLETE_TTL_SECONDS);
  return result;
}
