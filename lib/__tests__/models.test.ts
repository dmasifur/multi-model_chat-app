import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  MODEL_REGISTRY,
  isModelAvailable,
  listAvailableModels,
  getModel,
  listAllModelsWithAvailability,
} from '@/lib/models';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('MODEL_REGISTRY', () => {
  it('has one entry per supported provider with unique ids', () => {
    const ids = MODEL_REGISTRY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MODEL_REGISTRY.some((m) => m.provider === 'groq')).toBe(true);
    expect(MODEL_REGISTRY.some((m) => m.provider === 'openrouter')).toBe(true);
    expect(MODEL_REGISTRY.some((m) => m.provider === 'ollama')).toBe(true);
  });

  it('marks the ollama entry as kind "local" and the rest as "hosted"', () => {
    const ollamaEntry = MODEL_REGISTRY.find((m) => m.provider === 'ollama');
    expect(ollamaEntry?.kind).toBe('local');
    const hostedEntries = MODEL_REGISTRY.filter((m) => m.provider !== 'ollama');
    expect(hostedEntries.every((m) => m.kind === 'hosted')).toBe(true);
  });
});

describe('isModelAvailable', () => {
  it('returns false for an unknown model id', () => {
    expect(isModelAvailable('does-not-exist')).toBe(false);
  });

  it('returns false for a hosted model when its API key env var is unset', () => {
    vi.stubEnv('GROQ_API_KEY', '');
    const groqEntry = MODEL_REGISTRY.find((m) => m.provider === 'groq')!;
    expect(isModelAvailable(groqEntry.id)).toBe(false);
  });

  it('returns true for a hosted model when its API key env var is set', () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    const groqEntry = MODEL_REGISTRY.find((m) => m.provider === 'groq')!;
    expect(isModelAvailable(groqEntry.id)).toBe(true);
  });

  it('returns false for the local ollama model when OLLAMA_BASE_URL is unset', () => {
    vi.stubEnv('OLLAMA_BASE_URL', '');
    const ollamaEntry = MODEL_REGISTRY.find((m) => m.provider === 'ollama')!;
    expect(isModelAvailable(ollamaEntry.id)).toBe(false);
  });

  it('returns true for the local ollama model when OLLAMA_BASE_URL is set', () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://localhost:11434');
    const ollamaEntry = MODEL_REGISTRY.find((m) => m.provider === 'ollama')!;
    expect(isModelAvailable(ollamaEntry.id)).toBe(true);
  });
});

describe('listAvailableModels', () => {
  it('excludes models whose provider is not configured', () => {
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');
    expect(listAvailableModels()).toEqual([]);
  });

  it('includes only models whose provider is configured', () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');
    const available = listAvailableModels();
    expect(available.every((m) => m.provider === 'groq')).toBe(true);
    expect(available.length).toBeGreaterThan(0);
  });
});

describe('getModel', () => {
  it('throws for an unknown model id', () => {
    expect(() => getModel('does-not-exist')).toThrow(/unknown model/i);
  });

  it('throws when the model exists but its provider is not configured', () => {
    vi.stubEnv('GROQ_API_KEY', '');
    const groqEntry = MODEL_REGISTRY.find((m) => m.provider === 'groq')!;
    expect(() => getModel(groqEntry.id)).toThrow(/not (configured|available)/i);
  });

  it('returns a language model instance for a configured groq model', () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    const groqEntry = MODEL_REGISTRY.find((m) => m.provider === 'groq')!;
    const model = getModel(groqEntry.id);
    expect((model as { modelId: string }).modelId).toBe(groqEntry.providerModelId);
  });

  it('returns a language model instance for a configured openrouter model', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    const openrouterEntry = MODEL_REGISTRY.find((m) => m.provider === 'openrouter')!;
    const model = getModel(openrouterEntry.id);
    expect((model as { modelId: string }).modelId).toBe(openrouterEntry.providerModelId);
  });

  it('returns a language model instance for a configured ollama model', () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://localhost:11434');
    const ollamaEntry = MODEL_REGISTRY.find((m) => m.provider === 'ollama')!;
    const model = getModel(ollamaEntry.id);
    expect((model as { modelId: string }).modelId).toBe(ollamaEntry.providerModelId);
  });
});

describe('listAllModelsWithAvailability', () => {
  it('returns every registry entry regardless of configuration', () => {
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');
    const all = listAllModelsWithAvailability();
    expect(all).toHaveLength(MODEL_REGISTRY.length);
  });

  it('marks each entry available or not per its provider configuration', () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');
    const all = listAllModelsWithAvailability();
    const groqEntry = all.find((m) => m.provider === 'groq')!;
    const openrouterEntry = all.find((m) => m.provider === 'openrouter')!;
    expect(groqEntry.available).toBe(true);
    expect(openrouterEntry.available).toBe(false);
  });
});
