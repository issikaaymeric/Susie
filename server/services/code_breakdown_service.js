import * as cache from '../cache/valkey_client.js';
import * as deepseekProvider from '../providers/deepseek_provider.js';
import { buildCodeBreakdownPrompt } from '../prompts/code_breakdown_prompt.js';
import { breakdownResponseSchema } from '../model/ai_response_model.js';

const CACHE_NAMESPACE = 'code-breakdown';

/**
 * @param {{ code: string, language: string }} input
 * @returns {Promise<import('zod').infer<typeof breakdownResponseSchema>>}
 */
export async function codeBreakdownService({ code, language }) {
  const cacheContent = `${language}:${code}`;

  const cached = await cache.get(CACHE_NAMESPACE, cacheContent);
  if (cached) {
    return cached;
  }

  const prompt = buildCodeBreakdownPrompt(code, language);
  const rawResult = await deepseekProvider.complete(prompt);

  // Validate the model's output against our schema — DeepSeek's JSON mode
  // guarantees valid JSON, not that it matches OUR shape. This is the
  // boundary where a malformed model response gets caught before it
  // reaches the client.
  const result = breakdownResponseSchema.parse(rawResult);

  await cache.set(CACHE_NAMESPACE, cacheContent, result);
  return result;
}
