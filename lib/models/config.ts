// Model configuration and provider support system

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl?: string;
  apiKeyEnv: string;
  supportsStreaming: boolean;
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export interface ModelCapabilities {
  reasoning: number; // 1-10 scale
  creativity: number; // 1-10 scale
  speed: number; // 1-10 scale (relative)
  multimodal: boolean;
  functionCalling: boolean;
  jsonMode: boolean;
}

export interface ModelPricing {
  inputCostPer1kTokens: number; // USD
  outputCostPer1kTokens: number; // USD
  currency: string;
}

export interface ModelSpec {
  id: string;
  name: string;
  displayName: string;
  provider: string;
  contextLength: number; // tokens
  maxOutputTokens: number;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  description: string;
  releaseDate: string;
  deprecated: boolean;
  recommended: boolean;
  category: 'general' | 'reasoning' | 'creative' | 'code' | 'fast';
}

// Provider configurations
export const MODEL_PROVIDERS: Record<string, ModelProvider> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    apiKeyEnv: 'OPENAI_API_KEY',
    supportsStreaming: true,
    rateLimits: {
      requestsPerMinute: 10000,
      tokensPerMinute: 10000000
    }
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    supportsStreaming: true,
    rateLimits: {
      requestsPerMinute: 5000,
      tokensPerMinute: 5000000
    }
  },
  google: {
    id: 'google',
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKeyEnv: 'GOOGLE_API_KEY',
    supportsStreaming: true,
    rateLimits: {
      requestsPerMinute: 2000,
      tokensPerMinute: 2000000
    }
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    supportsStreaming: true,
    rateLimits: {
      requestsPerMinute: 1000,
      tokensPerMinute: 1000000
    }
  }
};

// Model specifications database
export const MODEL_SPECS: ModelSpec[] = [
  // OpenAI Models
  {
    id: 'gpt-4o',
    name: 'gpt-4o',
    displayName: 'GPT-4o',
    provider: 'openai',
    contextLength: 128000,
    maxOutputTokens: 16384,
    pricing: {
      inputCostPer1kTokens: 0.0025,
      outputCostPer1kTokens: 0.01,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 9,
      creativity: 8,
      speed: 8,
      multimodal: true,
      functionCalling: true,
      jsonMode: true
    },
    description: 'Most advanced OpenAI model with vision and fast performance',
    releaseDate: '2024-05-13',
    deprecated: false,
    recommended: true,
    category: 'general'
  },
  {
    id: 'gpt-4-turbo',
    name: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    provider: 'openai',
    contextLength: 128000,
    maxOutputTokens: 4096,
    pricing: {
      inputCostPer1kTokens: 0.01,
      outputCostPer1kTokens: 0.03,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 9,
      creativity: 8,
      speed: 7,
      multimodal: false,
      functionCalling: true,
      jsonMode: true
    },
    description: 'High-performance model with large context window',
    releaseDate: '2024-04-09',
    deprecated: false,
    recommended: true,
    category: 'general'
  },
  {
    id: 'gpt-4',
    name: 'gpt-4',
    displayName: 'GPT-4',
    provider: 'openai',
    contextLength: 8192,
    maxOutputTokens: 4096,
    pricing: {
      inputCostPer1kTokens: 0.03,
      outputCostPer1kTokens: 0.06,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 9,
      creativity: 8,
      speed: 5,
      multimodal: false,
      functionCalling: true,
      jsonMode: false
    },
    description: 'Original GPT-4 with smaller context window',
    releaseDate: '2023-03-14',
    deprecated: false,
    recommended: false,
    category: 'general'
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    provider: 'openai',
    contextLength: 16384,
    maxOutputTokens: 4096,
    pricing: {
      inputCostPer1kTokens: 0.0005,
      outputCostPer1kTokens: 0.0015,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 7,
      creativity: 7,
      speed: 9,
      multimodal: false,
      functionCalling: true,
      jsonMode: true
    },
    description: 'Fast and cost-effective for simpler tasks',
    releaseDate: '2023-03-01',
    deprecated: false,
    recommended: false,
    category: 'fast'
  },

  // Anthropic Models
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextLength: 200000,
    maxOutputTokens: 8192,
    pricing: {
      inputCostPer1kTokens: 0.003,
      outputCostPer1kTokens: 0.015,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 10,
      creativity: 9,
      speed: 7,
      multimodal: true,
      functionCalling: true,
      jsonMode: false
    },
    description: 'Most capable Claude model with excellent reasoning',
    releaseDate: '2024-10-22',
    deprecated: false,
    recommended: true,
    category: 'reasoning'
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'claude-3-haiku-20240307',
    displayName: 'Claude 3 Haiku',
    provider: 'anthropic',
    contextLength: 200000,
    maxOutputTokens: 4096,
    pricing: {
      inputCostPer1kTokens: 0.00025,
      outputCostPer1kTokens: 0.00125,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 7,
      creativity: 6,
      speed: 10,
      multimodal: false,
      functionCalling: false,
      jsonMode: false
    },
    description: 'Fastest Claude model, great for simple tasks',
    releaseDate: '2024-03-07',
    deprecated: false,
    recommended: false,
    category: 'fast'
  },

  // Google Models
  {
    id: 'gemini-1.5-pro',
    name: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    provider: 'google',
    contextLength: 1000000,
    maxOutputTokens: 8192,
    pricing: {
      inputCostPer1kTokens: 0.0035,
      outputCostPer1kTokens: 0.0105,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 8,
      creativity: 8,
      speed: 6,
      multimodal: true,
      functionCalling: true,
      jsonMode: true
    },
    description: 'Massive context window, excellent for long documents',
    releaseDate: '2024-02-15',
    deprecated: false,
    recommended: true,
    category: 'general'
  },
  {
    id: 'gemini-1.5-flash',
    name: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    provider: 'google',
    contextLength: 1000000,
    maxOutputTokens: 8192,
    pricing: {
      inputCostPer1kTokens: 0.000075,
      outputCostPer1kTokens: 0.0003,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 7,
      creativity: 7,
      speed: 10,
      multimodal: true,
      functionCalling: true,
      jsonMode: true
    },
    description: 'Ultra-fast with huge context, very cost-effective',
    releaseDate: '2024-05-14',
    deprecated: false,
    recommended: true,
    category: 'fast'
  },

  // DeepSeek Models
  {
    id: 'deepseek-chat',
    name: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    provider: 'deepseek',
    contextLength: 32000,
    maxOutputTokens: 4096,
    pricing: {
      inputCostPer1kTokens: 0.0001,
      outputCostPer1kTokens: 0.0002,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 7,
      creativity: 6,
      speed: 8,
      multimodal: false,
      functionCalling: true,
      jsonMode: true
    },
    description: 'Extremely cost-effective open model',
    releaseDate: '2024-01-15',
    deprecated: false,
    recommended: false,
    category: 'fast'
  }
];

// Utility functions
export function getModelById(id: string): ModelSpec | undefined {
  return MODEL_SPECS.find(model => model.id === id);
}

export function getModelsByProvider(providerId: string): ModelSpec[] {
  return MODEL_SPECS.filter(model => model.provider === providerId);
}

export function getRecommendedModels(): ModelSpec[] {
  return MODEL_SPECS.filter(model => model.recommended && !model.deprecated);
}

export function getCompatibleModels(requiredTokens: number): ModelSpec[] {
  return MODEL_SPECS.filter(model => 
    !model.deprecated && 
    model.contextLength >= requiredTokens
  );
}

export function calculateCost(model: ModelSpec, inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1000) * model.pricing.inputCostPer1kTokens;
  const outputCost = (outputTokens / 1000) * model.pricing.outputCostPer1kTokens;
  return inputCost + outputCost;
}

export function isProviderAvailable(providerId: string): boolean {
  const provider = MODEL_PROVIDERS[providerId];
  if (!provider) return false;
  
  // Check if API key is available in environment
  return !!process.env[provider.apiKeyEnv];
}

export function getAvailableModels(): ModelSpec[] {
  return MODEL_SPECS.filter(model => 
    !model.deprecated && 
    isProviderAvailable(model.provider)
  );
}