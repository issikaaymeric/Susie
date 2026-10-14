/**
 * Shared system-prompt scaffolding. Feature-specific prompt builders compose
 * on top of this rather than duplicating the boilerplate (role, response
 * format contract, safety constraints).
 */

export const RESPONSE_FORMAT_RULES = `
Respond with ONLY a single valid JSON object — no markdown fences, no prose
before or after. If you cannot comply with the schema, return the closest
valid approximation rather than free text.
`.trim();

/**
 * @param {string} role
 * @param {string} task
 * @param {string} schemaDescription
 * @returns {string}
 */
export function buildSystemPrompt(role, task, schemaDescription) {
  return [
    `You are ${role}.`,
    task,
    RESPONSE_FORMAT_RULES,
    `Expected JSON schema: ${schemaDescription}`,
  ].join('\n\n');
}
