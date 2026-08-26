import { z } from 'zod';
import { auth } from '@/auth';
import { createConversation, listConversations } from '@/lib/conversations';
import { checkRateLimit, DEFAULT_WRITE_RATE_LIMIT } from '@/lib/rate-limit';
import { MAX_MESSAGE_LENGTH } from '@/lib/chat/message-length';

const CONVERSATION_TITLE_MAX_LENGTH = 200;

// The client sends the first chat message verbatim as the title (see
// components/chat-page.tsx), which can be far longer than a title should be.
// Truncate rather than reject: the length limit here is cosmetic, not a
// content restriction, and rejecting would silently block starting a new
// conversation whenever the first message ran long.
const createConversationSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(MAX_MESSAGE_LENGTH)
    .transform((title) => title.slice(0, CONVERSATION_TITLE_MAX_LENGTH)),
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

  // Fail closed, as in /api/chat: an unavailable limiter must not become an
  // open door to unbounded row creation.
  let withinRateLimit: boolean;
  try {
    withinRateLimit = await checkRateLimit(session.user.id, DEFAULT_WRITE_RATE_LIMIT);
  } catch {
    return new Response('Rate limiter unavailable', { status: 503 });
  }
  if (!withinRateLimit) {
    return new Response('Too many requests', { status: 429 });
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
