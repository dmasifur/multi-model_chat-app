import { z } from 'zod';
import { auth } from '@/auth';
import { saveMessage } from '@/lib/conversations';
import { isKnownModelId } from '@/lib/models';
import { MAX_MESSAGE_LENGTH } from '@/lib/chat/message-length';
import { checkRateLimit, DEFAULT_WRITE_RATE_LIMIT } from '@/lib/rate-limit';

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

  let withinRateLimit: boolean;
  try {
    withinRateLimit = await checkRateLimit(session.user.id, DEFAULT_WRITE_RATE_LIMIT);
  } catch {
    return new Response('Rate limiter unavailable', { status: 503 });
  }
  if (!withinRateLimit) {
    return new Response('Too many requests', { status: 429 });
  }

  const message = await saveMessage({
    userId: session.user.id,
    conversationId: id,
    role: parsed.data.role,
    modelId: parsed.data.modelId ?? null,
    content: parsed.data.content,
  });
  // saveMessage returns null when the conversation isn't owned by this user,
  // which is the only ownership check this route needs.
  if (!message) {
    return new Response('Not found', { status: 404 });
  }

  return Response.json(message, { status: 201 });
}
