import { auth } from '@/auth';
import { createConversation, listConversations } from '@/lib/conversations';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { title } = (await req.json()) as { title?: string };
  if (!title || typeof title !== 'string') {
    return new Response('Title is required', { status: 400 });
  }

  const conversation = await createConversation(session.user.id, title.slice(0, 200));
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
