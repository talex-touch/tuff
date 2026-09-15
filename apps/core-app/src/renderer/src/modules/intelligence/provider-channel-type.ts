import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'

export const ProviderChannelType = {
  OPENAI: IntelligenceProviderType.OPENAI,
  ANTHROPIC: IntelligenceProviderType.ANTHROPIC,
  DEEPSEEK: IntelligenceProviderType.DEEPSEEK,
  SILICONFLOW: IntelligenceProviderType.SILICONFLOW,
  LOCAL: IntelligenceProviderType.LOCAL,
  COMPATIBLE: 'compatible',
  BAILIAN: 'bailian',
  VOLCENGINE: 'volcengine',
  /**
   * Speech recognition that runs on this machine. It shares no endpoint and no credential with
   * any of the above, which is why it is its own channel type rather than a flavour of one.
   */
  ON_DEVICE: 'on-device'
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
  [ProviderChannelType.VOLCENGINE]: true,
  [ProviderChannelType.ON_DEVICE]: true
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

  const voiceAsr = provider.metadata?.voiceAsr
  const voiceProtocol =
    voiceAsr && typeof voiceAsr === 'object' && !Array.isArray(voiceAsr)
      ? String((voiceAsr as Record<string, unknown>).protocol)
      : undefined

  /*
   * Recognised ahead of the endpoint heuristics below, and regardless of provider type: an
   * on-device channel has no host to inspect, so a protocol is the only thing that can
   * identify it.
   */
  if (voiceProtocol === 'local-offline') {
    return ProviderChannelType.ON_DEVICE
  }

  if (provider.type === IntelligenceProviderType.CUSTOM) {
    if (
      voiceAsr &&
      typeof voiceAsr === 'object' &&
      !Array.isArray(voiceAsr) &&
      ['bailian-paraformer', 'dashscope-qwen-asr-realtime'].includes(voiceProtocol ?? '')
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
    /*
     * `local` is the runtime's word for "executes here, needs no key", and that is exactly what
     * this channel is. Routing already exempts a local provider from the API-key requirement, so
     * reusing the type keeps that rule in one place instead of teaching every caller a new one.
     * The channel declares only audio capabilities, so the LLM paths that also read this type
     * never see it.
     */
    case ProviderChannelType.ON_DEVICE:
      return IntelligenceProviderType.LOCAL
    default:
      return channelType
  }
}
