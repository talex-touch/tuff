import type { ITuffTransport, SendOptions } from '../../types'
import { defineEvent, defineRawEvent } from '../../event/builder'

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

export type TdsCanvasSessionFrameKind = 'html' | 'svg'
export type TdsCanvasSessionOrientation = 'portrait' | 'landscape'

export interface TdsCanvasSessionFrameRecord {
  id: string
  title: string
  kind: TdsCanvasSessionFrameKind
  source: string
  deviceId: string
  orientation?: TdsCanvasSessionOrientation
  showShell?: boolean
  x: number
  y: number
  width?: number
  height?: number
  sourceRef?: string
}

export interface TdsCanvasSessionNoteRecord {
  id: string
  frameId: string
  xRatio: number
  yRatio: number
  text: string
  resolved: boolean
  createdAt: number
}

export interface TdsCanvasSessionFrameSnapshotRecord {
  id: string
  title: string
  kind: TdsCanvasSessionFrameKind
  deviceId: string
  orientation?: TdsCanvasSessionOrientation
  showShell?: boolean
  x: number
  y: number
  width?: number
  height?: number
  sourceRef?: string
  sourceHash: string
}

export interface TdsCanvasSessionHistoryEntryRecord {
  id: string
  label: string
  createdAt: number
  frameSnapshots: TdsCanvasSessionFrameSnapshotRecord[]
}

export interface TdsCanvasSessionHistoryRecord {
  blobs: Record<string, string>
  entries: TdsCanvasSessionHistoryEntryRecord[]
  cursor: number
}

export interface TdsCanvasSessionData {
  version: 1
  frames: TdsCanvasSessionFrameRecord[]
  notes: TdsCanvasSessionNoteRecord[]
  selectedFrameId: string | null
  history: TdsCanvasSessionHistoryRecord
  deletedAutoFrameIds: string[]
  antiSlop: boolean
  canvasThemePackId?: string | null
}

export interface TdsCanvasSessionLoadRequest {
  conversationId: string
}

export interface TdsCanvasSessionLoadResponse {
  ok: boolean
  session: TdsCanvasSessionData | null
  error?: string
}

export interface TdsCanvasSessionSaveRequest {
  conversationId: string
  session: TdsCanvasSessionData
}

export interface TdsCanvasSessionSaveResponse {
  ok: boolean
  bytes?: number
  error?: string
}

export interface TdsCanvasSessionDeleteRequest {
  conversationId: string
}

export interface TdsCanvasSessionDeleteResponse {
  ok: boolean
  deleted: boolean
  error?: string
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

export const TdsCanvasSessionEvents = {
  load: defineEvent('tds-canvas')
    .module('session')
    .event('load')
    .define<TdsCanvasSessionLoadRequest, TdsCanvasSessionLoadResponse>(),
  save: defineEvent('tds-canvas')
    .module('session')
    .event('save')
    .define<TdsCanvasSessionSaveRequest, TdsCanvasSessionSaveResponse>(),
  delete: defineEvent('tds-canvas')
    .module('session')
    .event('delete')
    .define<TdsCanvasSessionDeleteRequest, TdsCanvasSessionDeleteResponse>(),
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

export interface TdsCanvasSessionSdk {
  load: (
    conversationId: string,
    options?: SendOptions,
  ) => Promise<TdsCanvasSessionLoadResponse>
  save: (
    conversationId: string,
    session: TdsCanvasSessionData,
    options?: SendOptions,
  ) => Promise<TdsCanvasSessionSaveResponse>
  delete: (
    conversationId: string,
    options?: SendOptions,
  ) => Promise<TdsCanvasSessionDeleteResponse>
}

export function createTdsCanvasSessionSdk(
  transport: Pick<ITuffTransport, 'send'>,
): TdsCanvasSessionSdk {
  return {
    load: (conversationId, options) =>
      transport.send(TdsCanvasSessionEvents.load, { conversationId }, options),
    save: (conversationId, session, options) =>
      transport.send(TdsCanvasSessionEvents.save, { conversationId, session }, options),
    delete: (conversationId, options) =>
      transport.send(TdsCanvasSessionEvents.delete, { conversationId }, options),
  }
}
