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
