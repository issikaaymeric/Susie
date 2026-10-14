import * as deepseekProvider from '../providers/deepseek_provider.js';
import { buildSystemPrompt } from '../prompts/base_prompt.js';
import { chatResponseSchema } from '../model/ai_response_model.js';

const CHAT_SYSTEM_PROMPT = buildSystemPrompt(
  'a helpful coding assistant embedded in a VS Code extension',
  'Answer the developer\'s question about their code clearly and concisely. If the question is ambiguous, ask a clarifying question instead of guessing.',
  `{ "reply": string }`
);

/**
 * Conversation history is client-supplied and stateless server-side —
 * no session storage, no caching (each turn is contextually unique).
 *
 * @param {{ messages: { role: 'user' | 'assistant', content: string }[] }} input
 * @returns {Promise<import('zod').infer<typeof chatResponseSchema>>}
 */
export async function chatbotService({ messages }) {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMessage) {
    throw new Error('NO_USER_MESSAGE');
  }

  const conversationContext = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const rawResult = await deepseekProvider.complete({
    system: CHAT_SYSTEM_PROMPT,
    user: conversationContext,
  });

  return chatResponseSchema.parse(rawResult);
}
