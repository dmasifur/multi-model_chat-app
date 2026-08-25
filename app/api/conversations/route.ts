import { z } from 'zod';
import { auth } from '@/auth';
import { createConversation, listConversations } from '@/lib/conversations';

const createConversationSchema = z.object({
  title: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const parsed = createConversationSchema.safeParse(json);
  if (!parsed.success) {
    return new Response('Title is required', { status: 400 });
  }

  const conversation = await createConversation(session.user.id, parsed.data.title);
  return Response.json(conversation, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const list = await listConversations(session.user.id);
  return Response.json(list);
}
