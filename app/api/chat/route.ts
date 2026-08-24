import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { auth } from '@/auth';
import { getModel, isModelAvailable } from '@/lib/models';
import { exceedsMaxLength } from '@/lib/chat/message-length';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { messages?: UIMessage[]; modelId?: string };
  try {
    body = (await req.json()) as { messages?: UIMessage[]; modelId?: string };
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  const { messages, modelId } = body;

  if (!modelId || !isModelAvailable(modelId)) {
    return new Response('Invalid or unavailable model', { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('Messages are required', { status: 400 });
  }

  const lastMessage = messages[messages.length - 1];
  if (exceedsMaxLength(lastMessage)) {
    return new Response('Message too long', { status: 400 });
  }

  const result = streamText({
    model: getModel(modelId),
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
