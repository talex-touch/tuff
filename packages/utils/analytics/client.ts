import type { ITuffTransport } from '../transport'
import type {
  CounterPayload,
  FeatureStats,
  GaugePayload,
  HistogramPayload,
  PluginAnalyticsSDK,
  PluginStats,
} from './types'
import { hasWindow } from '../env'
import { useTuffTransport } from '../transport'
import { AppEvents } from '../transport/events'

const emptyStats: PluginStats = {
  featureCalls: {},
  totalCalls: 0,
  avgResponseTime: 0,
  topFeatures: [],
  counters: {},
  gauges: {},
  histograms: {},
}

/**
 * Create a plugin/renderer analytics client powered by TuffTransport.
 */
export function createPluginAnalyticsClient(options?: {
  pluginName?: string
  pluginVersion?: string
  transport?: ITuffTransport
}): PluginAnalyticsSDK {
  let transport = options?.transport
  const pluginName = options?.pluginName
  const pluginVersion = options?.pluginVersion ?? resolveRuntimePluginVersion()

  const getTransport = () => {
    if (transport)
      return transport
    try {
      transport = useTuffTransport()
      return transport
    }
    catch {
      return null
    }
  }

  const withDefaultPlugin = <T extends Record<string, any>>(
    payload: T,
  ): T & { pluginName?: string, pluginVersion?: string } => ({
    ...payload,
    pluginName: payload.pluginName ?? pluginName,
    pluginVersion: payload.pluginVersion ?? pluginVersion,
  })

  return {
    async trackEvent(eventName, metadata, featureId) {
      const tx = getTransport()
      if (!tx)
        return
      await tx.send(AppEvents.analytics.sdk.trackEvent, withDefaultPlugin({ eventName, featureId, metadata }))
    },

    async trackDuration(operationName, durationMs, featureId) {
      const tx = getTransport()
      if (!tx)
        return
      await tx.send(AppEvents.analytics.sdk.trackDuration, withDefaultPlugin({ operationName, durationMs, featureId }))
    },

    async measure(operationName, fn) {
      const startedAt = Date.now()
      try {
        const result = await fn()
        await this.trackDuration(operationName, Date.now() - startedAt)
        return result
      }
      catch (error) {
        await this.trackDuration(operationName, Date.now() - startedAt)
        throw error
      }
    },

    async getStats() {
      const tx = getTransport()
      if (!tx)
        return emptyStats
      return tx.send(AppEvents.analytics.sdk.getStats, withDefaultPlugin({}))
    },

    async getFeatureStats(featureId) {
      const tx = getTransport()
      if (!tx)
        return { count: 0, avgDuration: 0 } satisfies FeatureStats
      return tx.send(AppEvents.analytics.sdk.getFeatureStats, withDefaultPlugin({ featureId }))
    },

    async getTopFeatures(limit) {
      const tx = getTransport()
      if (!tx)
        return []
      return tx.send(AppEvents.analytics.sdk.getTopFeatures, withDefaultPlugin({ limit }))
    },

    async incrementCounter(name, value) {
      const tx = getTransport()
      if (!tx)
        return
      const payload: CounterPayload = { name, value }
      await tx.send(AppEvents.analytics.sdk.incrementCounter, withDefaultPlugin(payload))
    },

    async setGauge(name, value) {
      const tx = getTransport()
      if (!tx)
        return
      const payload: GaugePayload = { name, value }
      await tx.send(AppEvents.analytics.sdk.setGauge, withDefaultPlugin(payload))
    },

    async recordHistogram(name, value) {
      const tx = getTransport()
      if (!tx)
        return
      const payload: HistogramPayload = { name, value }
      await tx.send(AppEvents.analytics.sdk.recordHistogram, withDefaultPlugin(payload))
    },
  }
}

function resolveRuntimePluginVersion(): string | undefined {
  if (!hasWindow())
    return undefined
  const plugin = (window as any).$plugin as { version?: unknown } | undefined
  return typeof plugin?.version === 'string' ? plugin.version : undefined
}
