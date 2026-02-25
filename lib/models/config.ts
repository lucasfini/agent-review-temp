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
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    apiKeyEnv: 'PERPLEXITY_API_KEY',
    supportsStreaming: true,
    rateLimits: {
      requestsPerMinute: 1000,
      tokensPerMinute: 1000000
    }
  }
};

// Model specifications database
export const MODEL_SPECS: ModelSpec[] = [
  // OpenAI GPT-5 Family
  {
    id: 'gpt-5',
    name: 'gpt-5',
    displayName: 'GPT-5',
    provider: 'openai',
    contextLength: 128000,
    maxOutputTokens: 16384,
    pricing: {
      inputCostPer1kTokens: 0.00125,
      outputCostPer1kTokens: 0.01,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 10,
      creativity: 10,
      speed: 7,
      multimodal: true,
      functionCalling: true,
      jsonMode: true
    },
    description: 'Flagship model — deep reasoning and multi-speaker analysis',
    releaseDate: '2025-01-01',
    deprecated: false,
    recommended: true,
    category: 'reasoning'
  },
  {
    id: 'gpt-5-mini',
    name: 'gpt-5-mini',
    displayName: 'GPT-5 Mini',
    provider: 'openai',
    contextLength: 128000,
    maxOutputTokens: 16384,
    pricing: {
      inputCostPer1kTokens: 0.00025,
      outputCostPer1kTokens: 0.002,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 8,
      creativity: 9,
      speed: 9,
      multimodal: true,
      functionCalling: true,
      jsonMode: true
    },
    description: 'Best balance of quality and cost — language tasks, summaries, content generation',
    releaseDate: '2025-01-01',
    deprecated: false,
    recommended: true,
    category: 'general'
  },
  {
    id: 'gpt-5-nano',
    name: 'gpt-5-nano',
    displayName: 'GPT-5 Nano',
    provider: 'openai',
    contextLength: 128000,
    maxOutputTokens: 16384,
    pricing: {
      inputCostPer1kTokens: 0.00005,
      outputCostPer1kTokens: 0.0004,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 7,
      creativity: 7,
      speed: 10,
      multimodal: false,
      functionCalling: true,
      jsonMode: true
    },
    description: 'Ultra-fast and cheap — classification, routing, structured extraction',
    releaseDate: '2025-01-01',
    deprecated: false,
    recommended: true,
    category: 'fast'
  },
  // OpenAI Legacy Models
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
    description: 'Best balance of quality, speed, and cost for content generation',
    releaseDate: '2024-05-13',
    deprecated: false,
    recommended: true,
    category: 'general'
  },
  {
    id: 'gpt-4o-mini',
    name: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    provider: 'openai',
    contextLength: 128000,
    maxOutputTokens: 16384,
    pricing: {
      inputCostPer1kTokens: 0.00015,
      outputCostPer1kTokens: 0.0006,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 8,
      creativity: 7,
      speed: 10,
      multimodal: true,
      functionCalling: true,
      jsonMode: true
    },
    description: 'Most cost-effective option, 15x cheaper than GPT-4o with good quality',
    releaseDate: '2024-07-18',
    deprecated: false,
    recommended: true,
    category: 'fast'
  },
  {
    id: 'o1-mini',
    name: 'o1-mini',
    displayName: 'o1-mini',
    provider: 'openai',
    contextLength: 128000,
    maxOutputTokens: 65536,
    pricing: {
      inputCostPer1kTokens: 0.003,
      outputCostPer1kTokens: 0.012,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 9,
      creativity: 6,
      speed: 6,
      multimodal: false,
      functionCalling: false,
      jsonMode: false
    },
    description: 'Faster reasoning model, 80% cheaper than o1-preview',
    releaseDate: '2024-09-12',
    deprecated: false,
    recommended: false,
    category: 'reasoning'
  },

  // Google Gemini Models
  {
    id: 'gemini-2.0-flash-exp',
    name: 'gemini-2.0-flash-exp',
    displayName: 'Gemini 2.0 Flash',
    provider: 'google',
    contextLength: 1000000,
    maxOutputTokens: 8192,
    pricing: {
      inputCostPer1kTokens: 0,
      outputCostPer1kTokens: 0,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 9,
      creativity: 8,
      speed: 10,
      multimodal: true,
      functionCalling: true,
      jsonMode: true
    },
    description: 'Latest Gemini, free during preview with massive context window',
    releaseDate: '2024-12-11',
    deprecated: false,
    recommended: true,
    category: 'fast'
  },
  {
    id: 'gemini-1.5-pro',
    name: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    provider: 'google',
    contextLength: 2000000,
    maxOutputTokens: 8192,
    pricing: {
      inputCostPer1kTokens: 0.00125,
      outputCostPer1kTokens: 0.005,
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
    description: 'Massive 2M token context, best for very long transcripts',
    releaseDate: '2024-05-14',
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
    description: 'Ultra-cheap and fast, 1M token context window',
    releaseDate: '2024-05-14',
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
  
  // On the client we can't check server secrets, so always show the models
  if (typeof window !== 'undefined') {
    return true;
  }
  
  // On the server, fall back to checking for the provider API key
  return !!process.env[provider.apiKeyEnv];
}

export function getAvailableModels(): ModelSpec[] {
  return MODEL_SPECS.filter(model => 
    !model.deprecated && 
    isProviderAvailable(model.provider)
  );
}
