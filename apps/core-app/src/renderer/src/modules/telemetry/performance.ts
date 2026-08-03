import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { isCoreBox } from '@talex-touch/utils/renderer/hooks/arg-mapper'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { SentryEvents } from '@talex-touch/utils/transport/events'
import { subscribeRendererActivity } from './renderer-activity'

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

const transport = useTuffTransport()
let started = false
const pollingService = PollingService.getInstance()
const flushTaskId = 'renderer.performance.flush'
let rafId: number | null = null
let lastFrameTime: number | null = null
let monitoringEnabled = false
let rendererActive = true

export async function startRendererPerformanceTelemetry(options?: {
  flushIntervalMs?: number
}): Promise<void> {
  if (started) return
  started = true

  try {
    const config = (await transport.send(SentryEvents.api.getConfig)) as
      | { enabled?: boolean }
      | undefined
    if (!config?.enabled) return
  } catch {
    return
  }
  monitoringEnabled = true

  const flushIntervalMs = options?.flushIntervalMs ?? 60_000

  startLongTaskObserver()
  subscribeRendererActivity((active) => {
    rendererActive = active
    syncRafJankMonitor()
    if (!active) void flush()
  })

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
    syncRafJankMonitor()
    if (document.hidden) void flush()
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

    observer.observe({ entryTypes: ['longtask'] })
  } catch {
    // LongTask API may be unavailable; ignore.
  }
}

function startRafJankMonitor(): void {
  if (!monitoringEnabled || !rendererActive || document.hidden || rafId !== null) return
  lastFrameTime = performance.now()

  const onFrame = (now: number) => {
    rafId = null
    if (!monitoringEnabled || !rendererActive || document.hidden) {
      lastFrameTime = null
      return
    }

    const previousFrameTime = lastFrameTime
    lastFrameTime = now
    if (previousFrameTime !== null) {
      const delta = now - previousFrameTime
      if (delta > 50) {
        buffer.rafJankCount += 1
        buffer.rafJankTotalMs += delta
        buffer.rafJankMaxMs = Math.max(buffer.rafJankMaxMs, delta)
      }
    }

    rafId = requestAnimationFrame(onFrame)
  }

  rafId = requestAnimationFrame(onFrame)
}

function stopRafJankMonitor(): void {
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = null
  lastFrameTime = null
}

function syncRafJankMonitor(): void {
  if (!monitoringEnabled || !rendererActive || document.hidden) {
    stopRafJankMonitor()
    return
  }
  startRafJankMonitor()
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
    await transport.send(SentryEvents.api.recordPerformance, payload)
  } catch {
    // ignore telemetry errors
  }
}
