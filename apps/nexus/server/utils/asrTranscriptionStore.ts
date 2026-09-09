import type { D1Database, R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { deleteStorageObject, getStorageObject, putStorageObject, type StorageObjectMemory } from './storageObjectStore'

const ASR_REQUESTS_TABLE = 'asr_transcription_requests'
const ASR_HANDOFF_TTL_MS = 15 * 60 * 1000
export const ASR_AUDIO_MAX_BYTES = 20 * 1024 * 1024
export const ASR_MAX_DURATION_SECONDS = 10 * 60
const ASR_RESERVATION_CREDITS_PER_SECOND = 10
const FILETRANS_FLOOR_CREDITS_PER_SECOND = 4
const FILETRANS_INPUT_UNIT_PRICE_CNY_PER_SECOND = 0.00022

const memoryStorage: StorageObjectMemory = new Map()
const initializedSchemas = new WeakSet<D1Database>()

export type AsrRequestStatus = 'pending' | 'reserved' | 'dispatching' | 'settled' | 'released' | 'failed'

export interface AsrRequestRecord {
  id: string
  userId: string
  providerId: string
  capability: string
  idempotencyKey: string
  requestHash: string
  objectKey: string
  contentType: string
  byteSize: number
  durationSeconds: number
  deliveryTokenHash: string
  deliveryExpiresAt: string
  providerTaskId: string | null
  status: AsrRequestStatus
  reservedCredits: number
  chargedCredits: number | null
  billedSeconds: number | null
  providerCostCny: number | null
  failureCode: string | null
  createdAt: string
  updatedAt: string
}

interface AsrRequestRow {
  id: string
  user_id: string
  provider_id: string
  capability: string
  idempotency_key: string
  request_hash: string
  object_key: string
  content_type: string
  byte_size: number
  duration_seconds: number
  delivery_token_hash: string
  delivery_expires_at: string
  provider_task_id: string | null
  status: string
  reserved_credits: number
  charged_credits: number | null
  billed_seconds: number | null
  provider_cost_cny: number | null
  failure_code: string | null
  created_at: string
  updated_at: string
}

export interface CreateAsrRequestInput {
  userId: string
  providerId: string
  idempotencyKey: string
  audio: Buffer
  contentType: string
  durationSeconds: number
}

export interface CreatedAsrRequest {
  request: AsrRequestRecord
  deliveryToken: string | null
  created: boolean
}

function getD1Database(event: H3Event): D1Database {
  const database = readCloudflareBindings(event)?.DB
  if (!database)
    throw createError({ statusCode: 500, statusMessage: 'ASR storage is unavailable.' })
  return database
}

function getAsrBucket(event: H3Event): R2Bucket | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.ASSETS ?? bindings?.R2 ?? null
}

async function ensureAsrSchema(database: D1Database) {
  if (initializedSchemas.has(database))
    return

  await database.prepare(`
    CREATE TABLE IF NOT EXISTS ${ASR_REQUESTS_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      object_key TEXT NOT NULL,
      content_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      delivery_token_hash TEXT NOT NULL,
      delivery_expires_at TEXT NOT NULL,
      provider_task_id TEXT,
      status TEXT NOT NULL,
      reserved_credits INTEGER NOT NULL DEFAULT 0,
      charged_credits INTEGER,
      billed_seconds INTEGER,
      provider_cost_cny REAL,
      failure_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, idempotency_key)
    );
  `).run()
  await database.prepare(`CREATE INDEX IF NOT EXISTS idx_asr_transcription_handoff ON ${ASR_REQUESTS_TABLE}(id, status, delivery_expires_at);`).run()
  await database.prepare(`CREATE INDEX IF NOT EXISTS idx_asr_transcription_provider_task ON ${ASR_REQUESTS_TABLE}(provider_task_id);`).run()
  initializedSchemas.add(database)
}

function mapRequest(row: AsrRequestRow): AsrRequestRecord {
  const status = row.status
  if (status !== 'pending' && status !== 'reserved' && status !== 'dispatching' && status !== 'settled' && status !== 'released' && status !== 'failed')
    throw new Error('ASR_REQUEST_STATE_INVALID')

  return {
    id: row.id,
    userId: row.user_id,
    providerId: row.provider_id,
    capability: row.capability,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    objectKey: row.object_key,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    durationSeconds: Number(row.duration_seconds),
    deliveryTokenHash: row.delivery_token_hash,
    deliveryExpiresAt: row.delivery_expires_at,
    providerTaskId: row.provider_task_id,
    status,
    reservedCredits: Number(row.reserved_credits),
    chargedCredits: row.charged_credits == null ? null : Number(row.charged_credits),
    billedSeconds: row.billed_seconds == null ? null : Number(row.billed_seconds),
    providerCostCny: row.provider_cost_cny == null ? null : Number(row.provider_cost_cny),
    failureCode: row.failure_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function assertAsrId(value: string): string {
  if (!/^asr_[0-9a-f-]{36}$/i.test(value))
    throw createError({ statusCode: 404, statusMessage: 'ASR request was not found.' })
  return value
}

export function normalizeAsrIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value.trim())) {
    throw createError({ statusCode: 400, statusMessage: 'ASR idempotency key is invalid.' })
  }
  return value.trim()
}
export function normalizeAsrContentType(value: unknown): string {
  const mediaType = typeof value === 'string' ? value.split(';', 1)[0]?.trim().toLowerCase() : ''
  if (mediaType !== 'audio/wav') {
    throw createError({ statusCode: 415, statusMessage: 'Only audio/wav is supported for Filetrans admission.' })
  }
  return 'audio/wav'
}

function hashHex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function compareToken(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashHex(token), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected)
}

/**
 * Filetrans charges audio seconds, while word-only billing would make silence
 * free even though DashScope billed it. Normalization lives here so admission
 * and final settlement cannot drift.
 */
export function countTranscriptUnits(transcript: string): number {
  let units = 0
  let latinWord = false
  for (const character of transcript.normalize('NFKC')) {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)) {
      units += 1
      latinWord = false
      continue
    }
    if (/\p{L}|\p{N}/u.test(character)) {
      latinWord = true
      continue
    }
    if (latinWord) {
      units += 2
      latinWord = false
    }
  }
  if (latinWord)
    units += 2
  return units
}

export function calculateFiletransCredits(transcript: string, billedSeconds: number): number {
  if (!Number.isFinite(billedSeconds) || billedSeconds <= 0)
    throw new Error('ASR_PROVIDER_METERING_INVALID')
  return Math.ceil(Math.max(countTranscriptUnits(transcript), billedSeconds * FILETRANS_FLOOR_CREDITS_PER_SECOND))
}

export function calculateFiletransReservation(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > ASR_MAX_DURATION_SECONDS)
    throw createError({ statusCode: 400, statusMessage: 'Audio duration is invalid.' })
  return Math.ceil(durationSeconds * ASR_RESERVATION_CREDITS_PER_SECOND)
}

export function calculateFiletransProviderCost(billedSeconds: number): number {
  if (!Number.isFinite(billedSeconds) || billedSeconds <= 0)
    throw new Error('ASR_PROVIDER_METERING_INVALID')
  return Number((billedSeconds * FILETRANS_INPUT_UNIT_PRICE_CNY_PER_SECOND).toFixed(8))
}

/** Parses only canonical RIFF/WAVE PCM-style headers; compressed/unknown input is rejected before storage. */
export function parseWavDurationSeconds(audio: Buffer): number {
  if (audio.byteLength < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') {
    throw createError({ statusCode: 400, statusMessage: 'Audio must be a valid WAV container.' })
  }

  let offset = 12
  let byteRate: number | null = null
  let dataBytes: number | null = null
  while (offset + 8 <= audio.byteLength) {
    const chunkId = audio.toString('ascii', offset, offset + 4)
    const chunkLength = audio.readUInt32LE(offset + 4)
    const valueOffset = offset + 8
    if (valueOffset + chunkLength > audio.byteLength)
      throw createError({ statusCode: 400, statusMessage: 'Audio WAV chunks are invalid.' })
    if (chunkId === 'fmt ' && chunkLength >= 16) {
      const format = audio.readUInt16LE(valueOffset)
      const channels = audio.readUInt16LE(valueOffset + 2)
      byteRate = audio.readUInt32LE(valueOffset + 8)
      if ((format !== 1 && format !== 3) || channels < 1 || channels > 2 || !byteRate) {
        throw createError({ statusCode: 400, statusMessage: 'Audio WAV format is unsupported.' })
      }
    }
    if (chunkId === 'data')
      dataBytes = chunkLength
    offset = valueOffset + chunkLength + (chunkLength % 2)
  }

  if (!byteRate || !dataBytes)
    throw createError({ statusCode: 400, statusMessage: 'Audio WAV duration is unavailable.' })

  const durationSeconds = dataBytes / byteRate
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > ASR_MAX_DURATION_SECONDS) {
    throw createError({ statusCode: 400, statusMessage: 'Audio duration exceeds the Filetrans limit.' })
  }
  return durationSeconds
}

export async function getAsrRequest(event: H3Event, requestId: string): Promise<AsrRequestRecord | null> {
  const database = getD1Database(event)
  await ensureAsrSchema(database)
  const row = await database.prepare(`SELECT * FROM ${ASR_REQUESTS_TABLE} WHERE id = ?`).bind(assertAsrId(requestId)).first<AsrRequestRow>()
  return row ? mapRequest(row) : null
}

export async function createAsrRequest(event: H3Event, input: CreateAsrRequestInput): Promise<CreatedAsrRequest> {
  const database = getD1Database(event)
  await ensureAsrSchema(database)
  const idempotencyKey = normalizeAsrIdempotencyKey(input.idempotencyKey)
  const requestHash = hashHex(Buffer.concat([Buffer.from(input.contentType), input.audio]))
  const existing = await database.prepare(`
    SELECT * FROM ${ASR_REQUESTS_TABLE}
    WHERE user_id = ? AND idempotency_key = ?
    LIMIT 1
  `).bind(input.userId, idempotencyKey).first<AsrRequestRow>()
  if (existing) {
    const request = mapRequest(existing)
    if (request.requestHash !== requestHash)
      throw createError({ statusCode: 409, statusMessage: 'ASR idempotency key conflicts with another audio payload.' })
    return { request, deliveryToken: null, created: false }
  }

  const durationSeconds = Number(input.durationSeconds)
  const reservedCredits = calculateFiletransReservation(durationSeconds)
  const id = `asr_${randomUUID()}`
  const deliveryToken = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ASR_HANDOFF_TTL_MS)
  const objectKey = `asr-handoff/${id}/source.wav`
  const record = {
    id,
    userId: input.userId,
    providerId: input.providerId,
    capability: 'audio.transcribe',
    idempotencyKey,
    requestHash,
    objectKey,
    contentType: input.contentType,
    byteSize: input.audio.byteLength,
    durationSeconds,
    deliveryTokenHash: hashHex(deliveryToken),
    deliveryExpiresAt: expiresAt.toISOString(),
    providerTaskId: null,
    status: 'pending' as const,
    reservedCredits,
    chargedCredits: null,
    billedSeconds: null,
    providerCostCny: null,
    failureCode: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }

  const insert = await database.prepare(`
    INSERT INTO ${ASR_REQUESTS_TABLE} (
      id, user_id, provider_id, capability, idempotency_key, request_hash, object_key, content_type,
      byte_size, duration_seconds, delivery_token_hash, delivery_expires_at, provider_task_id, status,
      reserved_credits, charged_credits, billed_seconds, provider_cost_cny, failure_code, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    record.id, record.userId, record.providerId, record.capability, record.idempotencyKey, record.requestHash,
    record.objectKey, record.contentType, record.byteSize, record.durationSeconds, record.deliveryTokenHash,
    record.deliveryExpiresAt, record.providerTaskId, record.status, record.reservedCredits, record.chargedCredits,
    record.billedSeconds, record.providerCostCny, record.failureCode, record.createdAt, record.updatedAt,
  ).run()
  if (Number(insert.meta?.changes ?? 0) !== 1)
    throw createError({ statusCode: 500, statusMessage: 'ASR request could not be created.' })

  try {
    await putStorageObject({
      event,
      bucket: getAsrBucket(event),
      memoryStorage,
      key: objectKey,
      data: input.audio,
      contentType: input.contentType,
      actorId: input.userId,
      ownerId: input.userId,
      resourceType: 'asr-handoff',
    })
  }
  catch (error) {
    await database.prepare(`DELETE FROM ${ASR_REQUESTS_TABLE} WHERE id = ?`).bind(id).run()
    throw error
  }

  return { request: record, deliveryToken, created: true }
}

export async function markAsrReserved(event: H3Event, requestId: string): Promise<AsrRequestRecord> {
  return await transitionAsrRequest(event, requestId, ['pending'], 'reserved')
}

export async function markAsrDispatching(event: H3Event, requestId: string, providerTaskId: string): Promise<AsrRequestRecord> {
  if (!/^[A-Za-z0-9._:-]{1,255}$/.test(providerTaskId))
    throw new Error('ASR_PROVIDER_TASK_ID_INVALID')
  return await transitionAsrRequest(event, requestId, ['reserved'], 'dispatching', { providerTaskId })
}

export async function markAsrSettled(event: H3Event, requestId: string, chargedCredits: number, billedSeconds: number, providerCostCny: number): Promise<AsrRequestRecord> {
  if (!Number.isInteger(chargedCredits) || chargedCredits <= 0 || !Number.isFinite(billedSeconds) || billedSeconds <= 0 || !Number.isFinite(providerCostCny) || providerCostCny < 0)
    throw new Error('ASR_SETTLEMENT_INVALID')
  return await transitionAsrRequest(event, requestId, ['dispatching'], 'settled', { chargedCredits, billedSeconds, providerCostCny })
}

export async function markAsrReleased(event: H3Event, requestId: string, failureCode: string): Promise<AsrRequestRecord> {
  if (!/^[A-Z0-9_]{3,120}$/.test(failureCode))
    throw new Error('ASR_FAILURE_CODE_INVALID')
  return await transitionAsrRequest(event, requestId, ['pending', 'reserved', 'dispatching'], 'released', { failureCode })
}

export async function markAsrFailed(event: H3Event, requestId: string, failureCode: string): Promise<AsrRequestRecord> {
  if (!/^[A-Z0-9_]{3,120}$/.test(failureCode))
    throw new Error('ASR_FAILURE_CODE_INVALID')
  return await transitionAsrRequest(event, requestId, ['reserved', 'dispatching'], 'failed', { failureCode })
}

async function transitionAsrRequest(
  event: H3Event,
  requestId: string,
  from: readonly AsrRequestStatus[],
  to: AsrRequestStatus,
  fields: { providerTaskId?: string, chargedCredits?: number, billedSeconds?: number, providerCostCny?: number, failureCode?: string } = {},
): Promise<AsrRequestRecord> {
  const database = getD1Database(event)
  await ensureAsrSchema(database)
  const id = assertAsrId(requestId)
  const now = new Date().toISOString()
  const placeholders = from.map(() => '?').join(', ')
  const result = await database.prepare(`
    UPDATE ${ASR_REQUESTS_TABLE}
    SET status = ?, provider_task_id = COALESCE(?, provider_task_id), charged_credits = COALESCE(?, charged_credits),
      billed_seconds = COALESCE(?, billed_seconds), provider_cost_cny = COALESCE(?, provider_cost_cny), failure_code = COALESCE(?, failure_code), updated_at = ?
    WHERE id = ? AND status IN (${placeholders})
  `).bind(to, fields.providerTaskId ?? null, fields.chargedCredits ?? null, fields.billedSeconds ?? null, fields.providerCostCny ?? null, fields.failureCode ?? null, now, id, ...from).run()
  if (Number(result.meta?.changes ?? 0) !== 1)
    throw new Error('ASR_REQUEST_STATE_CONFLICT')
  const request = await getAsrRequest(event, id)
  if (!request)
    throw new Error('ASR_REQUEST_MISSING')
  return request
}

export async function getAsrHandoffObject(event: H3Event, requestId: string, token: string): Promise<{ data: Buffer, contentType: string } | null> {
  const request = await getAsrRequest(event, requestId)
  if (!request || (request.status !== 'reserved' && request.status !== 'dispatching'))
    return null
  if (Date.parse(request.deliveryExpiresAt) <= Date.now() || !compareToken(token, request.deliveryTokenHash))
    return null

  const object = await getStorageObject({
    event,
    bucket: getAsrBucket(event),
    memoryStorage,
    key: request.objectKey,
    resourceType: 'asr-handoff',
  })
  if (!object || !object.storesOwnership || object.ownerId !== request.userId)
    return null
  return { data: object.data, contentType: request.contentType }
}

export async function deleteAsrHandoffObject(event: H3Event, request: AsrRequestRecord): Promise<void> {
  await deleteStorageObject({
    event,
    bucket: getAsrBucket(event),
    memoryStorage,
    key: request.objectKey,
    actorId: request.userId,
    resourceType: 'asr-handoff',
  })
}

export function toAsrSafeStatus(request: AsrRequestRecord) {
  return {
    requestId: request.id,
    status: request.status,
    creditsCharged: request.chargedCredits,
    billedSeconds: request.billedSeconds,
    failureCode: request.failureCode,
  }
}
