import db from '@/lib/db';
import { chats, messages, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const patchChatSchema = z.object({
  projectId: z.string().nullable(),
});

export const PATCH = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    const chatExists = await db.query.chats.findFirst({
      where: eq(chats.id, id),
    });

    if (!chatExists) {
      return Response.json({ message: 'Chat not found' }, { status: 404 });
    }

    const parsed = patchChatSchema.safeParse(await req.json());

    if (!parsed.success) {
      return Response.json(
        { message: 'Invalid request body', error: parsed.error.issues },
        { status: 400 },
      );
    }

    if (parsed.data.projectId !== null) {
      const projectExists = await db.query.projects.findFirst({
        where: eq(projects.id, parsed.data.projectId),
      });

      if (!projectExists) {
        return Response.json({ message: 'Project not found' }, { status: 404 });
      }
    }

    await db
      .update(chats)
      .set({ projectId: parsed.data.projectId })
      .where(eq(chats.id, id))
      .execute();

    return Response.json({ message: 'Chat updated' }, { status: 200 });
  } catch (err) {
    console.error('Error in updating chat: ', err);
    return Response.json({ message: 'An error has occurred.' }, { status: 500 });
  }
};

export const GET = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    const chatExists = await db.query.chats.findFirst({
      where: eq(chats.id, id),
    });

    if (!chatExists) {
      return Response.json({ message: 'Chat not found' }, { status: 404 });
    }

    const chatMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, id),
    });

    return Response.json(
      {
        chat: chatExists,
        messages: chatMessages,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('Error in getting chat by id: ', err);
    return Response.json(
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
};

export const DELETE = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    const chatExists = await db.query.chats.findFirst({
      where: eq(chats.id, id),
    });

    if (!chatExists) {
      return Response.json({ message: 'Chat not found' }, { status: 404 });
    }

    await db.delete(chats).where(eq(chats.id, id)).execute();
    await db.delete(messages).where(eq(messages.chatId, id)).execute();

    return Response.json(
      { message: 'Chat deleted successfully' },
      { status: 200 },
    );
  } catch (err) {
    console.error('Error in deleting chat by id: ', err);
    return Response.json(
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
};
