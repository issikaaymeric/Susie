import { buildSystemPrompt } from './base_prompt.js';

const SCHEMA_DESCRIPTION = `{ "suggestion": string }`;

/**
 * @param {string} codePrefix
 * @param {string} language
 * @returns {{ system: string, user: string }}
 */
export function buildAutocompletePrompt(codePrefix, language) {
  const system = buildSystemPrompt(
    'an expert autocomplete engine',
    `Given the following ${language} code prefix, produce ONLY the continuation text that should follow it — no repetition of the prefix, no explanation. Keep the suggestion minimal and syntactically valid in context.`,
    SCHEMA_DESCRIPTION
  );

  const user = `\`\`\`${language}\n${codePrefix}\n\`\`\``;

  return { system, user };
}
