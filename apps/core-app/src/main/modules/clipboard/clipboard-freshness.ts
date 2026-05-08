import type { ClipboardCaptureSource } from '@talex-touch/utils/transport/events/types'

export interface ClipboardFreshnessState {
  eligible: boolean
  captureSource: ClipboardCaptureSource
  observedAt: number
  freshnessBaseAt: number
}

export interface ClipboardCaptureContext {
  source: ClipboardCaptureSource
  observedAt: number
  previousScanAt: number | null
}

const AUTO_PASTE_CAPTURE_SOURCES = new Set<ClipboardCaptureSource>([
  'native-watch',
  'background-poll',
  'visible-poll'
])

export function createClipboardFreshnessState(
  context: ClipboardCaptureContext
): ClipboardFreshnessState {
  const eligible = AUTO_PASTE_CAPTURE_SOURCES.has(context.source)
  const freshnessBaseAt =
    context.source === 'background-poll' || context.source === 'visible-poll'
      ? Math.min(context.observedAt, context.previousScanAt ?? context.observedAt)
      : context.observedAt

  return {
    eligible,
    captureSource: context.source,
    observedAt: context.observedAt,
    freshnessBaseAt
  }
}

export function createIneligibleClipboardFreshnessState(
  source: ClipboardCaptureSource,
  observedAt = Date.now()
): ClipboardFreshnessState {
  return {
    eligible: false,
    captureSource: source,
    observedAt,
    freshnessBaseAt: observedAt
  }
}
