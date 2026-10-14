import { buildSystemPrompt } from './base_prompt.js';

const SCHEMA_DESCRIPTION = `{ "correctedCode": string, "explanation": string }`;

/**
 * @param {string} code
 * @param {string} language
 * @returns {{ system: string, user: string }}
 */
export function buildCodeCorrectionPrompt(code, language) {
  const system = buildSystemPrompt(
    'a senior software engineer fixing bugs and bad practices with minimal, surgical changes',
    `Correct the following ${language} code. Preserve the original intent and structure — only change what is necessary to fix bugs, security issues, and bad practices. Do not reformat unrelated lines. Explain each change briefly.`,
    SCHEMA_DESCRIPTION
  );

  const user = `\`\`\`${language}\n${code}\n\`\`\``;

  return { system, user };
}
