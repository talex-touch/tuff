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
  allowImageAnalysis: boolean
  allowImageGeneration: boolean
  allowFileAnalysis: boolean
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
    allowImageAnalysis?: boolean
    allowImageGeneration?: boolean
    allowFileAnalysis?: boolean
    source?: string
  }>
  defaultModelId?: string
  defaultRouteComboId?: string
}

const AUTO_MODEL: PilotRuntimeModelOption = {
  key: 'quota-auto',
  name: 'Auto',
  description: '根据路由策略自动选择模型',
  icon: { type: 'class', value: 'i-carbon-flow-data' },
  thinkingSupported: true,
  thinkingDefaultEnabled: true,
  allowWebsearch: true,
  allowImageAnalysis: true,
  allowImageGeneration: true,
  allowFileAnalysis: true,
  source: 'auto',
}

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
    const allowFileAnalysis = toBoolean(row.allowFileAnalysis, toBoolean(row.allowImageAnalysis, true))
    list.push({
      key: id,
      name: normalizeText(row.name) || id,
      description: normalizeText(row.description) || undefined,
      icon: normalizeIcon(row.icon),
      thinkingSupported: toBoolean(row.thinkingSupported, true),
      thinkingDefaultEnabled: toBoolean(row.thinkingDefaultEnabled, true),
      allowWebsearch: toBoolean(row.allowWebsearch, true),
      // 兼容历史字段：运行时对外统一为“分析文件”能力。
      allowImageAnalysis: allowFileAnalysis,
      allowImageGeneration: toBoolean(row.allowImageGeneration, true),
      allowFileAnalysis,
      source: normalizeText(row.source) || 'runtime',
    })
  }

  return Array.from(new Map(list.map(item => [item.key, item])).values())
}

function mergeWithAutoModel(runtimeModels: PilotRuntimeModelOption[]): PilotRuntimeModelOption[] {
  const mergedMap = new Map<string, PilotRuntimeModelOption>()
  mergedMap.set(AUTO_MODEL.key, { ...AUTO_MODEL })

  for (const item of runtimeModels) {
    if (item.key === AUTO_MODEL.key) {
      mergedMap.set(AUTO_MODEL.key, {
        ...AUTO_MODEL,
        ...item,
        name: normalizeText(item.name) || AUTO_MODEL.name,
        description: normalizeText(item.description) || AUTO_MODEL.description,
        source: normalizeText(item.source) || AUTO_MODEL.source,
      })
      continue
    }
    mergedMap.set(item.key, item)
  }

  return Array.from(mergedMap.values())
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
      const models = mergeWithAutoModel(runtimeModels)
      state.value.models = models
      state.value.defaultModelId = ensureDefaultModelId(models, normalizeText(payload?.defaultModelId))
      state.value.defaultRouteComboId = normalizeText(payload?.defaultRouteComboId) || 'default-auto'
      state.value.loaded = true
    }
    catch {
      state.value.models = mergeWithAutoModel([])
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
    models: [{ ...AUTO_MODEL }],
  }))

  const models = computed(() => state.value.models.length > 0 ? state.value.models : [{ ...AUTO_MODEL }])
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
