import type { CoreBoxFocusTelemetryRecord } from './focus-diagnostics'
import {
  COREBOX_FOCUS_CODES,
  COREBOX_FOCUS_REASONS,
  COREBOX_FOCUS_STAGES,
  COREBOX_FOCUS_STATUSES,
  COREBOX_FOCUS_TARGETS,
  COREBOX_FOCUS_TRIGGER_SOURCES
} from './focus-diagnostics'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BOOLEAN_FIELDS = [
  'windowAlive', 'visible', 'windowFocused', 'webContentsFocused',
  'pluginActive', 'pluginFocused', 'metaVisible', 'metaFocused',
  'documentFocused', 'inputPresent', 'inputFocused',
  'expectedTargetPresent', 'expectedTargetFocused'
] as const
const COUNT_FIELDS = ['completedSampleCount', 'failedSampleCount', 'cancelledSampleCount'] as const


/** Only explicitly validated diagnostic primitives may leave the process. */
export function sanitizeCoreBoxFocusRecord(input: unknown): CoreBoxFocusTelemetryRecord | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || !('kind' in input) || input.kind !== 'corebox-focus'
    || !('stage' in input) || !('status' in input) || !('code' in input)
    || !('triggerSource' in input) || !('summonId' in input) || !('sampleIndex' in input)
    || !('elapsedMs' in input) || !('severity' in input) || !('plannedSampleCount' in input)) return null
  const stage = COREBOX_FOCUS_STAGES.find(value => value === input.stage)
  const status = COREBOX_FOCUS_STATUSES.find(value => value === input.status)
  const code = COREBOX_FOCUS_CODES.find(value => value === input.code)
  const triggerSource = COREBOX_FOCUS_TRIGGER_SOURCES.find(value => value === input.triggerSource)
  if (!stage || !status || !code || !triggerSource) return null
  const { summonId, sampleIndex, elapsedMs, severity, plannedSampleCount } = input
  if (typeof summonId !== 'string' || !UUID_V4_PATTERN.test(summonId)) return null
  if (typeof sampleIndex !== 'number' || !Number.isInteger(sampleIndex) || sampleIndex < 0 || sampleIndex > 10) return null
  if (stage === 'sample' && sampleIndex === 0) return null
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) return null
  if (severity !== 'info' && severity !== 'error') return null
  if (severity !== (status === 'failed' ? 'error' : 'info') || plannedSampleCount !== 10) return null

  const record: CoreBoxFocusTelemetryRecord = {
    kind: 'corebox-focus', summonId, sampleIndex, triggerSource,
    stage, status, severity, code, elapsedMs, plannedSampleCount
  }
  for (const field of BOOLEAN_FIELDS) {
    const value: unknown = Reflect.get(input, field)
    if (value === undefined) continue
    if (typeof value !== 'boolean') return null
    record[field] = value
  }
  for (const field of COUNT_FIELDS) {
    const value: unknown = Reflect.get(input, field)
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) return null
    record[field] = value
  }
  if ('windowId' in input && input.windowId !== undefined) {
    const value = input.windowId
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return null
    record.windowId = value
  }
  if ('expectedTarget' in input && input.expectedTarget !== undefined) {
    const target = COREBOX_FOCUS_TARGETS.find(value => value === input.expectedTarget)
    if (!target) return null
    record.expectedTarget = target
  }
  if ('reason' in input && input.reason !== undefined) {
    const reason = COREBOX_FOCUS_REASONS.find(value => value === input.reason)
    if (!reason) return null
    record.reason = reason
  }
  return record
}
