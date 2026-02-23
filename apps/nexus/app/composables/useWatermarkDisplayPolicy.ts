import { computed } from 'vue'

function toBooleanFlag(value: unknown): boolean {
  if (value === true)
    return true
  if (typeof value === 'number')
    return value === 1
  if (typeof value !== 'string')
    return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function useWatermarkDisplayPolicy() {
  const runtimeConfig = useRuntimeConfig()

  const watermarkEnabled = computed(() =>
    toBooleanFlag(runtimeConfig.public?.watermark?.enabled),
  )

  const hideInvisibleWatermark = computed(() => !watermarkEnabled.value)

  return {
    hideInvisibleWatermark,
    showInvisibleWatermark: watermarkEnabled,
  }
}
