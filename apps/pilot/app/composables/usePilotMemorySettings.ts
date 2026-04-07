import { endHttp } from '~/composables/api/axios'

interface PilotMemoryPolicy {
  enabledByDefault: boolean
  allowUserDisable: boolean
  allowUserClear: boolean
}

export interface PilotMemoryFactItem {
  key: string
  value: string
  createdAt: string
  updatedAt: string
}

interface PilotMemorySettingsState {
  loaded: boolean
  loading: boolean
  submitting: boolean
  enabled: boolean
  policy: PilotMemoryPolicy
  factsLoaded: boolean
  factsLoading: boolean
  facts: PilotMemoryFactItem[]
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  return fallback
}

function parseMemoryPayload(payload: any): {
  enabled: boolean
  policy: PilotMemoryPolicy
} {
  const data = payload?.data && typeof payload.data === 'object'
    ? payload.data
    : payload
  const policySource = data?.memoryPolicy && typeof data.memoryPolicy === 'object'
    ? data.memoryPolicy
    : {}
  const policy: PilotMemoryPolicy = {
    enabledByDefault: normalizeBoolean(policySource.enabledByDefault, true),
    allowUserDisable: normalizeBoolean(policySource.allowUserDisable, true),
    allowUserClear: normalizeBoolean(policySource.allowUserClear, true),
  }
  const enabled = typeof data?.memoryEnabled === 'boolean'
    ? data.memoryEnabled
    : policy.enabledByDefault
  return {
    enabled,
    policy,
  }
}

function parseMemoryFactsPayload(payload: any): PilotMemoryFactItem[] {
  const data = payload?.data && typeof payload.data === 'object'
    ? payload.data
    : payload
  const items = Array.isArray(data?.items) ? data.items : []
  return items.map((item: any) => ({
    key: String(item?.key || '').trim(),
    value: String(item?.value || '').trim(),
    createdAt: String(item?.createdAt || '').trim(),
    updatedAt: String(item?.updatedAt || '').trim(),
  })).filter((item: PilotMemoryFactItem) => item.value)
}

function resolveErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error || '')
  }
  const row = error as Record<string, any>
  const message = row.message
    || row.response?.data?.message
    || row.data?.message
  return typeof message === 'string' ? message : ''
}

export function usePilotMemorySettings() {
  const state = useState<PilotMemorySettingsState>('pilot-memory-settings', () => ({
    loaded: false,
    loading: false,
    submitting: false,
    enabled: true,
    policy: {
      enabledByDefault: true,
      allowUserDisable: true,
      allowUserClear: true,
    },
    factsLoaded: false,
    factsLoading: false,
    facts: [],
  }))

  function applyPayload(payload: any) {
    const next = parseMemoryPayload(payload)
    state.value.enabled = next.enabled
    state.value.policy = next.policy
    state.value.loaded = true
  }

  function applyFactsPayload(payload: any) {
    state.value.facts = parseMemoryFactsPayload(payload)
    state.value.factsLoaded = true
  }

  async function loadMemorySettings(force = false): Promise<void> {
    if (state.value.loading || (state.value.loaded && !force)) {
      return
    }
    state.value.loading = true
    try {
      const res: any = await endHttp.get('v1/chat/memory/settings')
      applyPayload(res)
    }
    catch {
      state.value.enabled = state.value.policy.enabledByDefault
      state.value.loaded = true
    }
    finally {
      state.value.loading = false
    }
  }

  async function loadMemoryFacts(force = false): Promise<void> {
    if (state.value.factsLoading || (state.value.factsLoaded && !force)) {
      return
    }

    state.value.factsLoading = true
    try {
      const res: any = await endHttp.get('v1/chat/memory/facts')
      applyFactsPayload(res)
    }
    catch {
      state.value.facts = []
      state.value.factsLoaded = true
    }
    finally {
      state.value.factsLoading = false
    }
  }

  async function setMemoryEnabled(
    nextEnabled: boolean,
    options: {
      purgeOnDisable?: boolean
      toast?: boolean
    } = {},
  ): Promise<boolean> {
    if (state.value.submitting || state.value.loading) {
      return false
    }

    const toast = options.toast !== false
    if (!state.value.policy.allowUserDisable) {
      state.value.enabled = state.value.policy.enabledByDefault
      if (toast) {
        ElMessage.warning('当前策略不允许切换记忆系统。')
      }
      return false
    }

    state.value.submitting = true
    try {
      if (!nextEnabled && options.purgeOnDisable !== false) {
        const clearRes: any = await endHttp.post('v1/chat/memory/clear', {
          scope: 'all',
        })
        if (Number(clearRes?.code || 200) !== 200) {
          throw new Error(String(clearRes?.message || '清空记忆失败'))
        }
      }

      const res: any = await endHttp.post('v1/chat/memory/settings', {
        memoryEnabled: nextEnabled,
      })
      if (Number(res?.code || 200) !== 200) {
        throw new Error(String(res?.message || '设置记忆开关失败'))
      }
      applyPayload(res)
      if (nextEnabled) {
        await loadMemoryFacts(true)
      }
      else {
        state.value.facts = []
        state.value.factsLoaded = true
      }

      if (toast) {
        ElMessage.success(nextEnabled ? '已开启上下文记忆' : '已关闭记忆并清空已存储内容')
      }
      return true
    }
    catch (error) {
      await Promise.all([
        loadMemorySettings(true),
        loadMemoryFacts(true),
      ])
      if (toast) {
        ElMessage.error(resolveErrorMessage(error) || '更新记忆设置失败')
      }
      return false
    }
    finally {
      state.value.submitting = false
    }
  }

  const memoryEnabled = computed(() => state.value.enabled)
  const memoryPolicy = computed(() => state.value.policy)
  const loading = computed(() => state.value.loading)
  const submitting = computed(() => state.value.submitting)
  const facts = computed(() => state.value.facts)
  const factsLoading = computed(() => state.value.factsLoading)
  const toggleDisabled = computed(() => (
    state.value.loading || state.value.submitting || !state.value.policy.allowUserDisable
  ))
  const toggleDisabledTip = computed(() => {
    if (state.value.loading || state.value.submitting) {
      return '记忆系统状态同步中，请稍后再试。'
    }
    if (!state.value.policy.allowUserDisable) {
      return '当前策略不允许用户切换记忆系统。'
    }
    return '记忆系统暂不可用。'
  })

  return {
    state: readonly(state),
    memoryEnabled,
    memoryPolicy,
    memoryLoading: loading,
    memorySubmitting: submitting,
    memoryFacts: facts,
    memoryFactsLoading: factsLoading,
    memoryToggleDisabled: toggleDisabled,
    memoryToggleDisabledTip: toggleDisabledTip,
    loadMemorySettings,
    loadMemoryFacts,
    setMemoryEnabled,
  }
}
