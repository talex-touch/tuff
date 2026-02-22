import { onMounted, watch } from 'vue'
import { createSeededRng } from '~/utils/watermark'
import { useWatermarkToken } from './useWatermarkToken'

const VARIABLE_PREFIX = '--wm'

function applyVariables(vars: Record<string, string>) {
  if (!import.meta.client)
    return
  const root = document.documentElement
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(`${VARIABLE_PREFIX}-${key}`, value)
  })
}

function buildFingerprint(seed: number): Record<string, string> {
  if (!seed)
    return {}
  const rng = createSeededRng(seed)
  const jitter = (range: number, unit = 'px') =>
    `${Math.round((rng() * 2 - 1) * range * 10) / 10}${unit}`
  const letter = (range: number) =>
    `${Math.round((rng() * 2 - 1) * range * 100) / 100}px`

  return {
    'jitter-x1': jitter(2),
    'jitter-x2': jitter(1.5),
    'jitter-y1': jitter(1.5),
    'jitter-y2': jitter(1),
    'letter-space-1': letter(0.4),
    'letter-space-2': letter(0.3),
  }
}

export function useWatermarkFingerprint() {
  const { tokenSeed } = useWatermarkToken()

  function refresh(seed: number) {
    applyVariables(buildFingerprint(seed))
  }

  watch(tokenSeed, (value) => {
    if (!value)
      return
    refresh(value)
  }, { immediate: true })

  onMounted(() => {
    if (tokenSeed.value)
      refresh(tokenSeed.value)
  })
}
