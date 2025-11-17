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
  // OpenAI Models (Only models that work with current content generation)
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
    id: 'o1-preview',
    name: 'o1-preview',
    displayName: 'o1-preview',
    provider: 'openai',
    contextLength: 128000,
    maxOutputTokens: 32768,
    pricing: {
      inputCostPer1kTokens: 0.015,
      outputCostPer1kTokens: 0.06,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 10,
      creativity: 7,
      speed: 4,
      multimodal: false,
      functionCalling: false,
      jsonMode: false
    },
    description: 'Advanced reasoning model, best for complex analysis and deep insights',
    releaseDate: '2024-09-12',
    deprecated: false,
    recommended: false,
    category: 'reasoning'
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
    description: 'Previous generation flagship, reliable but more expensive than GPT-4o',
    releaseDate: '2024-04-09',
    deprecated: false,
    recommended: false,
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
    description: 'Original GPT-4, slower and more expensive than newer models',
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
    description: 'Legacy model, use GPT-4o Mini for better quality at similar cost',
    releaseDate: '2023-03-01',
    deprecated: false,
    recommended: false,
    category: 'fast'
  },

  // Anthropic Claude Models
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
    description: 'Top-tier reasoning and creativity, excellent for nuanced content',
    releaseDate: '2024-10-22',
    deprecated: false,
    recommended: true,
    category: 'reasoning'
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    contextLength: 200000,
    maxOutputTokens: 8192,
    pricing: {
      inputCostPer1kTokens: 0.001,
      outputCostPer1kTokens: 0.005,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 8,
      creativity: 7,
      speed: 10,
      multimodal: false,
      functionCalling: true,
      jsonMode: false
    },
    description: 'Fast and cost-effective Claude model, great for bulk content',
    releaseDate: '2024-10-22',
    deprecated: false,
    recommended: true,
    category: 'fast'
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    provider: 'anthropic',
    contextLength: 200000,
    maxOutputTokens: 4096,
    pricing: {
      inputCostPer1kTokens: 0.015,
      outputCostPer1kTokens: 0.075,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 10,
      creativity: 10,
      speed: 4,
      multimodal: true,
      functionCalling: true,
      jsonMode: false
    },
    description: 'Most powerful Claude model, best for complex creative work',
    releaseDate: '2024-02-29',
    deprecated: false,
    recommended: false,
    category: 'creative'
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
  },

  // Perplexity Models
  {
    id: 'llama-3.1-sonar-huge-128k-online',
    name: 'llama-3.1-sonar-huge-128k-online',
    displayName: 'Sonar Huge (Online)',
    provider: 'perplexity',
    contextLength: 128000,
    maxOutputTokens: 4096,
    pricing: {
      inputCostPer1kTokens: 0.005,
      outputCostPer1kTokens: 0.005,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 8,
      creativity: 7,
      speed: 6,
      multimodal: false,
      functionCalling: true,
      jsonMode: true
    },
    description: 'Web-connected model with real-time search capabilities',
    releaseDate: '2024-08-01',
    deprecated: false,
    recommended: true,
    category: 'general'
  },
  {
    id: 'llama-3.1-sonar-large-128k-online',
    name: 'llama-3.1-sonar-large-128k-online',
    displayName: 'Sonar Large (Online)',
    provider: 'perplexity',
    contextLength: 128000,
    maxOutputTokens: 4096,
    pricing: {
      inputCostPer1kTokens: 0.001,
      outputCostPer1kTokens: 0.001,
      currency: 'USD'
    },
    capabilities: {
      reasoning: 7,
      creativity: 7,
      speed: 8,
      multimodal: false,
      functionCalling: true,
      jsonMode: true
    },
    description: 'Faster web-connected model, good balance of speed and quality',
    releaseDate: '2024-08-01',
    deprecated: false,
    recommended: true,
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
