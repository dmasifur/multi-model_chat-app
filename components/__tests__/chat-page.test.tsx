import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ModelDefinition } from '@/lib/models';

vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(),
}));

import { useChat } from '@ai-sdk/react';
import { ChatPage } from '@/components/chat-page';

const models: ModelDefinition[] = [
  {
    id: 'groq-llama-3.3-70b',
    label: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    providerModelId: 'llama-3.3-70b-versatile',
    kind: 'hosted',
  },
  {
    id: 'ollama-llama-3.1',
    label: 'Llama 3.1 (Ollama, local)',
    provider: 'ollama',
    providerModelId: 'llama3.1',
    kind: 'local',
  },
];

beforeEach(() => {
  vi.mocked(useChat).mockReset();
  vi.mocked(useChat).mockReturnValue({
    messages: [],
    sendMessage: vi.fn(),
    status: 'ready',
    stop: vi.fn(),
  } as never);
});

describe('ChatPage', () => {
  it('shows a message when no models are configured', () => {
    render(<ChatPage availableModels={[]} />);
    expect(screen.getByText(/no models are configured/i)).toBeTruthy();
  });

  it('renders a checkbox per model, with the first pre-selected', () => {
    render(<ChatPage availableModels={models} />);

    const first = screen.getByRole('checkbox', { name: models[0].label }) as HTMLInputElement;
    const second = screen.getByRole('checkbox', { name: models[1].label }) as HTMLInputElement;
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);
  });

  it('mounts a column when a model is checked and unmounts it when unchecked', () => {
    render(<ChatPage availableModels={models} />);

    expect(screen.getAllByText(models[0].label)).toHaveLength(2); // checkbox label + column header
    expect(screen.queryAllByText(models[1].label)).toHaveLength(1); // checkbox label only

    fireEvent.click(screen.getByRole('checkbox', { name: models[1].label }));
    expect(screen.getAllByText(models[1].label)).toHaveLength(2); // now also has a column header

    fireEvent.click(screen.getByRole('checkbox', { name: models[0].label }));
    expect(screen.queryAllByText(models[0].label)).toHaveLength(1); // column header gone
  });

  it('fans a submitted message out to every selected column with its own modelId', async () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage,
      status: 'ready',
      stop: vi.fn(),
    } as never);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'conv-1' }), { status: 201 }))
      .mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<ChatPage availableModels={models} />);
    fireEvent.click(screen.getByRole('checkbox', { name: models[1].label }));

    fireEvent.change(screen.getByPlaceholderText(/type a message/i), {
      target: { value: 'compare these' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        { text: 'compare these' },
        { body: { modelId: models[0].id } },
      ),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      { text: 'compare these' },
      { body: { modelId: models[1].id } },
    );
    expect(sendMessage).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it('clears the input after a successful fan-out send', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'conv-1' }), { status: 201 }))
      .mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<ChatPage availableModels={models} />);

    const input = screen.getByPlaceholderText(/type a message/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await vi.waitFor(() => expect(input.value).toBe(''));

    vi.unstubAllGlobals();
  });

  it('does not send when the input is empty or whitespace-only', () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage,
      status: 'ready',
      stop: vi.fn(),
    } as never);

    render(<ChatPage availableModels={models} />);
    fireEvent.change(screen.getByPlaceholderText(/type a message/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('disables the submit button when no models are selected', () => {
    render(<ChatPage availableModels={models} />);

    fireEvent.click(screen.getByRole('checkbox', { name: models[0].label }));

    expect(screen.getByRole('button', { name: /send/i })).toHaveProperty('disabled', true);
  });

  it('creates a conversation on first send and saves the user message', async () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage,
      status: 'ready',
      stop: vi.fn(),
    } as never);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'conv-1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<ChatPage availableModels={models} />);
    fireEvent.change(screen.getByPlaceholderText(/type a message/i), {
      target: { value: 'hello world' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/conversations',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'hello world' }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/conversations/conv-1/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ role: 'user', modelId: null, content: 'hello world' }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('reuses the existing conversation id on subsequent sends instead of creating a new one', async () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage,
      status: 'ready',
      stop: vi.fn(),
    } as never);

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<ChatPage availableModels={models} conversationId="conv-existing" />);
    fireEvent.change(screen.getByPlaceholderText(/type a message/i), {
      target: { value: 'second turn' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/conversations/conv-existing/messages',
      expect.objectContaining({ method: 'POST' }),
    );

    vi.unstubAllGlobals();
  });

  it('seeds selected models and column history from initialColumns', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'ready',
      stop: vi.fn(),
    } as never);

    render(
      <ChatPage
        availableModels={models}
        conversationId="conv-1"
        initialColumns={[
          {
            modelId: models[1].id,
            messages: [{ role: 'user', modelId: null, content: 'Q', createdAt: new Date() }],
          },
        ]}
      />,
    );

    const first = screen.getByRole('checkbox', { name: models[0].label }) as HTMLInputElement;
    const second = screen.getByRole('checkbox', { name: models[1].label }) as HTMLInputElement;
    expect(first.checked).toBe(false);
    expect(second.checked).toBe(true);
  });
});
