import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ModelDefinition } from '@/lib/models';

vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(),
}));

import { useChat } from '@ai-sdk/react';
import { ChatColumn, type ChatColumnHandle } from '@/components/chat-column';

const model: ModelDefinition = {
  id: 'groq-llama-3.3-70b',
  label: 'Llama 3.3 70B (Groq)',
  provider: 'groq',
  providerModelId: 'llama-3.3-70b-versatile',
  kind: 'hosted',
};

beforeEach(() => {
  vi.mocked(useChat).mockReset();
});

describe('ChatColumn', () => {
  it('renders the model label', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'ready',
      stop: vi.fn(),
      error: undefined,
      regenerate: vi.fn(),
    } as never);

    render(<ChatColumn model={model} ref={null} />);

    expect(screen.getByText(model.label)).toBeTruthy();
  });

  it('renders existing messages from its own useChat instance', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'Hi from Groq' }] }],
      sendMessage: vi.fn(),
      status: 'ready',
      stop: vi.fn(),
      error: undefined,
      regenerate: vi.fn(),
    } as never);

    render(<ChatColumn model={model} ref={null} />);

    expect(screen.getByText('Hi from Groq')).toBeTruthy();
  });

  it('shows no Stop button when status is ready', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'ready',
      stop: vi.fn(),
      error: undefined,
      regenerate: vi.fn(),
    } as never);

    render(<ChatColumn model={model} ref={null} />);

    expect(screen.queryByRole('button', { name: /stop/i })).toBeNull();
  });

  it('shows a Stop button while streaming and calls stop() on click', () => {
    const stop = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'streaming',
      stop,
      error: undefined,
      regenerate: vi.fn(),
    } as never);

    render(<ChatColumn model={model} ref={null} />);

    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(stop).toHaveBeenCalled();
  });

  it('exposes sendMessage via ref that calls the underlying sendMessage with modelId', () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage,
      status: 'ready',
      stop: vi.fn(),
      error: undefined,
      regenerate: vi.fn(),
    } as never);

    const ref = createRef<ChatColumnHandle>();
    render(<ChatColumn model={model} ref={ref} />);

    ref.current?.sendMessage('hello', 'conversation-1');

    expect(sendMessage).toHaveBeenCalledWith({ text: 'hello' }, { body: { modelId: model.id } });
  });

  it('posts the assistant message to the conversation when a stream finishes', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    let capturedOnFinish: ((args: { message: unknown }) => void) | undefined;
    vi.mocked(useChat).mockImplementation(((options?: { onFinish?: typeof capturedOnFinish }) => {
      capturedOnFinish = options?.onFinish;
      return {
        messages: [],
        sendMessage: vi.fn(),
        status: 'ready',
        stop: vi.fn(),
        error: undefined,
        regenerate: vi.fn(),
      };
    }) as never);

    const ref = createRef<ChatColumnHandle>();
    render(<ChatColumn model={model} ref={ref} />);
    ref.current?.sendMessage('hello', 'conversation-1');

    capturedOnFinish?.({
      message: { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'reply text' }] },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/conversations/conversation-1/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ role: 'assistant', modelId: model.id, content: 'reply text' }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('does not post when onFinish fires before any sendMessage call set a conversation id', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    let capturedOnFinish: ((args: { message: unknown }) => void) | undefined;
    vi.mocked(useChat).mockImplementation(((options?: { onFinish?: typeof capturedOnFinish }) => {
      capturedOnFinish = options?.onFinish;
      return {
        messages: [],
        sendMessage: vi.fn(),
        status: 'ready',
        stop: vi.fn(),
        error: undefined,
        regenerate: vi.fn(),
      };
    }) as never);

    render(<ChatColumn model={model} ref={null} />);
    capturedOnFinish?.({
      message: { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'x' }] },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('shows an error message and Retry button when the stream errors', () => {
    const regenerate = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'error',
      stop: vi.fn(),
      error: new Error('rate limited'),
      regenerate,
    } as never);

    render(<ChatColumn model={model} ref={null} />);

    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(regenerate).toHaveBeenCalled();
  });

  it('shows no error UI when there is no error', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'ready',
      stop: vi.fn(),
      error: undefined,
      regenerate: vi.fn(),
    } as never);

    render(<ChatColumn model={model} ref={null} />);

    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it('does not persist an assistant message with no text content', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    let capturedOnFinish: ((args: { message: unknown }) => void) | undefined;
    vi.mocked(useChat).mockImplementation(((options?: { onFinish?: typeof capturedOnFinish }) => {
      capturedOnFinish = options?.onFinish;
      return {
        messages: [],
        sendMessage: vi.fn(),
        status: 'ready',
        stop: vi.fn(),
        error: undefined,
        regenerate: vi.fn(),
      };
    }) as never);

    const ref = createRef<ChatColumnHandle>();
    render(<ChatColumn model={model} ref={ref} />);
    ref.current?.sendMessage('hello', 'conversation-1');

    capturedOnFinish?.({ message: { id: 'm1', role: 'assistant', parts: [] } });

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
