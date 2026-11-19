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
import { getCouncilConfig } from '@/lib/config/serverRegistry';
import { getJudgePrompt } from '@/lib/prompts/search/council';

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
    const council = getCouncilConfig();
    if (!council) return;

    const registry = new ModelRegistry();
    const second = await registry.loadChatModel(
      council.providerId,
      council.modelKey,
    );

    session.emitBlock({
      id: crypto.randomUUID(),
      type: 'text',
      data: `\n\n---\n\n## ⚖️ Council — second opinion (${council.modelKey})\n\n`,
    });

    const secondAnswer = await this.streamBlock(
      session,
      second.streamText({
        messages: [
          {
            role: 'system',
            content: getWriterPrompt(
              writerContext,
              input.config.systemInstructions,
              input.config.mode,
            ),
          },
          ...input.chatHistory,
          {
            role: 'user',
            content: input.followUp,
          },
        ],
      }),
    );

    session.emitBlock({
      id: crypto.randomUUID(),
      type: 'text',
      data: `\n\n## Council verdict\n\n`,
    });

    await this.streamBlock(
      session,
      input.config.llm.streamText({
        messages: [
          {
            role: 'system',
            content: getJudgePrompt(
              input.followUp,
              primaryAnswer,
              secondAnswer,
              'primary-model',
              council.modelKey,
            ),
          },
        ],
      }),
    );
  }
}

export default SearchAgent;
