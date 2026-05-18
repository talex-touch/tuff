import type { ComposerTranslation } from 'vue-i18n'

export interface IntelligencePayload {
  requestId: string
  prompt: string
  status: 'pending' | 'ready' | 'error'
  answer?: string
  provider?: string
  model?: string
  traceId?: string
  latency?: number
  inputKinds?: string[]
  handoffSessionId?: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  error?: string
  errorCode?: string
  createdAt: number
}

export interface IntelligenceMetaChip {
  label: string
  value: string
}

export type IntelligenceStatusTone = 'working' | 'success' | 'danger' | 'neutral'

export interface IntelligenceStatusHint {
  tone: IntelligenceStatusTone
  label: string
  detail: string
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function formatLatency(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return ''
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`
  }
  return `${Math.round(value)}ms`
}

export function resolveIntelligenceMetaChips(
  payload: IntelligencePayload,
  t: ComposerTranslation
): IntelligenceMetaChip[] {
  const chips: IntelligenceMetaChip[] = []
  const provider = normalizeText(payload.provider)
  const model = normalizeText(payload.model)
  const traceId = normalizeText(payload.traceId)
  const latency = formatLatency(payload.latency)
  const inputKinds = Array.isArray(payload.inputKinds)
    ? [...new Set(payload.inputKinds.map(normalizeText).filter(Boolean))]
    : []

  if (provider || model) {
    chips.push({
      label: t('coreBox.intelligence.metaProvider', 'Provider'),
      value: [provider, model].filter(Boolean).join(' / ')
    })
  }

  if (latency) {
    chips.push({
      label: t('coreBox.intelligence.metaLatency', 'Latency'),
      value: latency
    })
  }

  if (traceId) {
    chips.push({
      label: t('coreBox.intelligence.metaTrace', 'Trace'),
      value: traceId
    })
  }

  if (inputKinds.length > 0) {
    chips.push({
      label: t('coreBox.intelligence.metaInput', 'Input'),
      value: inputKinds.join(' + ')
    })
  }

  return chips
}

export function resolveIntelligenceStatusTone(
  status: IntelligencePayload['status']
): IntelligenceStatusTone {
  if (status === 'pending') return 'working'
  if (status === 'ready') return 'success'
  if (status === 'error') return 'danger'
  return 'neutral'
}

export function resolveIntelligenceStatusHint(
  payload: IntelligencePayload,
  t: ComposerTranslation
): IntelligenceStatusHint {
  const tone = resolveIntelligenceStatusTone(payload.status)

  if (payload.status === 'pending') {
    return {
      tone,
      label: t('coreBox.intelligence.pending', 'Preparing AI response...'),
      detail: t(
        'coreBox.intelligence.pendingHint',
        'Keeping CoreBox open while the provider responds.'
      )
    }
  }

  if (payload.status === 'ready') {
    return {
      tone,
      label: t('coreBox.intelligence.ready', 'AI response ready'),
      detail: t(
        'coreBox.intelligence.readyHint',
        'Review the answer, metadata, and trace before copying it.'
      )
    }
  }

  if (payload.status === 'error') {
    return {
      tone,
      label: t('coreBox.intelligence.error', 'Failed to retrieve AI response'),
      detail: t(
        'coreBox.intelligence.errorHint',
        'Use the recovery reason below before retrying this request.'
      )
    }
  }

  return {
    tone,
    label: t('coreBox.intelligence.unknown', 'AI status unknown'),
    detail: t('coreBox.intelligence.unknownHint', 'No provider state has been reported yet.')
  }
}
