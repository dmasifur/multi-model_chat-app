import { auth } from '@/auth';
import { getConversationWithMessages, groupMessagesByModel } from '@/lib/conversations';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const conversation = await getConversationWithMessages(session.user.id, id);
  if (!conversation) {
    return new Response('Not found', { status: 404 });
  }

  return Response.json({
    id: conversation.id,
    title: conversation.title,
    groupedColumns: groupMessagesByModel(conversation.messages),
  });
}
