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
  baseUrl?: string
  metadata?: Record<string, unknown>
}): ProviderChannelKind {
  const selected = provider.metadata?.channelType
  if (selected !== undefined) {
    return normalizeProviderChannelType(selected)
  }

  if (provider.type === IntelligenceProviderType.CUSTOM) {
    const voiceAsr = provider.metadata?.voiceAsr
    if (
      voiceAsr &&
      typeof voiceAsr === 'object' &&
      !Array.isArray(voiceAsr) &&
      ['bailian-paraformer', 'dashscope-qwen-asr-realtime'].includes(
        String((voiceAsr as Record<string, unknown>).protocol)
      )
    ) {
      return ProviderChannelType.BAILIAN
    }

    try {
      const host = new URL(provider.baseUrl || '').hostname.toLowerCase()
      if (host === 'dashscope.aliyuncs.com' || host.endsWith('.maas.aliyuncs.com')) {
        return ProviderChannelType.BAILIAN
      }
    } catch {
      // An incomplete custom URL remains a compatible channel until it is saved.
    }

    return ProviderChannelType.COMPATIBLE
  }

  return normalizeProviderChannelType(provider.type)
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
