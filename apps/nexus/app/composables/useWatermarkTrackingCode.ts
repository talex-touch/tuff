import { computed, onBeforeUnmount, onMounted } from 'vue'

interface TrackingCodeResponse {
  code: string
  userId: string | null
  deviceId: string
}

interface TrackingState {
  code: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  started: boolean
}

export function useWatermarkTrackingCode() {
  const state = useState<TrackingState>('wm-tracking-code', () => ({
    code: null,
    status: 'idle',
    error: null,
    started: false,
  }))

  const { deviceId } = useDeviceIdentity()

  let refreshTimer: ReturnType<typeof setInterval> | null = null

  async function fetchCode() {
    if (!import.meta.client)
      return
    if (!deviceId.value)
      return
    state.value.status = 'loading'
    state.value.error = null
    try {
      const response = await $fetch<TrackingCodeResponse>('/api/watermark/tracking', {
        method: 'POST',
        body: { device_id: deviceId.value },
      })
      state.value.code = response.code
      state.value.status = 'ready'
    }
    catch (error: any) {
      state.value.status = 'error'
      state.value.error = error?.data?.statusMessage || error?.message || 'tracking_code_failed'
    }
  }

  function start() {
    if (!import.meta.client)
      return
    if (state.value.started)
      return
    state.value.started = true
    void fetchCode()
    refreshTimer = setInterval(fetchCode, 10 * 60 * 1000)
  }

  function stop() {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
    state.value.started = false
  }

  onMounted(start)
  onBeforeUnmount(stop)

  return {
    code: computed(() => state.value.code),
    status: computed(() => state.value.status),
    error: computed(() => state.value.error),
    refresh: fetchCode,
  }
}
