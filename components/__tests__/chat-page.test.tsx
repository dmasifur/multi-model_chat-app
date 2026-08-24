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
});

describe('ChatPage', () => {
  it('shows a message when no models are configured', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'ready',
    } as never);

    render(<ChatPage availableModels={[]} />);

    expect(screen.getByText(/no models are configured/i)).toBeTruthy();
  });

  it('renders a model picker defaulting to the first available model', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'ready',
    } as never);

    render(<ChatPage availableModels={models} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe(models[0].id);
    expect(screen.getByText(models[0].label)).toBeTruthy();
    expect(screen.getByText(models[1].label)).toBeTruthy();
  });

  it('renders existing messages from useChat', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
        { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
      ],
      sendMessage: vi.fn(),
      status: 'ready',
    } as never);

    render(<ChatPage availableModels={models} />);

    expect(screen.getByText('Hi there')).toBeTruthy();
    expect(screen.getByText('Hello!')).toBeTruthy();
  });

  it('sends a message with the selected modelId and clears the input', () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage, status: 'ready' } as never);

    render(<ChatPage availableModels={models} />);

    const input = screen.getByPlaceholderText(/type a message/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello world' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).toHaveBeenCalledWith(
      { text: 'hello world' },
      { body: { modelId: models[0].id } },
    );
    expect(input.value).toBe('');
  });

  it('sends the newly selected modelId after switching models', () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage, status: 'ready' } as never);

    render(<ChatPage availableModels={models} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: models[1].id } });
    fireEvent.change(screen.getByPlaceholderText(/type a message/i), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).toHaveBeenCalledWith({ text: 'hi' }, { body: { modelId: models[1].id } });
  });

  it('does not send an empty or whitespace-only message', () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage, status: 'ready' } as never);

    render(<ChatPage availableModels={models} />);

    fireEvent.change(screen.getByPlaceholderText(/type a message/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
