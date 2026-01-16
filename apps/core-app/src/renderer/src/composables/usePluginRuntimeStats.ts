import type { Ref } from 'vue'
import { computed, onBeforeUnmount, ref, shallowRef, unref, watch } from 'vue'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'

export interface PluginRuntimeStats {
  startedAt: number
  uptimeMs: number
  requestCount: number
  lastActiveAt: number
  workers: {
    threadCount: number
    uiProcessCount: number
    windowCount: number
    cachedViewCount: number
    divisionBoxViewCount: number
  }
  usage: {
    memoryBytes: number
    cpuPercent: number
  }
}

export interface PluginRuntimeHistoryPoint {
  at: number
  requestCount: number
  workerThreads: number
  uiProcesses: number
  memoryBytes: number
  cpuPercent: number
}

interface SharedRuntimeState {
  name: string
  refCount: number
  inFlight: boolean
  timerId: number | null
  stats: Ref<PluginRuntimeStats | null>
  history: Ref<PluginRuntimeHistoryPoint[]>
  lastUpdatedAt: Ref<number>
  error: Ref<string | null>
  start: () => void
  stop: () => void
}

const sharedStates = new Map<string, SharedRuntimeState>()

const DEFAULT_INTERVAL_MS = 1000
const DEFAULT_MAX_POINTS = 60

function pushHistory(
  history: PluginRuntimeHistoryPoint[],
  point: PluginRuntimeHistoryPoint,
  maxPoints: number,
): PluginRuntimeHistoryPoint[] {
  const next = history.length ? [...history, point] : [point]
  if (next.length <= maxPoints)
    return next
  return next.slice(next.length - maxPoints)
}

function ensureSharedState(
  name: string,
  options?: { intervalMs?: number, maxPoints?: number },
): SharedRuntimeState {
  const cached = sharedStates.get(name)
  if (cached)
    return cached

  const intervalMs = Math.max(250, options?.intervalMs ?? DEFAULT_INTERVAL_MS)
  const maxPoints = Math.max(10, options?.maxPoints ?? DEFAULT_MAX_POINTS)

  const state: SharedRuntimeState = {
    name,
    refCount: 0,
    inFlight: false,
    timerId: null,
    stats: ref<PluginRuntimeStats | null>(null),
    history: ref<PluginRuntimeHistoryPoint[]>([]),
    lastUpdatedAt: ref(0),
    error: ref<string | null>(null),
    start: () => {},
    stop: () => {},
  }

  async function tick(): Promise<void> {
    if (state.inFlight)
      return

    state.inFlight = true
    try {
      const res = await pluginSDK.getRuntimeStats(name)
      if (!res)
        return

      const now = Date.now()
      state.stats.value = res
      state.history.value = pushHistory(
        state.history.value,
        {
          at: now,
          requestCount: res.requestCount,
          workerThreads: res.workers.threadCount,
          uiProcesses: res.workers.uiProcessCount,
          memoryBytes: res.usage.memoryBytes,
          cpuPercent: res.usage.cpuPercent,
        },
        maxPoints,
      )
      state.lastUpdatedAt.value = now
      state.error.value = null
    }
    catch (error) {
      state.error.value = error instanceof Error ? error.message : String(error)
    }
    finally {
      state.inFlight = false
    }
  }

  function start(): void {
    if (state.timerId != null)
      return
    void tick()
    state.timerId = window.setInterval(() => {
      void tick()
    }, intervalMs)
  }

  function stop(): void {
    if (state.timerId == null)
      return
    window.clearInterval(state.timerId)
    state.timerId = null
  }

  sharedStates.set(name, state)
  state.start = start
  state.stop = stop

  return state
}

function acquire(
  name: string,
  options?: { intervalMs?: number, maxPoints?: number },
): SharedRuntimeState {
  const state = ensureSharedState(name, options)
  state.refCount += 1
  state.start()
  return state
}

function release(name: string): void {
  const state = sharedStates.get(name)
  if (!state)
    return

  state.refCount = Math.max(0, state.refCount - 1)
  if (state.refCount > 0)
    return

  state.stop()
  sharedStates.delete(name)
}

export function usePluginRuntimeStats(
  pluginName: string | Ref<string>,
  options?: { intervalMs?: number, maxPoints?: number },
) {
  const shared = shallowRef<SharedRuntimeState | null>(null)

  const nameRef = computed(() => {
    const name = typeof pluginName === 'string' ? pluginName : unref(pluginName)
    return name.trim()
  })

  watch(
    nameRef,
    (name, prev) => {
      if (prev)
        release(prev)
      if (!name) {
        shared.value = null
        return
      }
      shared.value = acquire(name, options)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    const name = nameRef.value
    if (name)
      release(name)
  })

  return {
    stats: computed(() => shared.value?.stats.value ?? null),
    history: computed(() => shared.value?.history.value ?? []),
    lastUpdatedAt: computed(() => shared.value?.lastUpdatedAt.value ?? 0),
    error: computed(() => shared.value?.error.value ?? null),
  }
}
