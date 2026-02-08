import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import type { BatteryStatusPayload, FileIndexBatteryStatus } from '../../transport/events'
import { AppEvents } from '../../transport/events'
import { createPluginTuffTransport } from '../../transport/sdk/plugin-transport'
import { ensureRendererChannel } from './channel'

const DEFAULT_LOW_POWER_THRESHOLD = 20

function normalizeThreshold(threshold?: number): number {
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
    return DEFAULT_LOW_POWER_THRESHOLD
  }

  const normalized = Math.floor(threshold)
  if (normalized <= 0) return 1
  if (normalized > 100) return 100
  return normalized
}

function normalizePercent(percent: unknown): number | null {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    return null
  }

  if (percent < 0) return 0
  if (percent > 100) return 100
  return percent
}

function toStatusFromBattery(
  battery: FileIndexBatteryStatus | null | undefined,
  threshold: number
): LowPowerStatus {
  const percent = normalizePercent(battery?.level)
  const onBattery = percent !== null ? battery?.charging === false : false

  return {
    lowPower: onBattery && percent !== null && percent <= threshold,
    onBattery,
    percent,
    threshold
  }
}

function toStatusFromBroadcast(
  payload: BatteryStatusPayload | undefined,
  threshold: number
): LowPowerStatus | null {
  if (typeof payload?.onBattery !== 'boolean') {
    return null
  }

  const percent = normalizePercent(payload.percent)
  const onBattery = payload.onBattery

  return {
    lowPower: onBattery && percent !== null && percent <= threshold,
    onBattery,
    percent,
    threshold
  }
}

function toSignature(status: LowPowerStatus): string {
  return [status.lowPower, status.onBattery, status.percent ?? 'null', status.threshold].join(':')
}

export interface LowPowerStatus {
  lowPower: boolean
  onBattery: boolean
  percent: number | null
  threshold: number
}

export interface PowerSDK {
  getLowPowerStatus: (options?: { threshold?: number }) => Promise<LowPowerStatus>
  isLowPower: (options?: { threshold?: number }) => Promise<boolean>
  onLowPowerChanged: (
    callback: (status: LowPowerStatus) => void,
    options?: { threshold?: number, emitImmediately?: boolean }
  ) => () => void
}

export function createPowerSDK(channel: ITouchClientChannel): PowerSDK {
  const transport = createPluginTuffTransport(channel)

  const getStatus = async (options: { threshold?: number } = {}): Promise<LowPowerStatus> => {
    const threshold = normalizeThreshold(options.threshold)
    try {
      const battery = await transport.send(AppEvents.fileIndex.batteryLevel)
      return toStatusFromBattery(battery, threshold)
    }
    catch {
      return {
        lowPower: false,
        onBattery: false,
        percent: null,
        threshold
      }
    }
  }

  return {
    getLowPowerStatus: getStatus,

    async isLowPower(options: { threshold?: number } = {}): Promise<boolean> {
      const status = await getStatus(options)
      return status.lowPower
    },

    onLowPowerChanged(
      callback: (status: LowPowerStatus) => void,
      options: { threshold?: number, emitImmediately?: boolean } = {}
    ): () => void {
      const threshold = normalizeThreshold(options.threshold)
      let disposed = false
      let lastSignature = ''

      const emit = async (status: LowPowerStatus, force = false) => {
        if (disposed) return
        const signature = toSignature(status)
        if (!force && signature === lastSignature) return
        lastSignature = signature
        callback(status)
      }

      const dispose = transport.on(AppEvents.power.batteryStatus, async (payload) => {
        const fromBroadcast = toStatusFromBroadcast(payload, threshold)
        if (fromBroadcast) {
          await emit(fromBroadcast)
          return
        }

        const fromQuery = await getStatus({ threshold })
        await emit(fromQuery)
      })

      if (options.emitImmediately !== false) {
        void getStatus({ threshold }).then((status) => emit(status, true))
      }

      return () => {
        disposed = true
        dispose()
      }
    }
  }
}

export function usePowerSDK(): PowerSDK {
  const channel = ensureRendererChannel(
    '[PowerSDK] Channel not available. Make sure this is called in a plugin renderer context.'
  )
  return createPowerSDK(channel)
}
