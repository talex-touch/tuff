import { computed } from 'vue'

export type WatermarkRiskCode = 'WM_MISSING' | 'WM_TAMPERED' | 'WM_EXPIRED' | 'WM_SERVER_RISK'

interface WatermarkRiskState {
  active: boolean
  code: WatermarkRiskCode | ''
  detail: string | null
  triggeredAt: number
  tamperCount: number
  lastTriggerAt: number
}

const TRIGGER_COOLDOWN_MS = 4000
const TAMPER_THRESHOLD = 2

export function useWatermarkRisk() {
  const state = useState<WatermarkRiskState>('wm-risk-state', () => ({
    active: false,
    code: '',
    detail: null,
    triggeredAt: 0,
    tamperCount: 0,
    lastTriggerAt: 0,
  }))

  function triggerRisk(code: WatermarkRiskCode, detail?: string) {
    const now = Date.now()
    if (now - state.value.lastTriggerAt < TRIGGER_COOLDOWN_MS)
      return
    state.value.lastTriggerAt = now
    state.value.active = true
    state.value.code = code
    state.value.detail = detail ?? null
    state.value.triggeredAt = now
  }

  function reportTamper(source: string) {
    state.value.tamperCount += 1
    if (state.value.tamperCount >= TAMPER_THRESHOLD)
      triggerRisk('WM_TAMPERED', source)
  }

  function clearRisk() {
    state.value.active = false
    state.value.code = ''
    state.value.detail = null
    state.value.tamperCount = 0
  }

  return {
    risk: computed(() => state.value),
    triggerRisk,
    reportTamper,
    clearRisk,
  }
}
