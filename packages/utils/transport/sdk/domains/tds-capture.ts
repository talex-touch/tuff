import type { ITuffTransport, SendOptions } from '../../types'
import { defineRawEvent } from '../../event/builder'

export type TdsCaptureFormat = 'jpeg' | 'png' | 'none'

export interface TdsCaptureRenderRequest {
  srcdoc: string
  width: number
  height: number
  pixelRatio?: number
  format?: TdsCaptureFormat
  quality?: number
  settleMs?: number
  domProbeScript?: string
  sessionKey?: string
  timeoutMs?: number
}

export interface TdsCaptureRenderResponse {
  ok: boolean
  bitmapDataUrl?: string
  width: number
  height: number
  domProbeResult?: unknown
  durationMs: number
  error?: string
}

export interface TdsCaptureReleaseSessionRequest {
  sessionKey: string
}

export interface TdsCaptureReleaseSessionResponse {
  released: boolean
}

export const TdsCaptureEvents = {
  renderFrame: defineRawEvent<TdsCaptureRenderRequest, TdsCaptureRenderResponse>(
    'tds-capture:render-frame',
  ),
  releaseSession: defineRawEvent<
    TdsCaptureReleaseSessionRequest,
    TdsCaptureReleaseSessionResponse
  >('tds-capture:release-session'),
} as const

export interface TdsCaptureSdk {
  renderFrame: (
    request: TdsCaptureRenderRequest,
    options?: SendOptions,
  ) => Promise<TdsCaptureRenderResponse>
  releaseSession: (sessionKey: string) => Promise<TdsCaptureReleaseSessionResponse>
}

export function createTdsCaptureSdk(transport: Pick<ITuffTransport, 'send'>): TdsCaptureSdk {
  return {
    renderFrame: (request, options) =>
      transport.send(TdsCaptureEvents.renderFrame, request, options),
    releaseSession: sessionKey =>
      transport.send(TdsCaptureEvents.releaseSession, { sessionKey }),
  }
}
