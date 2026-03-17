import type { H3Event } from 'h3'
import { listPilotRoutingMetrics } from './pilot-routing-metrics'

export interface ChannelModelStats {
  channelId: string
  providerModel: string
  routeKey: string
  total: number
  success: number
  successRate: number
  avgQueueWaitMs: number
  avgTtftMs: number
  avgTotalDurationMs: number
  avgOutputTokens: number
  score: number
}

export interface ChannelModelScoreInput {
  channelId: string
  providerModel: string
}

export interface ChannelModelScoreOptions {
  metricWindowHours: number
  recentRequestWindow: number
}

function nowTs(): number {
  return Date.now()
}

function toIso(ts: number): string {
  return new Date(ts).toISOString()
}

function normalizeNumber(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(parsed), min), max)
}

function buildRouteKey(channelId: string, providerModel: string): string {
  return `${channelId}::${providerModel}`
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  if (value < 0) {
    return 0
  }
  if (value > 1) {
    return 1
  }
  return value
}

function avg(sum: number, total: number): number {
  if (total <= 0) {
    return 0
  }
  return sum / total
}

export async function computeChannelModelStats(
  event: H3Event,
  candidates: ChannelModelScoreInput[],
  options: ChannelModelScoreOptions,
): Promise<Map<string, ChannelModelStats>> {
  const metricWindowHours = normalizeNumber(options.metricWindowHours, 24, 1, 24 * 7)
  const recentRequestWindow = normalizeNumber(options.recentRequestWindow, 200, 10, 5000)
  const fromTs = toIso(nowTs() - metricWindowHours * 60 * 60 * 1000)
  const targetMap = new Map<string, ChannelModelScoreInput>()

  for (const item of candidates) {
    const channelId = String(item.channelId || '').trim()
    const providerModel = String(item.providerModel || '').trim()
    if (!channelId || !providerModel) {
      continue
    }
    targetMap.set(buildRouteKey(channelId, providerModel), {
      channelId,
      providerModel,
    })
  }

  if (targetMap.size <= 0) {
    return new Map()
  }

  const metrics = await listPilotRoutingMetrics(event, {
    fromTs,
    limit: Math.max(recentRequestWindow * targetMap.size, 500),
  })

  const buckets = new Map<string, {
    total: number
    success: number
    queueWaitSum: number
    ttftSum: number
    totalDurationSum: number
    outputTokenSum: number
  }>()

  for (const metric of metrics) {
    const routeKey = buildRouteKey(metric.channelId, metric.providerModel)
    if (!targetMap.has(routeKey)) {
      continue
    }
    const bucket = buckets.get(routeKey) || {
      total: 0,
      success: 0,
      queueWaitSum: 0,
      ttftSum: 0,
      totalDurationSum: 0,
      outputTokenSum: 0,
    }

    if (bucket.total >= recentRequestWindow) {
      continue
    }

    bucket.total += 1
    if (metric.success) {
      bucket.success += 1
    }
    bucket.queueWaitSum += normalizeNumber(metric.queueWaitMs, 0, 0)
    bucket.ttftSum += normalizeNumber(metric.ttftMs, 0, 0)
    bucket.totalDurationSum += normalizeNumber(metric.totalDurationMs, 0, 0)
    bucket.outputTokenSum += normalizeNumber(metric.outputTokens, 0, 0)
    buckets.set(routeKey, bucket)
  }

  const result = new Map<string, ChannelModelStats>()
  for (const [routeKey, target] of targetMap) {
    const bucket = buckets.get(routeKey) || {
      total: 0,
      success: 0,
      queueWaitSum: 0,
      ttftSum: 0,
      totalDurationSum: 0,
      outputTokenSum: 0,
    }

    const total = bucket.total
    const successRate = total > 0 ? bucket.success / total : 0.5
    const avgTtftMs = avg(bucket.ttftSum, total)
    const avgTotalDurationMs = avg(bucket.totalDurationSum, total)
    const avgQueueWaitMs = avg(bucket.queueWaitSum, total)
    const avgOutputTokens = avg(bucket.outputTokenSum, total)

    const successScore = clamp01(successRate) * 55
    const ttftScore = clamp01(1 - (avgTtftMs / 12_000)) * 30
    const totalLatencyScore = clamp01(1 - (avgTotalDurationMs / 45_000)) * 15
    const score = Number((successScore + ttftScore + totalLatencyScore).toFixed(4))

    result.set(routeKey, {
      channelId: target.channelId,
      providerModel: target.providerModel,
      routeKey,
      total,
      success: bucket.success,
      successRate: Number(successRate.toFixed(4)),
      avgQueueWaitMs: Number(avgQueueWaitMs.toFixed(2)),
      avgTtftMs: Number(avgTtftMs.toFixed(2)),
      avgTotalDurationMs: Number(avgTotalDurationMs.toFixed(2)),
      avgOutputTokens: Number(avgOutputTokens.toFixed(2)),
      score,
    })
  }

  return result
}
