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
import { checkRateLimit } from '@/lib/rate-limit';
import { recordUsage } from '@/lib/usage';

const MAX_OUTPUT_TOKENS = 2048;

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

  // Fail closed: if the limiter can't be consulted we refuse the request
  // rather than let an unmetered call through to a paid provider.
  let withinRateLimit: boolean;
  try {
    withinRateLimit = await checkRateLimit(session.user.id);
  } catch {
    return new Response('Rate limiter unavailable', { status: 503 });
  }
  if (!withinRateLimit) {
    return new Response('Too many requests', { status: 429 });
  }

  const userId = session.user.id;
  const result = streamText({
    model: getModel(modelId),
    messages: await convertToModelMessages(messages as UIMessage[]),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: req.signal,
    onFinish: async ({ usage }) => {
      await recordUsage({
        userId,
        modelId,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
      }).catch(() => {
        // Usage logging is best-effort and must never fail the response.
      });
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
