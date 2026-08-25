import 'server-only';
import type { LanguageModel } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOllama } from 'ollama-ai-provider-v2';

export type ModelKind = 'hosted' | 'local';
export type ModelProviderName = 'groq' | 'openrouter' | 'ollama';

export interface ModelDefinition {
  id: string;
  label: string;
  provider: ModelProviderName;
  providerModelId: string;
  kind: ModelKind;
}

export const MODEL_REGISTRY: ModelDefinition[] = [
  {
    id: 'groq-llama-3.3-70b',
    label: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    providerModelId: 'llama-3.3-70b-versatile',
    kind: 'hosted',
  },
  {
    id: 'openrouter-llama-3.3-70b-free',
    label: 'Llama 3.3 70B Free (OpenRouter)',
    provider: 'openrouter',
    providerModelId: 'meta-llama/llama-3.3-70b-instruct:free',
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

function isProviderConfigured(provider: ModelProviderName): boolean {
  switch (provider) {
    case 'groq':
      return Boolean(process.env.GROQ_API_KEY);
    case 'openrouter':
      return Boolean(process.env.OPENROUTER_API_KEY);
    case 'ollama':
      return Boolean(process.env.OLLAMA_BASE_URL);
  }
}

export function isKnownModelId(id: string): boolean {
  return MODEL_REGISTRY.some((m) => m.id === id);
}

export function isModelAvailable(id: string): boolean {
  const definition = MODEL_REGISTRY.find((m) => m.id === id);
  if (!definition) {
    return false;
  }
  return isProviderConfigured(definition.provider);
}

export function listAvailableModels(): ModelDefinition[] {
  return MODEL_REGISTRY.filter((m) => isProviderConfigured(m.provider));
}

export interface ModelAvailability extends ModelDefinition {
  available: boolean;
}

export function listAllModelsWithAvailability(): ModelAvailability[] {
  return MODEL_REGISTRY.map((model) => ({
    ...model,
    available: isProviderConfigured(model.provider),
  }));
}

export function getModel(id: string): LanguageModel {
  const definition = MODEL_REGISTRY.find((m) => m.id === id);
  if (!definition) {
    throw new Error(`Unknown model id: ${id}`);
  }
  if (!isModelAvailable(id)) {
    throw new Error(`Model "${id}" is not available: ${definition.provider} is not configured`);
  }

  switch (definition.provider) {
    case 'groq': {
      const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
      return groq(definition.providerModelId);
    }
    case 'openrouter': {
      const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
      return openrouter.chat(definition.providerModelId);
    }
    case 'ollama': {
      const ollama = createOllama({ baseURL: process.env.OLLAMA_BASE_URL });
      return ollama(definition.providerModelId);
    }
  }
}
