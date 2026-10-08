import { randomUUID } from 'node:crypto'
import type {
  CoreBoxFocusCode,
  CoreBoxFocusNativeSnapshot,
  CoreBoxFocusProbeRequest,
  CoreBoxFocusProbeResponse,
  CoreBoxFocusStage,
  CoreBoxFocusTelemetryRecord
} from '@talex-touch/utils/core-box/focus-diagnostics'
import { COREBOX_FOCUS_TARGETS } from '@talex-touch/utils/core-box/focus-diagnostics'

export const COREBOX_FOCUS_SAMPLE_COUNT = 10
export const COREBOX_FOCUS_FIRST_SAMPLE_MS = 200
export const COREBOX_FOCUS_SAMPLE_INTERVAL_MS = 100
export const COREBOX_FOCUS_PROBE_TIMEOUT_MS = 250

interface ProbeResult {
  response?: CoreBoxFocusProbeResponse
  code?: CoreBoxFocusCode
}
interface FocusSession {
  id: string
  startedAt: number
  triggerSource: 'shortcut' | 'programmatic'
  shown: boolean
  closed: boolean
  cancelled: boolean
  nextIndex: number
  completed: Set<number>
  failed: number
  timer: NodeJS.Timeout | null
  pending: Map<number, { timer: NodeJS.Timeout; resolve: (result: ProbeResult) => void }>
}
export interface CoreBoxFocusDiagnosticsOptions {
  readNative: () => CoreBoxFocusNativeSnapshot
  dispatchProbe: (request: CoreBoxFocusProbeRequest) => void
  emit: (record: CoreBoxFocusTelemetryRecord) => void
}

export class CoreBoxFocusDiagnostics {
  private session: FocusSession | null = null

  constructor(private readonly options: CoreBoxFocusDiagnosticsOptions) {}

  start(triggerSource: FocusSession['triggerSource']): string {
    this.cancel('superseded')
    const session: FocusSession = {
      id: randomUUID(),
      startedAt: Date.now(),
      triggerSource,
      shown: false,
      closed: false,
      cancelled: false,
      nextIndex: 1,
      completed: new Set(),
      failed: 0,
      timer: null,
      pending: new Map()
    }
    this.session = session
    this.emit(session, 'summon', 'pending', 'COREBOX_FOCUS_SUMMON_STARTED')
    return session.id
  }

  isCurrent(summonId: string): boolean {
    return Boolean(this.session && this.session.id === summonId && !this.session.cancelled)
  }

  get monitoring(): boolean {
    return Boolean(this.session?.shown && !this.session.closed && !this.session.cancelled)
  }
  get summonId(): string | undefined {
    return this.session && !this.session.cancelled ? this.session.id : undefined
  }

  shown(summonId: string): void {
    const session = this.session
    if (!session || !this.isCurrent(summonId) || session.shown) return
    session.shown = true
    this.emit(session, 'show', 'success', 'COREBOX_FOCUS_SHOWN')
    session.timer = setTimeout(() => this.launchSample(session), COREBOX_FOCUS_FIRST_SAMPLE_MS)
  }

  record(
    stage: CoreBoxFocusStage,
    code: CoreBoxFocusCode,
    failed = false,
    summonId?: string,
    detail: Partial<CoreBoxFocusTelemetryRecord> = {}
  ): void {
    const session = this.session
    if (!session || session.cancelled || (summonId && session.id !== summonId)) return
    this.emit(session, stage, failed ? 'failed' : 'success', code, 0, detail)
  }

  receiveProbe(value: CoreBoxFocusProbeResponse): boolean {
    const session = this.session
    if (!session || session.closed || !value || value.summonId !== session.id) return false
    const pending = session.pending.get(value.sampleIndex)
    if (!pending) return false
    clearTimeout(pending.timer)
    session.pending.delete(value.sampleIndex)
    const valid =
      COREBOX_FOCUS_TARGETS.includes(value.expectedTarget) &&
      [
        'documentFocused',
        'inputPresent',
        'inputFocused',
        'expectedTargetPresent',
        'expectedTargetFocused'
      ].every((field) => typeof value[field as keyof CoreBoxFocusProbeResponse] === 'boolean')
    pending.resolve(valid ? { response: value } : { code: 'COREBOX_FOCUS_RENDERER_INVALID_REPLY' })
    return true
  }

  cancel(reason: NonNullable<CoreBoxFocusTelemetryRecord['reason']>): void {
    const session = this.session
    if (!session || session.cancelled) return
    if (session.closed) {
      session.cancelled = true
      return
    }
    clearTimeout(session.timer ?? undefined)
    session.timer = null
    session.cancelled = true
    session.closed = true
    for (const pending of session.pending.values()) {
      clearTimeout(pending.timer)
      pending.resolve({})
    }
    session.pending.clear()
    const cancelled = COREBOX_FOCUS_SAMPLE_COUNT - session.completed.size
    for (let index = 1; index <= COREBOX_FOCUS_SAMPLE_COUNT; index++) {
      if (!session.completed.has(index)) {
        this.emit(session, 'sample', 'cancelled', 'COREBOX_FOCUS_CANCELLED', index, { reason })
      }
    }
    this.emit(session, 'cancel', 'cancelled', 'COREBOX_FOCUS_CANCELLED', 0, {
      reason,
      completedSampleCount: session.completed.size,
      failedSampleCount: session.failed,
      cancelledSampleCount: cancelled
    })
  }

  private launchSample(session: FocusSession): void {
    if (session.closed || this.session !== session) return
    const index = session.nextIndex++
    session.timer =
      index < COREBOX_FOCUS_SAMPLE_COUNT
        ? setTimeout(() => this.launchSample(session), COREBOX_FOCUS_SAMPLE_INTERVAL_MS)
        : null
    void this.sample(session, index)
  }

  private probe(session: FocusSession, index: number): Promise<ProbeResult> {
    const { promise, resolve } = Promise.withResolvers<ProbeResult>()
    const timer = setTimeout(() => {
      session.pending.delete(index)
      resolve({ code: 'COREBOX_FOCUS_RENDERER_TIMEOUT' })
    }, COREBOX_FOCUS_PROBE_TIMEOUT_MS)
    session.pending.set(index, { timer, resolve })
    try {
      this.options.dispatchProbe({ summonId: session.id, sampleIndex: index })
    } catch {
      clearTimeout(timer)
      session.pending.delete(index)
      resolve({ code: 'COREBOX_FOCUS_RENDERER_INVALID_REPLY' })
    }
    return promise
  }

  private async sample(session: FocusSession, index: number): Promise<void> {
    let native: CoreBoxFocusNativeSnapshot | undefined
    try {
      native = this.options.readNative()
    } catch {
      native = undefined
    }
    const nativeCode: CoreBoxFocusCode | undefined = !native
      ? 'COREBOX_FOCUS_NATIVE_SNAPSHOT_FAILED'
      : !native.windowAlive
        ? 'COREBOX_FOCUS_WINDOW_MISSING'
        : !native.visible
          ? 'COREBOX_FOCUS_WINDOW_HIDDEN'
          : !native.windowFocused
            ? 'COREBOX_FOCUS_WINDOW_NOT_FOCUSED'
            : undefined
    if (nativeCode) this.emit(session, 'native-focus', 'failed', nativeCode, index, native)
    const probe = native?.windowAlive === false ? {} : await this.probe(session, index)
    if (session.closed || this.session !== session) return
    if (probe.code) this.emit(session, 'renderer-focus', 'failed', probe.code, index, native)
    const response = probe.response
    let code: CoreBoxFocusCode | undefined = nativeCode ?? probe.code
    const detail: Partial<CoreBoxFocusTelemetryRecord> = { ...native }
    if (response) {
      detail.documentFocused = response.documentFocused
      detail.inputPresent = response.inputPresent
      detail.inputFocused = response.inputFocused
      const rendererOwnsFocus =
        native?.webContentsFocused &&
        response.documentFocused &&
        response.expectedTargetPresent &&
        response.expectedTargetFocused
      detail.expectedTarget = native?.metaVisible
        ? 'meta-overlay'
        : native?.pluginActive && !rendererOwnsFocus
          ? 'plugin'
          : response.expectedTarget
      detail.expectedTargetPresent = native?.metaVisible
        ? true
        : detail.expectedTarget === 'plugin'
          ? native?.pluginActive
          : response.expectedTargetPresent
      detail.expectedTargetFocused = native?.metaVisible
        ? native.metaFocused
        : detail.expectedTarget === 'plugin'
          ? native?.pluginFocused
          : response.expectedTargetFocused
      const hostedView =
        detail.expectedTarget === 'meta-overlay' || detail.expectedTarget === 'plugin'
      code ??= !detail.expectedTargetPresent
        ? 'COREBOX_FOCUS_TARGET_MISSING'
        : !detail.expectedTargetFocused
          ? 'COREBOX_FOCUS_TARGET_NOT_FOCUSED'
          : !hostedView && (!native?.webContentsFocused || !response.documentFocused)
            ? 'COREBOX_FOCUS_DOCUMENT_NOT_FOCUSED'
            : undefined
    }
    if (!response && !code) code = 'COREBOX_FOCUS_RENDERER_INVALID_REPLY'
    if (code) session.failed++
    session.completed.add(index)
    this.emit(
      session,
      'sample',
      code ? 'failed' : 'success',
      code ?? 'COREBOX_FOCUS_OK',
      index,
      detail
    )
    if (session.completed.size === COREBOX_FOCUS_SAMPLE_COUNT) {
      session.closed = true
      this.emit(
        session,
        'complete',
        session.failed ? 'failed' : 'success',
        'COREBOX_FOCUS_COMPLETED',
        0,
        {
          completedSampleCount: session.completed.size,
          failedSampleCount: session.failed,
          cancelledSampleCount: 0
        }
      )
    }
  }

  private emit(
    session: FocusSession,
    stage: CoreBoxFocusStage,
    status: CoreBoxFocusTelemetryRecord['status'],
    code: CoreBoxFocusCode,
    sampleIndex = 0,
    detail: Partial<CoreBoxFocusTelemetryRecord> = {}
  ): void {
    this.options.emit({
      ...detail,
      kind: 'corebox-focus',
      summonId: session.id,
      sampleIndex,
      triggerSource: session.triggerSource,
      stage,
      status,
      severity: status === 'failed' ? 'error' : 'info',
      code,
      elapsedMs: Math.max(0, Date.now() - session.startedAt),
      plannedSampleCount: COREBOX_FOCUS_SAMPLE_COUNT
    })
  }
}
