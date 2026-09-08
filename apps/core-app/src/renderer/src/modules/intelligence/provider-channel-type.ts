import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'

export const ProviderChannelType = {
  OPENAI: IntelligenceProviderType.OPENAI,
  ANTHROPIC: IntelligenceProviderType.ANTHROPIC,
  DEEPSEEK: IntelligenceProviderType.DEEPSEEK,
  SILICONFLOW: IntelligenceProviderType.SILICONFLOW,
  LOCAL: IntelligenceProviderType.LOCAL,
  COMPATIBLE: 'compatible',
  BAILIAN: 'bailian',
  VOLCENGINE: 'volcengine'
} as const

export type ProviderChannelKind = (typeof ProviderChannelType)[keyof typeof ProviderChannelType]

const PROVIDER_CHANNEL_TYPE_VALUES: Record<ProviderChannelKind, true> = {
  [ProviderChannelType.OPENAI]: true,
  [ProviderChannelType.ANTHROPIC]: true,
  [ProviderChannelType.DEEPSEEK]: true,
  [ProviderChannelType.SILICONFLOW]: true,
  [ProviderChannelType.LOCAL]: true,
  [ProviderChannelType.COMPATIBLE]: true,
  [ProviderChannelType.BAILIAN]: true,
  [ProviderChannelType.VOLCENGINE]: true
}

export const PROVIDER_CHANNEL_TYPE_OPTIONS = Object.values(ProviderChannelType)

export function normalizeProviderChannelType(value: unknown): ProviderChannelKind {
  if (typeof value === 'string' && Object.hasOwn(PROVIDER_CHANNEL_TYPE_VALUES, value)) {
    return value as ProviderChannelKind
  }

  return ProviderChannelType.COMPATIBLE
}

export function getProviderChannelType(provider: {
  type: string
  metadata?: Record<string, unknown>
}): ProviderChannelKind {
  const selected = provider.metadata?.channelType
  if (selected !== undefined) {
    return normalizeProviderChannelType(selected)
  }

  return provider.type === IntelligenceProviderType.CUSTOM
    ? ProviderChannelType.COMPATIBLE
    : normalizeProviderChannelType(provider.type)
}

export function getRuntimeProviderType(channelType: ProviderChannelKind): IntelligenceProviderType {
  switch (channelType) {
    case ProviderChannelType.COMPATIBLE:
    case ProviderChannelType.BAILIAN:
    case ProviderChannelType.VOLCENGINE:
      return IntelligenceProviderType.CUSTOM
    default:
      return channelType
  }
}
