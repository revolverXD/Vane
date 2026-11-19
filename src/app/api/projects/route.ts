import { z } from 'zod';
import crypto from 'crypto';
import db from '@/lib/db';
import { projects } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  instructions: z.string().max(10000).optional().default(''),
});

export const GET = async () => {
  try {
    const allProjects = await db.query.projects.findMany({
      orderBy: (projects, { desc }) => [desc(projects.createdAt)],
    });

    return Response.json({ projects: allProjects }, { status: 200 });
  } catch (err) {
    console.error('Error in getting projects: ', err);
    return Response.json({ message: 'An error has occurred.' }, { status: 500 });
  }
};

export const POST = async (req: Request) => {
  try {
    const parsed = createProjectSchema.safeParse(await req.json());

    if (!parsed.success) {
      return Response.json(
        { message: 'Invalid request body', error: parsed.error.issues },
        { status: 400 },
      );
    }

    const project = {
      id: crypto.randomUUID(),
      name: parsed.data.name,
      instructions: parsed.data.instructions,
      createdAt: new Date().toISOString(),
    };

    await db.insert(projects).values(project).execute();

    return Response.json({ project }, { status: 201 });
  } catch (err) {
    console.error('Error in creating project: ', err);
    return Response.json({ message: 'An error has occurred.' }, { status: 500 });
  }
};
