import type { Ref } from 'vue'

export type PilotRuntimeIconType = 'class' | 'url' | 'emoji' | 'file'

export interface PilotRuntimeIconConfig {
  type: PilotRuntimeIconType
  value: string
}

export interface PilotRuntimeModelOption {
  key: string
  name: string
  description?: string
  img?: string
  icon?: PilotRuntimeIconConfig
  thinkingSupported: boolean
  thinkingDefaultEnabled: boolean
  allowWebsearch: boolean
  source: string
}

interface RuntimeModelsState {
  loaded: boolean
  loading: boolean
  defaultModelId: string
  defaultRouteComboId: string
  models: PilotRuntimeModelOption[]
}

interface RuntimeModelsResponse {
  models?: Array<{
    id?: string
    name?: string
    description?: string
    icon?: {
      type?: string
      value?: string
    }
    thinkingSupported?: boolean
    thinkingDefaultEnabled?: boolean
    allowWebsearch?: boolean
    source?: string
  }>
  defaultModelId?: string
  defaultRouteComboId?: string
}

const FALLBACK_MODELS: PilotRuntimeModelOption[] = [
  {
    key: 'quota-auto',
    name: 'Quota Auto',
    icon: { type: 'class', value: 'i-carbon-flow-data' },
    thinkingSupported: true,
    thinkingDefaultEnabled: true,
    allowWebsearch: true,
    source: 'system',
  },
  {
    key: 'gpt-5.2',
    name: 'GPT 5.2',
    icon: { type: 'class', value: 'i-carbon-logo-openai' },
    thinkingSupported: true,
    thinkingDefaultEnabled: true,
    allowWebsearch: true,
    source: 'system',
  },
  {
    key: 'gpt-5.4',
    name: 'GPT 5.4',
    icon: { type: 'class', value: 'i-carbon-logo-openai' },
    thinkingSupported: true,
    thinkingDefaultEnabled: true,
    allowWebsearch: true,
    source: 'system',
  },
  {
    key: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    icon: { type: 'class', value: 'i-carbon-ai-status' },
    thinkingSupported: true,
    thinkingDefaultEnabled: true,
    allowWebsearch: true,
    source: 'system',
  },
  {
    key: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    icon: { type: 'class', value: 'i-carbon-ai-status-complete' },
    thinkingSupported: true,
    thinkingDefaultEnabled: true,
    allowWebsearch: true,
    source: 'system',
  },
  {
    key: 'claudecode-opus-4.6',
    name: 'ClaudeCode Opus 4.6',
    icon: { type: 'class', value: 'i-carbon-machine-learning-model' },
    thinkingSupported: true,
    thinkingDefaultEnabled: true,
    allowWebsearch: true,
    source: 'system',
  },
  {
    key: 'claudecode-sonnet-4.6',
    name: 'ClaudeCode Sonnet 4.6',
    icon: { type: 'class', value: 'i-carbon-machine-learning-model' },
    thinkingSupported: true,
    thinkingDefaultEnabled: true,
    allowWebsearch: true,
    source: 'system',
  },
]

let runtimeModelsInflight: Promise<void> | null = null

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  return fallback
}

function normalizeIcon(value: unknown): PilotRuntimeIconConfig | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const row = value as Record<string, unknown>
  const type = normalizeText(row.type).toLowerCase()
  const iconType: PilotRuntimeIconType = type === 'url' || type === 'emoji' || type === 'file'
    ? type
    : 'class'
  const iconValue = normalizeText(row.value)
  if (!iconValue) {
    return undefined
  }
  return {
    type: iconType,
    value: iconValue,
  }
}

function normalizeModelList(value: unknown): PilotRuntimeModelOption[] {
  if (!Array.isArray(value)) {
    return []
  }

  const list: PilotRuntimeModelOption[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const row = item as Record<string, unknown>
    const id = normalizeText(row.id)
    if (!id) {
      continue
    }
    list.push({
      key: id,
      name: normalizeText(row.name) || id,
      description: normalizeText(row.description) || undefined,
      icon: normalizeIcon(row.icon),
      thinkingSupported: toBoolean(row.thinkingSupported, true),
      thinkingDefaultEnabled: toBoolean(row.thinkingDefaultEnabled, true),
      allowWebsearch: toBoolean(row.allowWebsearch, true),
      source: normalizeText(row.source) || 'runtime',
    })
  }

  return Array.from(new Map(list.map(item => [item.key, item])).values())
}

function ensureDefaultModelId(models: PilotRuntimeModelOption[], preferred: string): string {
  const target = normalizeText(preferred)
  if (target && models.some(item => item.key === target)) {
    return target
  }
  return models[0]?.key || 'quota-auto'
}

async function loadRuntimeModels(state: Ref<RuntimeModelsState>, force: boolean): Promise<void> {
  if (state.value.loading || (state.value.loaded && !force)) {
    return
  }

  if (runtimeModelsInflight && !force) {
    await runtimeModelsInflight
    return
  }

  state.value.loading = true
  const task = (async () => {
    try {
      const payload = await $fetch<RuntimeModelsResponse>('/api/runtime/models')
      const runtimeModels = normalizeModelList(payload?.models)
      const models = runtimeModels.length > 0 ? runtimeModels : [...FALLBACK_MODELS]
      state.value.models = models
      state.value.defaultModelId = ensureDefaultModelId(models, normalizeText(payload?.defaultModelId))
      state.value.defaultRouteComboId = normalizeText(payload?.defaultRouteComboId) || 'default-auto'
      state.value.loaded = true
    }
    catch {
      if (state.value.models.length <= 0) {
        state.value.models = [...FALLBACK_MODELS]
      }
      state.value.defaultModelId = ensureDefaultModelId(state.value.models, state.value.defaultModelId)
      state.value.defaultRouteComboId = state.value.defaultRouteComboId || 'default-auto'
      state.value.loaded = true
    }
    finally {
      state.value.loading = false
    }
  })()

  runtimeModelsInflight = task
  await task
  runtimeModelsInflight = null
}

export function resolveRuntimeModelIconSource(model: PilotRuntimeModelOption): {
  type: 'image' | 'class' | 'emoji'
  value: string
} {
  if (model.img) {
    return {
      type: 'image',
      value: model.img,
    }
  }
  if (model.icon?.type === 'url' || model.icon?.type === 'file') {
    return {
      type: 'image',
      value: model.icon.value,
    }
  }
  if (model.icon?.type === 'emoji') {
    return {
      type: 'emoji',
      value: model.icon.value,
    }
  }
  return {
    type: 'class',
    value: model.icon?.value || 'i-carbon-machine-learning-model',
  }
}

export function usePilotRuntimeModels() {
  const state = useState<RuntimeModelsState>('pilot-runtime-models', () => ({
    loaded: false,
    loading: false,
    defaultModelId: 'quota-auto',
    defaultRouteComboId: 'default-auto',
    models: [...FALLBACK_MODELS],
  }))

  const models = computed(() => state.value.models.length > 0 ? state.value.models : FALLBACK_MODELS)
  const modelMap = computed(() => new Map(models.value.map(item => [item.key, item])))
  const defaultModelId = computed(() => ensureDefaultModelId(models.value, state.value.defaultModelId))

  async function ensureLoaded(force = false): Promise<void> {
    await loadRuntimeModels(state, force)
  }

  function findModel(modelId: unknown): PilotRuntimeModelOption | undefined {
    const id = normalizeText(modelId)
    if (!id) {
      return undefined
    }
    return modelMap.value.get(id)
  }

  return {
    state: readonly(state),
    models,
    defaultModelId,
    defaultRouteComboId: computed(() => state.value.defaultRouteComboId || 'default-auto'),
    ensureLoaded,
    findModel,
  }
}
