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

  it('fans a submitted message out to every selected column with its own modelId', () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage,
      status: 'ready',
      stop: vi.fn(),
    } as never);

    render(<ChatPage availableModels={models} />);
    fireEvent.click(screen.getByRole('checkbox', { name: models[1].label }));

    fireEvent.change(screen.getByPlaceholderText(/type a message/i), {
      target: { value: 'compare these' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).toHaveBeenCalledWith(
      { text: 'compare these' },
      { body: { modelId: models[0].id } },
    );
    expect(sendMessage).toHaveBeenCalledWith(
      { text: 'compare these' },
      { body: { modelId: models[1].id } },
    );
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('clears the input after a successful fan-out send', () => {
    render(<ChatPage availableModels={models} />);

    const input = screen.getByPlaceholderText(/type a message/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(input.value).toBe('');
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
});
