import * as cache from '../cache/valkey_client.js';
import * as deepseekProvider from '../providers/deepseek_provider.js';
import { buildCodeCorrectionPrompt } from '../prompts/code_correction_prompt.js';
import { correctionResponseSchema } from '../model/ai_response_model.js';

const CACHE_NAMESPACE = 'code-correction';

/**
 * @param {{ code: string, language: string }} input
 * @returns {Promise<import('zod').infer<typeof correctionResponseSchema>>}
 */
export async function codeCorrectionService({ code, language }) {
  const cacheContent = `${language}:${code}`;

  const cached = await cache.get(CACHE_NAMESPACE, cacheContent);
  if (cached) {
    return cached;
  }

  const prompt = buildCodeCorrectionPrompt(code, language);
  const rawResult = await deepseekProvider.complete(prompt);
  const result = correctionResponseSchema.parse(rawResult);

  await cache.set(CACHE_NAMESPACE, cacheContent, result);
  return result;
}
