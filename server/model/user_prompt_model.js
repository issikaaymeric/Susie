import { z } from 'zod';

export const MAX_CODE_LENGTH = 50000;

export const codePromptSchema = z.object({
  code: z.string().min(1).max(MAX_CODE_LENGTH),
  language: z.string().min(1).max(50),
});

export const autocompletePromptSchema = z.object({
  codePrefix: z.string().min(1).max(MAX_CODE_LENGTH),
  language: z.string().min(1).max(50),
});

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(MAX_CODE_LENGTH),
});

export const chatPromptSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
});
