import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { computed, onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import { appSetting } from '~/modules/channel/storage'

const batteryStatus = reactive<{ onBattery: boolean; percent: number | null }>({
  onBattery: false,
  percent: null
})

let listenerReferenceCount = 0
let unregisterChannel: (() => void) | undefined
let listenerRegistered = false
const transport = useTuffTransport()
const batteryStatusEvent = AppEvents.power.batteryStatus

function setupListener() {
  if (listenerReferenceCount === 0) {
    unregisterChannel = transport.on(batteryStatusEvent, (payload) => {
      if (!payload) return

      if (typeof payload.onBattery === 'boolean') {
        batteryStatus.onBattery = payload.onBattery
      }

      if (payload.percent === null || typeof payload.percent === 'number') {
        batteryStatus.percent = payload.percent ?? null
      }
    })
  }
  listenerReferenceCount++
}

function teardownListener() {
  listenerReferenceCount--
  if (listenerReferenceCount <= 0) {
    listenerReferenceCount = 0
    unregisterChannel?.()
    unregisterChannel = undefined
  }
}

export function registerBatteryStatusListener(): void {
  if (listenerRegistered) return
  listenerRegistered = true
  setupListener()
}

export function useBatteryOptimizer() {
  onMounted(setupListener)
  onBeforeUnmount(teardownListener)

  const lowBatteryMode = computed(() => {
    const autoDisable = appSetting.animation?.autoDisableOnLowBattery !== false
    const threshold =
      typeof appSetting.animation?.lowBatteryThreshold === 'number'
        ? appSetting.animation.lowBatteryThreshold
        : 20

    if (!autoDisable) return false
    // If not on battery, we are plugged in (or unknown), so performance should be fine
    if (!batteryStatus.onBattery) return false
    // If we don't know the percent, assume it's fine unless we want to be conservative
    if (batteryStatus.percent === null) return false

    return batteryStatus.percent <= threshold
  })

  return {
    batteryStatus,
    lowBatteryMode
  }
}

/**
 * Should be called once in the application root (App.vue)
 * Handles global CSS attribute toggling for low battery mode
 */
export function useGlobalBatteryOptimizer() {
  const { lowBatteryMode } = useBatteryOptimizer()

  watch(
    lowBatteryMode,
    (enabled) => {
      if (enabled) {
        document.documentElement.setAttribute('data-low-battery-motion', '1')
      } else {
        document.documentElement.removeAttribute('data-low-battery-motion')
      }
    },
    { immediate: true }
  )

  return { lowBatteryMode }
}
