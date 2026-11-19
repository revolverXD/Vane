import z from 'zod';
import { ClassifierInput } from './types';
import { classifierPrompt } from '@/lib/prompts/search/classifier';
import formatChatHistoryAsString from '@/lib/utils/formatHistory';

const schema = z.object({
  classification: z.object({
    skipSearch: z
      .boolean()
      .describe('Indicates whether to skip the search step.'),
    personalSearch: z
      .boolean()
      .describe('Indicates whether to perform a personal search.'),
    academicSearch: z
      .boolean()
      .describe('Indicates whether to perform an academic search.'),
    discussionSearch: z
      .boolean()
      .describe('Indicates whether to perform a discussion search.'),
    showWeatherWidget: z
      .boolean()
      .describe('Indicates whether to show the weather widget.'),
    showStockWidget: z
      .boolean()
      .describe('Indicates whether to show the stock widget.'),
    showCalculationWidget: z
      .boolean()
      .describe('Indicates whether to show the calculation widget.'),
  }),
  standaloneFollowUp: z
    .string()
    .describe(
      "A self-contained, context-independent reformulation of the user's question.",
    ),
  // Required (not .optional()): llama.cpp structured outputs reject optional
  // fields. "no clarification" is expressed as needed=false with empties.
  clarification: z.object({
    needed: z
      .boolean()
      .describe(
        'True only if the query has multiple plausible readings that would lead to materially different research.',
      ),
    question: z
      .string()
      .describe(
        'One short question asking the user which reading they mean. Empty when needed is false.',
      ),
    options: z
      .array(z.string())
      .describe(
        '2-4 self-contained queries, one per plausible interpretation, that the user can click to proceed. Empty when needed is false.',
      ),
  }).describe(
    'Always present. Unless the query is genuinely ambiguous use needed=false, question="", options=[].',
  ),
});

export const classify = async (input: ClassifierInput) => {
  const output = await input.llm.generateObject<typeof schema>({
    messages: [
      {
        role: 'system',
        content: classifierPrompt,
      },
      {
        role: 'user',
        content: `<conversation_history>\n${formatChatHistoryAsString(input.chatHistory)}\n</conversation_history>\n<user_query>\n${input.query}\n</user_query>`,
      },
    ],
    schema,
  });

  return output;
};
