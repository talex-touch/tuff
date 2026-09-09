export const VOICE_ASR_PROTOCOLS = ['bailian-paraformer', 'dashscope-qwen-asr-realtime', 'doubao'] as const

export type VoiceAsrProtocol = (typeof VOICE_ASR_PROTOCOLS)[number]

/** Models supported by the currently registered voice adapters. */
export const BAILIAN_ASR_REALTIME_MODELS = ['paraformer-realtime-v2', 'paraformer-realtime-8k-v2'] as const
export const DASHSCOPE_QWEN_ASR_REALTIME_MODELS = ['qwen3-asr-flash-realtime'] as const

export const BAILIAN_ASR_FILE_MODELS = ['paraformer-v2'] as const
export const DASHSCOPE_QWEN_ASR_FILE_MODELS = [
  'qwen-audio-3.0-asr-flash-filetrans',
  'fun-asr-flash-2026-06-15',
] as const

/** Returns safe DashScope model recommendations for one voice capability. */
export function getVoiceCapabilityRecommendedModels(capabilityId: string, metadata: unknown): string[] {
  const record =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {}
  const voiceAsr = getVoiceAsrMetadata(record)
  const baseUrl = typeof record.baseUrl === 'string' ? record.baseUrl : ''
  const isBailian =
    voiceAsr?.protocol === 'bailian-paraformer' ||
    voiceAsr?.protocol === 'dashscope-qwen-asr-realtime' ||
    (!voiceAsr &&
      (record.channelType === 'bailian' ||
        /(?:^|:)\/\/[^/]*\.?(?:dashscope\.aliyuncs\.com|maas\.aliyuncs\.com)(?:\/|$)/i.test(baseUrl)))
  if (!isBailian) return []
  if (voiceAsr?.protocol === 'dashscope-qwen-asr-realtime') {
    return capabilityId === 'audio.asr'
      ? [...DASHSCOPE_QWEN_ASR_REALTIME_MODELS]
      : capabilityId === 'audio.stt'
        ? [...DASHSCOPE_QWEN_ASR_FILE_MODELS]
        : []
  }
  if (voiceAsr?.protocol === 'bailian-paraformer' || capabilityId === 'audio.stt') {
    return capabilityId === 'audio.asr' ? [...BAILIAN_ASR_REALTIME_MODELS] : [...BAILIAN_ASR_FILE_MODELS]
  }
  return capabilityId === 'audio.asr' ? [...BAILIAN_ASR_REALTIME_MODELS] : []
}

/** Safe, non-secret ASR protocol metadata owned by an Intelligence custom channel. */
export interface VoiceAsrMetadata {
  protocol: VoiceAsrProtocol
  /** Public Doubao resource identifier; Bailian derives workspace from Base URL. */
  resourceId?: string
}

const MAX_RESOURCE_ID_LENGTH = 256

function normalizeIdentifier(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized && normalized.length <= maxLength ? normalized : undefined
}

/** Normalizes one metadata.voiceAsr value without retaining unknown or incompatible fields. */
export function normalizeVoiceAsrMetadata(value: unknown): VoiceAsrMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.protocol === 'bailian-paraformer') return { protocol: record.protocol }
  if (record.protocol === 'dashscope-qwen-asr-realtime') return { protocol: record.protocol }
  if (record.protocol === 'doubao') {
    const resourceId = normalizeIdentifier(record.resourceId, MAX_RESOURCE_ID_LENGTH)
    return resourceId ? { protocol: record.protocol, resourceId } : undefined
  }
  return undefined
}

export const BAILIAN_PUBLIC_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
export const BAILIAN_PUBLIC_WEBSOCKET_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'

export interface BailianVoiceEndpoints {
  baseUrl: string
  websocketUrl: string
  workspaceId?: string
}

/** Resolves public or workspace-specific Bailian endpoints from one HTTP Base URL. */
export function resolveBailianVoiceEndpoints(value?: string): BailianVoiceEndpoints {
  const raw = value?.trim() || BAILIAN_PUBLIC_BASE_URL
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('BAILIAN_BASE_URL_INVALID')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('BAILIAN_BASE_URL_INVALID')
  }
  const host = parsed.hostname.toLowerCase()
  const publicHost = host === 'dashscope.aliyuncs.com'
  const workspaceMatch = host.match(/^([a-z0-9][a-z0-9-]{0,127})\.cn-beijing\.maas\.aliyuncs\.com$/)
  if (!publicHost && !workspaceMatch) throw new Error('BAILIAN_BASE_URL_INVALID')
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/compatible-mode/v1'
  if (pathname !== '/compatible-mode/v1') throw new Error('BAILIAN_BASE_URL_INVALID')
  const baseUrl = `${parsed.origin}${pathname}`
  if (publicHost) return { baseUrl, websocketUrl: BAILIAN_PUBLIC_WEBSOCKET_URL }
  const workspaceId = workspaceMatch![1]
  return {
    baseUrl,
    websocketUrl: `wss://${workspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference`,
    workspaceId,
  }
}

/** Reads normalized ASR metadata from an Intelligence provider metadata record. */
export function getVoiceAsrMetadata(metadata: unknown): VoiceAsrMetadata | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined
  return normalizeVoiceAsrMetadata((metadata as Record<string, unknown>).voiceAsr)
}
