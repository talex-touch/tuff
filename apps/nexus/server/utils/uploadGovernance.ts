import type { H3Event } from 'h3'
import type { RecordPlatformGovernanceEventInput } from './platformGovernanceStore'
import { randomUUID } from 'node:crypto'
import { recordPlatformGovernanceEvent } from './platformGovernanceStore'

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'
export const UPLOAD_GOVERNANCE_WRITE_TIMEOUT_MS = 750

interface UploadFileLike {
  name?: string | null
  size?: number | null
  type?: string | null
}

export interface UploadGovernanceInput {
  actorId?: unknown
  resourceType: string
  resourceId?: string | null
  file?: UploadFileLike | null
  contentType?: string | null
  extension?: string | null
  size?: number | null
  metadata?: Record<string, unknown>
}

export interface CompleteUploadGovernanceInput {
  resourceId?: string | null
  contentType?: string | null
  extension?: string | null
  size?: number | null
  storageChannel?: string | null
  storageProvider?: string | null
  metadata?: Record<string, unknown>
}

export interface FailUploadGovernanceInput {
  resourceId?: string | null
  reason?: string | null
  statusCode?: number | null
  metadata?: Record<string, unknown>
}

export interface UploadGovernanceContext {
  attemptId: string
  startedAt: number
  actorId?: unknown
  resourceType: string
  resourceId: string | null
  contentType: string
  extension: string | null
  size: number | null
  metadata: Record<string, unknown>
}

function sanitizeToken(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string')
    return null
  const normalized = value.trim()
  if (!normalized)
    return null
  return normalized.slice(0, maxLength)
}

function normalizeContentType(...values: unknown[]): string {
  for (const value of values) {
    const normalized = sanitizeToken(value, 120)
    if (normalized)
      return normalized.toLowerCase()
  }
  return DEFAULT_CONTENT_TYPE
}

function normalizeSize(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
      return Math.round(value)
  }
  return null
}

function sanitizeExtension(value: unknown): string | null {
  const normalized = sanitizeToken(value, 24)?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? null
  return normalized || null
}

function extensionFromName(value: unknown): string | null {
  const normalized = sanitizeToken(value, 260)
  if (!normalized)
    return null
  return sanitizeExtension(normalized.match(/\.([a-z0-9]+)$/i)?.[1])
}

function normalizeExtension(input: UploadGovernanceInput | CompleteUploadGovernanceInput): string | null {
  const explicitExtension = sanitizeExtension(input.extension)
  if (explicitExtension)
    return explicitExtension
  if ('file' in input)
    return extensionFromName(input.file?.name) ?? extensionFromName(input.resourceId)
  return extensionFromName(input.resourceId)
}

function normalizeCompletedExtension(
  context: UploadGovernanceContext,
  input: CompleteUploadGovernanceInput,
): string | null {
  return sanitizeExtension(input.extension)
    ?? context.extension
    ?? extensionFromName(input.resourceId)
}

function sanitizeReason(error: unknown, fallback?: string | null): string {
  const explicit = sanitizeToken(fallback, 180)
  if (explicit)
    return explicit

  if (error && typeof error === 'object') {
    const statusMessage = sanitizeToken((error as { statusMessage?: unknown }).statusMessage, 180)
    if (statusMessage)
      return statusMessage
    const message = sanitizeToken((error as { message?: unknown }).message, 180)
    if (message)
      return message
  }

  return 'upload_failed'
}

function readStatusCode(error: unknown, fallback?: number | null): number | null {
  if (typeof fallback === 'number' && Number.isFinite(fallback))
    return Math.round(fallback)
  if (error && typeof error === 'object') {
    const statusCode = (error as { statusCode?: unknown }).statusCode
    if (typeof statusCode === 'number' && Number.isFinite(statusCode))
      return Math.round(statusCode)
  }
  return null
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readUploadRetryMetadata(error: unknown): Record<string, unknown> {
  const data = readRecord(readRecord(error)?.data)
  const retry = readRecord(data?.uploadRetry)
  if (!retry)
    return {}

  return {
    retryable: typeof retry.retryable === 'boolean' ? retry.retryable : undefined,
    retryCount: typeof retry.retryCount === 'number' && Number.isFinite(retry.retryCount) ? retry.retryCount : undefined,
    maxRetries: typeof retry.maxRetries === 'number' && Number.isFinite(retry.maxRetries) ? retry.maxRetries : undefined,
    nextRetryDelayMs: typeof retry.nextRetryDelayMs === 'number' && Number.isFinite(retry.nextRetryDelayMs) ? retry.nextRetryDelayMs : undefined,
    storageChannel: typeof retry.storageChannel === 'string' ? retry.storageChannel : undefined,
    storageProvider: typeof retry.storageProvider === 'string' ? retry.storageProvider : undefined,
    storageOperation: typeof retry.storageOperation === 'string' ? retry.storageOperation : undefined,
    storageStatusCode: typeof retry.storageStatusCode === 'number' && Number.isFinite(retry.storageStatusCode) ? retry.storageStatusCode : undefined,
  }
}

function buildMetadata(
  context: UploadGovernanceContext,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...context.metadata,
    ...overrides,
    attemptId: context.attemptId,
    resourceType: context.resourceType,
    extension: overrides.extension ?? context.extension,
    contentType: overrides.contentType ?? context.contentType,
    size: overrides.size ?? context.size,
  }
}

async function recordUploadLifecycleEvent(
  event: H3Event,
  input: RecordPlatformGovernanceEventInput,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<void>((resolve) => {
    timeout = setTimeout(resolve, UPLOAD_GOVERNANCE_WRITE_TIMEOUT_MS)
    if (timeout && typeof timeout === 'object' && 'unref' in timeout && typeof timeout.unref === 'function')
      timeout.unref()
  })

  const writePromise = recordPlatformGovernanceEvent(event, input)
    .then(() => undefined)
    .catch(() => undefined)

  await Promise.race([writePromise, timeoutPromise])
  if (timeout)
    clearTimeout(timeout)
}

export async function startUploadGovernance(
  event: H3Event,
  input: UploadGovernanceInput,
): Promise<UploadGovernanceContext> {
  const contentType = normalizeContentType(input.contentType, input.file?.type)
  const size = normalizeSize(input.size, input.file?.size)
  const context: UploadGovernanceContext = {
    attemptId: randomUUID(),
    startedAt: Date.now(),
    actorId: input.actorId,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    contentType,
    extension: normalizeExtension(input),
    size,
    metadata: input.metadata ?? {},
  }

  await recordUploadLifecycleEvent(event, {
    scope: 'upload',
    action: 'resource.started',
    actorId: context.actorId,
    resourceType: context.resourceType,
    resourceId: context.resourceId,
    channel: contentType,
    unit: 'file',
    quantity: 1,
    metadata: buildMetadata(context),
  })

  return context
}

export async function completeUploadGovernance(
  event: H3Event,
  context: UploadGovernanceContext,
  input: CompleteUploadGovernanceInput = {},
): Promise<void> {
  const contentType = normalizeContentType(input.contentType, context.contentType)
  const size = normalizeSize(input.size, context.size) ?? 0
  const extension = normalizeCompletedExtension(context, input)
  const resourceId = input.resourceId ?? context.resourceId

  await recordUploadLifecycleEvent(event, {
    scope: 'upload',
    action: 'resource.completed',
    actorId: context.actorId,
    resourceType: context.resourceType,
    resourceId,
    channel: contentType,
    unit: 'byte',
    quantity: size,
    metadata: buildMetadata(context, {
      ...input.metadata,
      extension,
      contentType,
      size,
      storageChannel: input.storageChannel ?? null,
      storageProvider: input.storageProvider ?? null,
      durationMs: Math.max(0, Date.now() - context.startedAt),
    }),
  })
}

export async function failUploadGovernance(
  event: H3Event,
  context: UploadGovernanceContext,
  error: unknown,
  input: FailUploadGovernanceInput = {},
): Promise<void> {
  const statusCode = readStatusCode(error, input.statusCode)
  await recordUploadLifecycleEvent(event, {
    scope: 'upload',
    action: 'resource.failed',
    actorId: context.actorId,
    resourceType: context.resourceType,
    resourceId: input.resourceId ?? context.resourceId,
    channel: context.contentType,
    unit: 'file',
    quantity: 1,
    metadata: buildMetadata(context, {
      ...readUploadRetryMetadata(error),
      ...input.metadata,
      reason: sanitizeReason(error, input.reason),
      statusCode,
      durationMs: Math.max(0, Date.now() - context.startedAt),
    }),
  })
}
