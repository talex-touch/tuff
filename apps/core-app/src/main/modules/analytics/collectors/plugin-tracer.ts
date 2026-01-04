import type { CoreMetrics } from '@talex-touch/utils/analytics'

interface FeatureMetrics {
  count: number
  totalDuration: number
  lastDuration?: number
}

interface PluginMetricsState {
  featureCalls: Record<string, number>
  totalCalls: number
  totalDuration: number
  counters: Record<string, number>
  gauges: Record<string, number>
  histograms: Record<string, number[]>
}

export interface PluginStats {
  featureCalls: Record<string, number>
  totalCalls: number
  avgResponseTime: number
  topFeatures: Array<{ id: string, count: number }>
  counters: Record<string, number>
  gauges: Record<string, number>
  histograms: Record<string, number[]>
}

export interface FeatureStats {
  count: number
  avgDuration: number
  lastDuration?: number
}

export class PluginTracer {
  private plugins = new Map<string, PluginMetricsState>()
  private featureDurations = new Map<string, Map<string, FeatureMetrics>>()

  trackEvent(pluginName: string, featureId?: string): void {
    const state = this.ensurePlugin(pluginName)
    state.totalCalls += 1
    if (featureId) {
      state.featureCalls[featureId] = (state.featureCalls[featureId] ?? 0) + 1
      this.bumpFeatureDuration(pluginName, featureId, 0)
    }
  }

  trackDuration(pluginName: string, featureId: string | undefined, durationMs: number): void {
    const state = this.ensurePlugin(pluginName)
    state.totalCalls += 1
    state.totalDuration += durationMs

    if (featureId) {
      state.featureCalls[featureId] = (state.featureCalls[featureId] ?? 0) + 1
      this.bumpFeatureDuration(pluginName, featureId, durationMs)
    }
  }

  incrementCounter(pluginName: string, name: string, value = 1): void {
    const state = this.ensurePlugin(pluginName)
    state.counters[name] = (state.counters[name] ?? 0) + value
  }

  setGauge(pluginName: string, name: string, value: number): void {
    const state = this.ensurePlugin(pluginName)
    state.gauges[name] = value
  }

  recordHistogram(pluginName: string, name: string, value: number): void {
    const state = this.ensurePlugin(pluginName)
    const list = state.histograms[name] ?? []
    list.push(value)
    state.histograms[name] = list
  }

  snapshot(): CoreMetrics['plugins'] {
    const result: CoreMetrics['plugins'] = {}

    for (const [plugin, state] of this.plugins.entries()) {
      const topFeatures = Object.entries(state.featureCalls)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id, count]) => ({ id, count }))

      const avgResponseTime = state.totalCalls > 0 ? state.totalDuration / state.totalCalls : 0

      result[plugin] = {
        featureCalls: state.featureCalls,
        totalCalls: state.totalCalls,
        avgResponseTime,
        topFeatures,
      }
    }

    return result
  }

  getStats(pluginName: string): PluginStats {
    const state = this.ensurePlugin(pluginName)
    const topFeatures = Object.entries(state.featureCalls)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id, count]) => ({ id, count }))

    const avgResponseTime = state.totalCalls > 0 ? state.totalDuration / state.totalCalls : 0

    return {
      featureCalls: state.featureCalls,
      totalCalls: state.totalCalls,
      avgResponseTime,
      topFeatures,
      counters: state.counters,
      gauges: state.gauges,
      histograms: state.histograms,
    }
  }

  getFeatureStats(pluginName: string, featureId: string): FeatureStats {
    const featureMap = this.featureDurations.get(pluginName)
    const metrics = featureMap?.get(featureId)
    if (!metrics) {
      return { count: 0, avgDuration: 0 }
    }

    const avgDuration = metrics.count > 0 ? metrics.totalDuration / metrics.count : 0
    return {
      count: metrics.count,
      avgDuration,
      lastDuration: metrics.lastDuration,
    }
  }

  getTopFeatures(pluginName: string, limit = 10): Array<{ id: string, count: number }> {
    const state = this.ensurePlugin(pluginName)
    return Object.entries(state.featureCalls)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, count]) => ({ id, count }))
  }

  private ensurePlugin(pluginName: string): PluginMetricsState {
    if (!this.plugins.has(pluginName)) {
      this.plugins.set(pluginName, {
        featureCalls: {},
        totalCalls: 0,
        totalDuration: 0,
        counters: {},
        gauges: {},
        histograms: {},
      })
    }

    if (!this.featureDurations.has(pluginName)) {
      this.featureDurations.set(pluginName, new Map())
    }

    return this.plugins.get(pluginName)!
  }

  private bumpFeatureDuration(pluginName: string, featureId: string, durationMs: number): void {
    const featureMap = this.featureDurations.get(pluginName) ?? new Map<string, FeatureMetrics>()
    const current = featureMap.get(featureId) ?? { count: 0, totalDuration: 0 }

    current.count += 1
    current.totalDuration += durationMs
    current.lastDuration = durationMs

    featureMap.set(featureId, current)
    this.featureDurations.set(pluginName, featureMap)
  }
}
