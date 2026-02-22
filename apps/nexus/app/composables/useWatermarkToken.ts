import { computed, onBeforeUnmount, onMounted } from 'vue'
import { hashString } from '~/utils/watermark'
import { useWatermarkRisk } from './useWatermarkRisk'

const ROTATE_INTERVAL_MS = 5 * 60 * 1000

interface WatermarkTokenResponse {
  wm_token: string
  expires_at: number
}

interface WatermarkTokenState {
  token: string | null
  expiresAt: number | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  sessionId: string | null
  shotId: string | null
  started: boolean
  failureCount: number
}

export function useWatermarkToken() {
  const state = useState<WatermarkTokenState>('wm-token', () => ({
    token: null,
    expiresAt: null,
    status: 'idle',
    error: null,
    sessionId: null,
    shotId: null,
    started: false,
    failureCount: 0,
  }))

  const { user, status: authStatus } = useAuthUser()
  const { deviceId } = useDeviceIdentity()
  const { triggerRisk } = useWatermarkRisk()

  let rotateTimer: ReturnType<typeof setInterval> | null = null

  function ensureSession() {
    if (!import.meta.client)
      return
    if (!state.value.sessionId)
      state.value.sessionId = crypto.randomUUID()
  }

  function createShotId() {
    if (!import.meta.client)
      return
    state.value.shotId = crypto.randomUUID()
  }

  async function issueToken(reason: string) {
    if (!import.meta.client)
      return
    if (!deviceId.value)
      return

    ensureSession()
    createShotId()
    state.value.status = 'loading'
    state.value.error = null

    try {
      const response = await $fetch<WatermarkTokenResponse>('/api/watermark/issue', {
        method: 'POST',
        body: {
          session_id: state.value.sessionId,
          shot_id: state.value.shotId,
          device_id: deviceId.value,
          user_id: user.value?.id ?? null,
          anonymous: authStatus.value !== 'authenticated',
          reason,
        },
      })
      state.value.token = response?.wm_token || null
      state.value.expiresAt = response?.expires_at ?? null
      state.value.status = state.value.token ? 'ready' : 'error'
      state.value.failureCount = 0
      if (state.value.expiresAt && state.value.expiresAt <= Date.now())
        triggerRisk('WM_EXPIRED', 'token_expired')
      if (!state.value.token) {
        state.value.error = 'wm_token_missing'
        triggerRisk('WM_MISSING', 'token_missing')
      }
    }
    catch (error: any) {
      state.value.status = 'error'
      state.value.error = error?.data?.statusMessage || error?.message || 'token_issue_failed'
      state.value.failureCount += 1
      if (state.value.failureCount >= 2)
        triggerRisk('WM_MISSING', 'token_issue_failed')
    }
  }

  function start() {
    if (!import.meta.client)
      return
    if (state.value.started)
      return
    state.value.started = true
    void issueToken('init')
    rotateTimer = setInterval(() => {
      void issueToken('rotate')
    }, ROTATE_INTERVAL_MS)
  }

  function stop() {
    if (rotateTimer) {
      clearInterval(rotateTimer)
      rotateTimer = null
    }
    state.value.started = false
  }

  onMounted(start)
  onBeforeUnmount(stop)

  const tokenSeed = computed(() => (state.value.token ? hashString(state.value.token) : 0))
  const tokenDigest = computed(() => {
    if (!state.value.token)
      return ''
    return Math.abs(hashString(state.value.token)).toString(36).slice(0, 6)
  })

  return {
    token: computed(() => state.value.token),
    expiresAt: computed(() => state.value.expiresAt),
    status: computed(() => state.value.status),
    tokenSeed,
    tokenDigest,
    refresh: () => issueToken('manual'),
    start,
  }
}
