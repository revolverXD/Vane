import { z } from 'zod';
import db from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  instructions: z.string().max(10000).optional(),
});

export const PATCH = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    const projectExists = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    if (!projectExists) {
      return Response.json({ message: 'Project not found' }, { status: 404 });
    }

    const parsed = updateProjectSchema.safeParse(await req.json());

    if (!parsed.success) {
      return Response.json(
        { message: 'Invalid request body', error: parsed.error.issues },
        { status: 400 },
      );
    }

    const [project] = await db
      .update(projects)
      .set(parsed.data)
      .where(eq(projects.id, id))
      .returning()
      .execute();

    return Response.json({ project }, { status: 200 });
  } catch (err) {
    console.error('Error in updating project: ', err);
    return Response.json({ message: 'An error has occurred.' }, { status: 500 });
  }
};

export const DELETE = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    const projectExists = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    if (!projectExists) {
      return Response.json({ message: 'Project not found' }, { status: 404 });
    }

    await db.delete(projects).where(eq(projects.id, id)).execute();

    return Response.json(
      { message: 'Project deleted successfully' },
      { status: 200 },
    );
  } catch (err) {
    console.error('Error in deleting project: ', err);
    return Response.json({ message: 'An error has occurred.' }, { status: 500 });
  }
};
