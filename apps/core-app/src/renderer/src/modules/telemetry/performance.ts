import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { isCoreBox } from '@talex-touch/utils/renderer'
import { touchChannel } from '~/modules/channel/channel-core'

interface RendererPerformanceBuffer {
  longTaskCount: number
  longTaskTotalMs: number
  longTaskMaxMs: number
  rafJankCount: number
  rafJankTotalMs: number
  rafJankMaxMs: number
}

const buffer: RendererPerformanceBuffer = {
  longTaskCount: 0,
  longTaskTotalMs: 0,
  longTaskMaxMs: 0,
  rafJankCount: 0,
  rafJankTotalMs: 0,
  rafJankMaxMs: 0
}

let started = false
const pollingService = PollingService.getInstance()
const flushTaskId = 'renderer.performance.flush'

export async function startRendererPerformanceTelemetry(options?: {
  flushIntervalMs?: number
}): Promise<void> {
  if (started) return
  started = true

  try {
    const config = (await touchChannel.send('sentry:get-config')) as
      | { enabled?: boolean }
      | undefined
    if (!config?.enabled) return
  } catch {
    return
  }

  const flushIntervalMs = options?.flushIntervalMs ?? 60_000

  startLongTaskObserver()
  startRafJankMonitor()

  if (pollingService.isRegistered(flushTaskId)) {
    pollingService.unregister(flushTaskId)
  }
  pollingService.register(flushTaskId, () => flush(), {
    interval: flushIntervalMs,
    unit: 'milliseconds'
  })
  pollingService.start()

  window.addEventListener('beforeunload', () => {
    void flush()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      void flush()
    }
  })
}

function startLongTaskObserver(): void {
  const Observer = typeof PerformanceObserver !== 'undefined' ? PerformanceObserver : undefined
  if (!Observer) return

  try {
    const observer = new Observer((list) => {
      for (const entry of list.getEntries()) {
        const duration = typeof entry.duration === 'number' ? entry.duration : 0
        if (!Number.isFinite(duration) || duration <= 0) continue
        buffer.longTaskCount += 1
        buffer.longTaskTotalMs += duration
        buffer.longTaskMaxMs = Math.max(buffer.longTaskMaxMs, duration)
      }
    })

    observer.observe({ entryTypes: ['longtask'] as any })
  } catch {
    // LongTask API may be unavailable; ignore.
  }
}

function startRafJankMonitor(): void {
  let lastTime = performance.now()

  const onFrame = (now: number) => {
    const delta = now - lastTime
    lastTime = now

    if (delta > 50) {
      buffer.rafJankCount += 1
      buffer.rafJankTotalMs += delta
      buffer.rafJankMaxMs = Math.max(buffer.rafJankMaxMs, delta)
    }

    requestAnimationFrame(onFrame)
  }

  requestAnimationFrame(onFrame)
}

async function flush(): Promise<void> {
  const hasPayload = buffer.longTaskCount > 0 || buffer.rafJankCount > 0
  if (!hasPayload) return

  const payload = {
    longTaskCount: buffer.longTaskCount,
    longTaskTotalMs: Math.round(buffer.longTaskTotalMs),
    longTaskMaxMs: Math.round(buffer.longTaskMaxMs),
    rafJankCount: buffer.rafJankCount,
    rafJankTotalMs: Math.round(buffer.rafJankTotalMs),
    rafJankMaxMs: Math.round(buffer.rafJankMaxMs),
    windowType: isCoreBox() ? 'corebox' : 'main'
  }

  buffer.longTaskCount = 0
  buffer.longTaskTotalMs = 0
  buffer.longTaskMaxMs = 0
  buffer.rafJankCount = 0
  buffer.rafJankTotalMs = 0
  buffer.rafJankMaxMs = 0

  try {
    await touchChannel.send('sentry:record-performance', payload)
  } catch {
    // ignore telemetry errors
  }
}
