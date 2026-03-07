import type { ProviderAdapter } from './engine'

class BaseProviderAdapter implements ProviderAdapter {
  constructor(
    public readonly id: string,
    public readonly provider: string,
    private readonly features: Set<string>,
  ) {}

  supports(feature: string): boolean {
    return this.features.has(feature)
  }
}

export class OpenAIProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super('openai', 'openai', new Set(['chat', 'stream', 'vision']))
  }
}

export class AnthropicProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super('anthropic', 'anthropic', new Set(['chat', 'stream', 'vision']))
  }
}

export class OpenAICompatibleProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super('openai-compatible', 'openai-compatible', new Set(['chat', 'stream']))
  }
}

export class LocalModelProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super('local', 'local', new Set(['chat']))
  }
}
