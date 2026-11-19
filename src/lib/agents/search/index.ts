import { ResearcherOutput, SearchAgentInput } from './types';
import SessionManager from '@/lib/session';
import { classify } from './classifier';
import Researcher from './researcher';
import { getWriterPrompt } from '@/lib/prompts/search/writer';
import { WidgetExecutor } from './widgets';
import db from '@/lib/db';
import { messages } from '@/lib/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { SuggestionBlock, TextBlock } from '@/lib/types';
import { getTokenCount } from '@/lib/utils/splitText';
import { recall } from '@/lib/memory/client';
import ModelRegistry from '@/lib/models/registry';
import { getCouncilModels } from '@/lib/config/serverRegistry';
import { getJudgePrompt } from '@/lib/prompts/search/council';
import { decompositionPrompt } from '@/lib/prompts/search/deep';
import formatChatHistoryAsString from '@/lib/utils/formatHistory';
import z from 'zod';
import { Chunk } from '@/lib/types';

class SearchAgent {
  async searchAsync(session: SessionManager, input: SearchAgentInput) {
    const exists = await db.query.messages.findFirst({
      where: and(
        eq(messages.chatId, input.chatId),
        eq(messages.messageId, input.messageId),
      ),
    });

    if (!exists) {
      await db.insert(messages).values({
        chatId: input.chatId,
        messageId: input.messageId,
        backendId: session.id,
        query: input.followUp,
        createdAt: new Date().toISOString(),
        status: 'answering',
        responseBlocks: [],
      });
    } else {
      await db
        .delete(messages)
        .where(
          and(eq(messages.chatId, input.chatId), gt(messages.id, exists.id)),
        )
        .execute();
      await db
        .update(messages)
        .set({
          status: 'answering',
          backendId: session.id,
          responseBlocks: [],
        })
        .where(
          and(
            eq(messages.chatId, input.chatId),
            eq(messages.messageId, input.messageId),
          ),
        )
        .execute();
    }

    const classification = await classify({
      chatHistory: input.chatHistory,
      enabledSources: input.config.sources,
      query: input.followUp,
      llm: input.config.llm,
    });

    // Interactive clarification: ask one question instead of researching a
    // guess. The options ride the existing 'suggestion' block plumbing —
    // clicking one sends it as the next user message, and the classifier's
    // never-ask-twice rule forces it to proceed on the follow-up turn.
    const clar = classification.clarification;
    if (
      !classification.classification.skipSearch &&
      clar?.needed &&
      clar.question
    ) {
      const questionBlock: TextBlock = {
        id: crypto.randomUUID(),
        type: 'text',
        data: clar.question,
      };
      const optionsBlock: SuggestionBlock = {
        id: crypto.randomUUID(),
        type: 'suggestion',
        data: (clar.options ?? []).slice(0, 4),
      };

      session.emitBlock(questionBlock);
      session.emitBlock(optionsBlock);

      session.emit('end', {});

      await db
        .update(messages)
        .set({
          status: 'completed',
          responseBlocks: session.getAllBlocks(),
        })
        .where(
          and(
            eq(messages.chatId, input.chatId),
            eq(messages.messageId, input.messageId),
          ),
        )
        .execute();

      return;
    }

    if (input.config.mode === 'deep' && !classification.classification.skipSearch) {
      await this.runDeepResearch(session, input, classification);
      return;
    }

    const memoryPromise = recall(input.followUp);

    const widgetPromise = WidgetExecutor.executeAll({
      classification,
      chatHistory: input.chatHistory,
      followUp: input.followUp,
      llm: input.config.llm,
    }).then((widgetOutputs) => {
      widgetOutputs.forEach((o) => {
        session.emitBlock({
          id: crypto.randomUUID(),
          type: 'widget',
          data: {
            widgetType: o.type,
            params: o.data,
          },
        });
      });
      return widgetOutputs;
    });

    let searchPromise: Promise<ResearcherOutput> | null = null;

    if (!classification.classification.skipSearch) {
      const researcher = new Researcher();
      searchPromise = researcher.research(session, {
        chatHistory: input.chatHistory,
        followUp: input.followUp,
        classification: classification,
        config: input.config,
      });
    }

    const [widgetOutputs, searchResults] = await Promise.all([
      widgetPromise,
      searchPromise,
    ]);

    session.emit('data', {
      type: 'researchComplete',
    });

    let finalContext =
      '<Query to be answered without searching; Search not made>';

    if (searchResults) {
      finalContext = searchResults?.searchFindings
        .map(
          (f, index) =>
            `<result index=${index + 1} title=${f.metadata.title} url=${f.metadata.url}>${f.content}</result>`,
        )
        .join('\n');
    }

    const widgetContext = widgetOutputs
      .map((o) => {
        return `<result>${o.llmContext}</result>`;
      })
      .join('\n-------------\n');

    const memories = await memoryPromise;
    const memoryContext =
      memories.length > 0
        ? `\n<shared_memory note="Facts the user or their other assistants saved earlier; use them when relevant, do NOT cite them as a source">\n${memories
            .map((m) => `<memory title="${m.title}">${m.summary}</memory>`)
            .join('\n')}\n</shared_memory>`
        : '';

    const finalContextWithWidgets = `<search_results note="These are the search results and assistant can cite these">\n${finalContext}\n</search_results>\n<widgets_result noteForAssistant="Its output is already showed to the user, assistant can use this information to answer the query but do not CITE this as a souce">\n${widgetContext}\n</widgets_result>${memoryContext}`;

    const writerPrompt = getWriterPrompt(
      finalContextWithWidgets,
      input.config.systemInstructions,
      input.config.mode,
    );

    const answerStream = input.config.llm.streamText({
      messages: [
        {
          role: 'system',
          content: writerPrompt,
        },
        ...input.chatHistory,
        {
          role: 'user',
          content: input.followUp,
        },
      ],
    });

    let responseBlockId = '';

    for await (const chunk of answerStream) {
      if (!responseBlockId) {
        const block: TextBlock = {
          id: crypto.randomUUID(),
          type: 'text',
          data: chunk.contentChunk,
        };

        session.emitBlock(block);

        responseBlockId = block.id;
      } else {
        const block = session.getBlock(responseBlockId) as TextBlock | null;

        if (!block) {
          continue;
        }

        block.data += chunk.contentChunk;

        session.updateBlock(block.id, [
          {
            op: 'replace',
            path: '/data',
            value: block.data,
          },
        ]);
      }
    }

    // Council mode: the configured second model answers independently, then a
    // judge compares both. Never allowed to break the primary answer.
    if (
      !classification.classification.skipSearch &&
      responseBlockId &&
      searchResults
    ) {
      try {
        const primaryBlock = session.getBlock(responseBlockId) as TextBlock;
        await this.runCouncil(
          session,
          input,
          finalContextWithWidgets,
          primaryBlock?.data ?? '',
        );
      } catch (err) {
        console.error('Council run failed:', err);
      }
    }

    session.emit('end', {});

    await db
      .update(messages)
      .set({
        status: 'completed',
        responseBlocks: session.getAllBlocks(),
      })
      .where(
        and(
          eq(messages.chatId, input.chatId),
          eq(messages.messageId, input.messageId),
        ),
      )
      .execute();
  }

  private async runDeepResearch(
    session: SessionManager,
    input: SearchAgentInput,
    classification: Awaited<ReturnType<typeof classify>>,
  ) {
    const schema = z.object({
      questions: z
        .array(z.string())
        .min(1)
        .max(3)
        .describe('Sub-questions covering the request comprehensively'),
    });

    let questions: string[] = [];
    try {
      const out = await input.config.llm.generateObject<typeof schema>({
        messages: [
          { role: 'system', content: decompositionPrompt },
          {
            role: 'user',
            content: `<conversation_history>\n${formatChatHistoryAsString(input.chatHistory)}\n</conversation_history>\n<user_query>\n${input.followUp}\n</user_query>`,
          },
        ],
        schema,
      });
      questions = (out.questions ?? []).slice(0, 3);
    } catch (err) {
      console.error('Deep research decomposition failed:', err);
    }
    if (questions.length === 0) questions = [input.followUp];

    const researcher = new Researcher();
    const findings: Chunk[] = [];
    const seen = new Set<string>();

    // Sequential: the local LLM serves one generation at a time.
    for (const q of questions) {
      const out = await researcher.research(session, {
        chatHistory: input.chatHistory,
        followUp: q,
        classification: { ...classification, standaloneFollowUp: q },
        config: { ...input.config, mode: 'balanced' },
      });

      (out?.searchFindings ?? []).forEach((f) => {
        const url = f.metadata?.url ?? f.content.slice(0, 80);
        if (!seen.has(url)) {
          seen.add(url);
          findings.push(f);
        }
      });
    }

    const finalContext = findings
      .map(
        (f, index) =>
          `<result index=${index + 1} title=${f.metadata.title} url=${f.metadata.url}>${f.content}</result>`,
      )
      .join('\n');

    const memories = await recall(input.followUp);
    const memoryContext =
      memories.length > 0
        ? `\n<shared_memory note="Facts the user or their other assistants saved earlier; use them when relevant, do NOT cite them as a source">\n${memories
            .map((m) => `<memory title="${m.title}">${m.summary}</memory>`)
            .join('\n')}\n</shared_memory>`
        : '';

    const context = `<search_results note="These are the search results gathered across sub-questions; the assistant can cite these">\n${finalContext}\n</search_results>${memoryContext}`;

    const writerPrompt = getWriterPrompt(
      context,
      input.config.systemInstructions,
      'quality',
    );

    await this.streamBlock(
      session,
      input.config.llm.streamText({
        messages: [
          { role: 'system', content: writerPrompt },
          ...input.chatHistory,
          { role: 'user', content: input.followUp },
        ],
      }),
    );

    session.emit('end', {});

    await db
      .update(messages)
      .set({
        status: 'completed',
        responseBlocks: session.getAllBlocks(),
      })
      .where(
        and(
          eq(messages.chatId, input.chatId),
          eq(messages.messageId, input.messageId),
        ),
      )
      .execute();
  }

  private async streamBlock(
    session: SessionManager,
    stream: AsyncIterable<{ contentChunk: string }>,
  ): Promise<string> {
    let blockId = '';
    let text = '';

    for await (const chunk of stream) {
      if (!blockId) {
        const block: TextBlock = {
          id: crypto.randomUUID(),
          type: 'text',
          data: chunk.contentChunk,
        };
        session.emitBlock(block);
        blockId = block.id;
        text = chunk.contentChunk;
      } else {
        text += chunk.contentChunk;
        session.updateBlock(blockId, [
          {
            op: 'replace',
            path: '/data',
            value: text,
          },
        ]);
      }
    }

    return text;
  }

  private async runCouncil(
    session: SessionManager,
    input: SearchAgentInput,
    writerContext: string,
    primaryAnswer: string,
  ) {
    const council = getCouncilModels();
    if (council.length === 0) return;

    // The council model may run with a much smaller context than the primary
    // model (llama.cpp answers 400 'Max length reached!' when the prompt
    // itself overflows). Keep only the highest-ranked results that fit.
    const COUNCIL_CONTEXT_TOKENS = 3000;
    const COUNCIL_HISTORY_TOKENS = 1200;

    const results = writerContext.match(/<result[\s\S]*?<\/result>/g) ?? [];
    const kept: string[] = [];
    let used = 0;
    for (const r of results) {
      const t = getTokenCount(r);
      if (used + t > COUNCIL_CONTEXT_TOKENS) break;
      kept.push(r);
      used += t;
    }

    const hist: typeof input.chatHistory = [];
    let hUsed = 0;
    for (let i = input.chatHistory.length - 1; i >= 0; i--) {
      const t = getTokenCount(String(input.chatHistory[i].content ?? ''));
      if (hUsed + t > COUNCIL_HISTORY_TOKENS) break;
      hUsed += t;
      hist.unshift(input.chatHistory[i]);
    }

    const councilContext =
      `<search_results note="Top search results for the query, truncated to fit the council model context; cite these">
` +
      kept.join('\n') +
      `
</search_results>`;

    session.emitBlock({
      id: crypto.randomUUID(),
      type: 'text',
      data: `

---

## ⚖️ Council — ${council.length} second opinions

`,
    });

    const registry = new ModelRegistry();
    const answers: { author: string; text: string }[] = [];
    for (const model of council) {
      session.emitBlock({
        id: crypto.randomUUID(),
        type: 'text',
        data: `### ${model.modelKey}

`,
      });
      // ponytail: one failing council model must not sink the others; if you
      // need retries, add them here.
      try {
        const chatModel = await registry.loadChatModel(
          model.providerId,
          model.modelKey,
        );
        const text = await this.streamBlock(
          session,
          chatModel.streamText({
            messages: [
              {
                role: 'system',
                content: getWriterPrompt(
                  councilContext,
                  input.config.systemInstructions,
                  'balanced',
                ),
              },
              ...hist,
              { role: 'user', content: input.followUp },
            ],
          }),
        );
        answers.push({ author: model.modelKey, text });
      } catch (err) {
        console.error('Council model failed:', model.modelKey, err);
        session.emitBlock({
          id: crypto.randomUUID(),
          type: 'text',
          data: `

> ⚠️ This council model failed and was skipped.

`,
        });
      }
    }

    if (answers.length === 0) return;

    session.emitBlock({
      id: crypto.randomUUID(),
      type: 'text',
      data: `

## Council verdict

`,
    });

    await this.streamBlock(
      session,
      input.config.llm.streamText({
        messages: [
          {
            role: 'system',
            content: getJudgePrompt(
              input.followUp,
              [{ author: 'primary-model', text: primaryAnswer }, ...answers],
            ),
          },
        ],
      }),
    );
  }
}

export default SearchAgent;
