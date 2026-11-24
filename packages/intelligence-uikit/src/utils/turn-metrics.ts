import type { TxAiMetricMessage } from '../types'

export function formatMetricLatency(ms?: number): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatTokenCount(count: number): string {
  if (count < 1000) return `${count}`
  if (count < 10000) return `${(count / 1000).toFixed(1)}K`
  if (count < 1000000) return `${Math.round(count / 1000)}K`
  return `${(count / 1000000).toFixed(1)}M`
}

export function calculateTokenSpeed(message: TxAiMetricMessage): number | null {
  const latency = message.meta?.latencyMs
  if (!latency || latency < 200) return null
  const tokens = message.meta?.completionTokens ?? message.meta?.totalTokens
  if (!tokens || tokens <= 0) return null
  const seconds = latency / 1000
  return Math.round(tokens / seconds)
}

export function metricTokensTitle(message: TxAiMetricMessage, labels: Record<string, string> = {}): string {
  const meta = message.meta
  const prompt = meta?.promptTokens ?? 0
  const completion = meta?.completionTokens ?? 0
  const total = meta?.totalTokens ?? 0
  return `${labels.input ?? 'Input'}: ${prompt} · ${labels.output ?? 'Output'}: ${completion} · ${labels.total ?? 'Total'}: ${total}`
}

export function splitTurnModelLabel(model: string): { prefix: string; name: string } {
  const slash = model.indexOf('/')
  if (slash <= 0 || slash === model.length - 1) return { prefix: '', name: model }
  return { prefix: model.slice(0, slash + 1), name: model.slice(slash + 1) }
}

export function metricModelTitle(message: TxAiMetricMessage, labels: Record<string, string> = {}): string {
  const meta = message.meta
  const parts: string[] = []
  const model = meta?.model || meta?.modelLabel
  if (model) {
    parts.push(`${labels.model ?? 'Model'}: ${model}`)
  }
  if (meta?.provider) {
    parts.push(`${labels.provider ?? 'Provider'}: ${meta.provider}`)
  }
  const reasoning = meta?.reasoningTitle || meta?.reasoning
  if (reasoning) {
    parts.push(`${labels.reasoning ?? 'Reasoning'}: ${reasoning}`)
  }
  return parts.join(' · ') || (labels.model ?? 'Model')
}

export function metricLatencyTitle(message: TxAiMetricMessage, labels: Record<string, string> = {}): string {
  const meta = message.meta
  const latency = meta?.latencyMs ? formatMetricLatency(meta.latencyMs) : ''
  const ttft = meta?.ttftMs ? formatMetricLatency(meta.ttftMs) : ''
  if (ttft) {
    return `${labels.totalLatency ?? 'Total latency'}: ${latency} · ${labels.ttft ?? 'First token (TTFT)'}: ${ttft}`
  }
  return `${labels.latency ?? 'Latency'}: ${latency}`
}

