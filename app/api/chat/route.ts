import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { auth } from '@/auth';
import { getModel, isModelAvailable } from '@/lib/models';
import { chatRequestSchema } from '@/lib/chat/message-schema';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return new Response('Invalid request body', { status: 400 });
  }
  const { messages, modelId } = parsed.data;

  if (!isModelAvailable(modelId)) {
    return new Response('Invalid or unavailable model', { status: 400 });
  }

  const result = streamText({
    model: getModel(modelId),
    messages: await convertToModelMessages(messages as UIMessage[]),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
