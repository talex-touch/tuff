export type PilotCapabilityId = 'websearch' | 'file.analyze' | 'image.generate' | 'image.edit'
  | 'audio.tts' | 'audio.stt' | 'audio.transcribe' | 'video.generate'

export type PilotCapabilityGroup = 'retrieval' | 'image' | 'audio' | 'video'

export interface PilotCapabilityMeta {
  id: PilotCapabilityId
  label: string
  group: PilotCapabilityGroup
  experimental?: boolean
  dependency?: PilotCapabilityId | 'thinkingSupported' | 'builtinTools.websearch'
}

export interface PilotCapabilityLegacyFlags {
  allowWebsearch?: unknown
  allowImageGeneration?: unknown
  allowFileAnalysis?: unknown
  allowImageAnalysis?: unknown
}

export type PilotCapabilitySwitches = Record<PilotCapabilityId, boolean>

export interface PilotModelTemplatePreset {
  id: PilotModelTemplateId
  label: string
  description: string
  thinkingSupported: boolean
  thinkingDefaultEnabled: boolean
  capabilities: PilotCapabilitySwitches
}

export type PilotModelTemplateId = 'general-chat' | 'research' | 'multimodal-creator' | 'voice-assistant'

export const PILOT_CAPABILITY_GROUP_LABELS: Readonly<Record<PilotCapabilityGroup, string>> = {
  retrieval: '检索与文件',
  image: '图像',
  audio: '音频',
  video: '视频',
}

export const PILOT_CAPABILITY_META: ReadonlyArray<PilotCapabilityMeta> = [
  {
    id: 'websearch',
    label: '联网检索',
    group: 'retrieval',
    dependency: 'builtinTools.websearch',
  },
  {
    id: 'file.analyze',
    label: '文件分析',
    group: 'retrieval',
  },
  {
    id: 'image.generate',
    label: '图像生成',
    group: 'image',
  },
  {
    id: 'image.edit',
    label: '图像编辑',
    group: 'image',
  },
  {
    id: 'audio.tts',
    label: '文本转语音',
    group: 'audio',
  },
  {
    id: 'audio.stt',
    label: '语音转文本',
    group: 'audio',
  },
  {
    id: 'audio.transcribe',
    label: '音频转写',
    group: 'audio',
  },
  {
    id: 'video.generate',
    label: '视频生成',
    group: 'video',
    experimental: true,
  },
]

export const PILOT_CAPABILITY_IDS: ReadonlyArray<PilotCapabilityId> = PILOT_CAPABILITY_META.map(item => item.id)

export const PILOT_CAPABILITY_META_MAP: Readonly<Record<PilotCapabilityId, PilotCapabilityMeta>> = Object.freeze(
  PILOT_CAPABILITY_META.reduce((acc, item) => {
    acc[item.id] = item
    return acc
  }, {} as Record<PilotCapabilityId, PilotCapabilityMeta>),
)

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) {
    return fallback
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return fallback
}

export function createPilotDefaultCapabilities(enabled = true): PilotCapabilitySwitches {
  return PILOT_CAPABILITY_IDS.reduce((acc, id) => {
    acc[id] = enabled
    return acc
  }, {} as PilotCapabilitySwitches)
}

export function resolvePilotCapabilities(
  value: unknown,
  legacy?: PilotCapabilityLegacyFlags,
  fallback?: Partial<PilotCapabilitySwitches>,
): PilotCapabilitySwitches {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const defaultValues = {
    ...createPilotDefaultCapabilities(true),
    ...(fallback || {}),
  }

  const allowWebsearch = toBoolean(row.websearch, toBoolean(legacy?.allowWebsearch, defaultValues.websearch))
  const allowFileAnalysis = toBoolean(
    row['file.analyze'],
    toBoolean(legacy?.allowFileAnalysis, toBoolean(legacy?.allowImageAnalysis, defaultValues['file.analyze'])),
  )
  const allowImageGeneration = toBoolean(
    row['image.generate'],
    toBoolean(legacy?.allowImageGeneration, defaultValues['image.generate']),
  )

  return {
    'websearch': allowWebsearch,
    'file.analyze': allowFileAnalysis,
    'image.generate': allowImageGeneration,
    'image.edit': toBoolean(row['image.edit'], defaultValues['image.edit']),
    'audio.tts': toBoolean(row['audio.tts'], defaultValues['audio.tts']),
    'audio.stt': toBoolean(row['audio.stt'], defaultValues['audio.stt']),
    'audio.transcribe': toBoolean(row['audio.transcribe'], defaultValues['audio.transcribe']),
    'video.generate': toBoolean(row['video.generate'], defaultValues['video.generate']),
  }
}

function createTemplateCapabilities(enabledCapabilities: PilotCapabilityId[]): PilotCapabilitySwitches {
  const enabledSet = new Set<PilotCapabilityId>(enabledCapabilities)
  return PILOT_CAPABILITY_IDS.reduce((acc, id) => {
    acc[id] = enabledSet.has(id)
    return acc
  }, {} as PilotCapabilitySwitches)
}

export const PILOT_MODEL_TEMPLATE_PRESETS: ReadonlyArray<PilotModelTemplatePreset> = [
  {
    id: 'general-chat',
    label: '通用对话',
    description: '面向日常聊天与代码问答，默认开启思考与基础检索能力。',
    thinkingSupported: true,
    thinkingDefaultEnabled: true,
    capabilities: createTemplateCapabilities(['websearch', 'file.analyze']),
  },
  {
    id: 'research',
    label: '研究检索',
    description: '强调检索与文件分析，适合资料整理与信息归纳。',
    thinkingSupported: true,
    thinkingDefaultEnabled: true,
    capabilities: createTemplateCapabilities(['websearch', 'file.analyze']),
  },
  {
    id: 'multimodal-creator',
    label: '多模态创作',
    description: '覆盖图像与音频能力，适合内容生产与多模态任务。',
    thinkingSupported: true,
    thinkingDefaultEnabled: true,
    capabilities: createTemplateCapabilities([
      'websearch',
      'file.analyze',
      'image.generate',
      'image.edit',
      'audio.tts',
      'audio.stt',
      'audio.transcribe',
    ]),
  },
  {
    id: 'voice-assistant',
    label: '语音助手',
    description: '以语音交互为核心，保留检索与文件理解能力。',
    thinkingSupported: true,
    thinkingDefaultEnabled: true,
    capabilities: createTemplateCapabilities([
      'websearch',
      'file.analyze',
      'audio.tts',
      'audio.stt',
      'audio.transcribe',
    ]),
  },
]

export function getPilotModelTemplatePreset(templateId: string): PilotModelTemplatePreset | undefined {
  return PILOT_MODEL_TEMPLATE_PRESETS.find(item => item.id === templateId)
}

export function normalizeThinkingFlags(
  thinkingSupported: boolean,
  thinkingDefaultEnabled: boolean,
): { thinkingSupported: boolean, thinkingDefaultEnabled: boolean } {
  if (!thinkingSupported) {
    return {
      thinkingSupported: false,
      thinkingDefaultEnabled: false,
    }
  }
  return {
    thinkingSupported: true,
    thinkingDefaultEnabled,
  }
}

export function sanitizeBuiltinToolsByCapabilities<T extends string>(
  builtinTools: T[],
  capabilities: PilotCapabilitySwitches,
): T[] {
  if (capabilities.websearch !== false) {
    return builtinTools
  }
  return builtinTools.filter(item => item !== 'websearch')
}

export function isPilotRouteComboIdValid(routeComboId: string, routeComboIds: Iterable<string>): boolean {
  const normalized = normalizeText(routeComboId)
  if (!normalized) {
    return true
  }
  const idSet = routeComboIds instanceof Set ? routeComboIds : new Set(routeComboIds)
  return idSet.has(normalized)
}
