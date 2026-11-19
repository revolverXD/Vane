import { z } from 'zod';
import { remember } from '@/lib/memory/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(8000),
});

export const POST = async (req: Request) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ message: 'title and summary are required' }, { status: 400 });
  }

  const result = await remember(parsed.data.title, parsed.data.summary);
  return Response.json(
    { message: result.ok ? 'saved' : result.message },
    { status: result.ok ? 200 : 502 },
  );
};
