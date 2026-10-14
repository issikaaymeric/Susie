import { z } from 'zod';

export const diagnosticIssueSchema = z.object({
  line: z.number().int().nonnegative(),
  message: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
});

export const breakdownResponseSchema = z.object({
  summary: z.string(),
  issues: z.array(diagnosticIssueSchema),
});

export const correctionResponseSchema = z.object({
  correctedCode: z.string(),
  explanation: z.string(),
});

export const autocompleteResponseSchema = z.object({
  suggestion: z.string(),
});

export const chatResponseSchema = z.object({
  reply: z.string(),
});
