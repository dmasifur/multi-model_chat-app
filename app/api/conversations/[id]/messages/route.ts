import { auth } from '@/auth';
import { getConversationWithMessages, saveMessage } from '@/lib/conversations';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const conversation = await getConversationWithMessages(session.user.id, id);
  if (!conversation) {
    return new Response('Not found', { status: 404 });
  }

  const body = (await req.json()) as { role?: string; modelId?: string | null; content?: string };
  if (
    (body.role !== 'user' && body.role !== 'assistant') ||
    typeof body.content !== 'string' ||
    body.content.length === 0
  ) {
    return new Response('Invalid message', { status: 400 });
  }

  const message = await saveMessage({
    conversationId: id,
    role: body.role,
    modelId: body.modelId ?? null,
    content: body.content,
  });

  return Response.json(message, { status: 201 });
}
