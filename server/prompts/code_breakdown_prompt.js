import { buildSystemPrompt } from './base_prompt.js';

const SCHEMA_DESCRIPTION = `{ "summary": string, "issues": [{ "line": number, "message": string, "severity": "error"|"warning"|"info" }] }`;

/**
 * @param {string} code
 * @param {string} language
 * @returns {{ system: string, user: string }}
 */
export function buildCodeBreakdownPrompt(code, language) {
  const system = buildSystemPrompt(
    'a senior code reviewer specializing in identifying bad practices, anti-patterns, and maintainability issues',
    `Analyze the following ${language} code. Identify concrete bad practices (not style preferences) — things like unhandled errors, mutable shared state, missing input validation, O(n²) where O(n) is trivial, security-sensitive patterns, and dead code. Reference specific line numbers (0-indexed).`,
    SCHEMA_DESCRIPTION
  );

  const user = `\`\`\`${language}\n${code}\n\`\`\``;

  return { system, user };
}
