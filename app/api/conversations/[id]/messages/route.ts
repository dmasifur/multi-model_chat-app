import { z } from 'zod';
import { auth } from '@/auth';
import { getConversationWithMessages, saveMessage } from '@/lib/conversations';
import { isKnownModelId } from '@/lib/models';
import { MAX_MESSAGE_LENGTH } from '@/lib/chat/message-length';

const createMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  modelId: z
    .string()
    .nullish()
    .refine((id) => !id || isKnownModelId(id), { message: 'Unknown modelId' }),
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});

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

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const parsed = createMessageSchema.safeParse(json);
  if (!parsed.success) {
    return new Response('Invalid message', { status: 400 });
  }

  const message = await saveMessage({
    conversationId: id,
    role: parsed.data.role,
    modelId: parsed.data.modelId ?? null,
    content: parsed.data.content,
  });

  return Response.json(message, { status: 201 });
}
