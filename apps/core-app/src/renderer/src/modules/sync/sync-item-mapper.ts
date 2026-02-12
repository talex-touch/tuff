import type { CloudSyncSDK, SyncItemInput, SyncItemOutput } from '@talex-touch/utils'
import { storages } from '@talex-touch/utils/renderer'

const STORAGE_ITEM_PREFIX = 'storage::'
const STORAGE_ITEM_TYPE = 'storage.snapshot'
const STORAGE_SCHEMA_VERSION = 1

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export interface StorageSyncSnapshot {
  qualifiedName: string
  itemId: string
  payloadEnc: string
  payloadSize: number
  contentHash: string
  rawText: string
}

function toBase64(value: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < value.length; i += chunkSize) {
    binary += String.fromCharCode(...value.slice(i, i + chunkSize))
  }
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function encodeSyncPayload(rawText: string): string {
  const bytes = textEncoder.encode(rawText)
  return `b64:${toBase64(bytes)}`
}

export function decodeSyncPayload(payloadEnc: string): string {
  const normalized = payloadEnc.trim()
  if (!normalized) {
    return ''
  }
  if (!normalized.startsWith('b64:')) {
    return normalized
  }
  const base64 = normalized.slice(4)
  return textDecoder.decode(fromBase64(base64))
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function getStorageNames(): string[] {
  return Array.from(storages.keys())
}

export async function collectStorageSnapshots(
  qualifiedNames?: Iterable<string>
): Promise<StorageSyncSnapshot[]> {
  const targetNames = qualifiedNames ? Array.from(new Set(qualifiedNames)) : getStorageNames()
  const snapshots: StorageSyncSnapshot[] = []

  for (const qualifiedName of targetNames) {
    const storage = storages.get(qualifiedName)
    if (!storage) {
      continue
    }

    const raw = storage.get()
    if (!raw || typeof raw !== 'object') {
      continue
    }

    const rawText = JSON.stringify(raw)
    const payloadEnc = encodeSyncPayload(rawText)
    const payloadSize = textEncoder.encode(payloadEnc).byteLength
    const contentHash = await sha256Hex(rawText)

    snapshots.push({
      qualifiedName,
      itemId: `${STORAGE_ITEM_PREFIX}${qualifiedName}`,
      payloadEnc,
      payloadSize,
      contentHash,
      rawText
    })
  }

  return snapshots
}

export function buildSyncItemFromSnapshot(
  snapshot: StorageSyncSnapshot,
  opSeq: number,
  updatedAt: string
): SyncItemInput {
  return {
    item_id: snapshot.itemId,
    type: STORAGE_ITEM_TYPE,
    schema_version: STORAGE_SCHEMA_VERSION,
    payload_enc: snapshot.payloadEnc,
    payload_ref: null,
    meta_plain: {
      qualified_name: snapshot.qualifiedName,
      schema_version: STORAGE_SCHEMA_VERSION,
      payload_size: snapshot.payloadSize,
      content_hash: snapshot.contentHash
    },
    payload_size: snapshot.payloadSize,
    updated_at: updatedAt,
    deleted_at: null,
    op_seq: opSeq,
    op_hash: snapshot.contentHash,
    op_type: 'upsert'
  }
}

export function buildBlobSyncItem(
  snapshot: StorageSyncSnapshot,
  opSeq: number,
  updatedAt: string,
  blobId: string
): SyncItemInput {
  return {
    item_id: snapshot.itemId,
    type: STORAGE_ITEM_TYPE,
    schema_version: STORAGE_SCHEMA_VERSION,
    payload_enc: null,
    payload_ref: `blob:${blobId}`,
    meta_plain: {
      qualified_name: snapshot.qualifiedName,
      schema_version: STORAGE_SCHEMA_VERSION,
      payload_size: snapshot.payloadSize,
      content_hash: snapshot.contentHash
    },
    payload_size: snapshot.payloadSize,
    updated_at: updatedAt,
    deleted_at: null,
    op_seq: opSeq,
    op_hash: snapshot.contentHash,
    op_type: 'upsert'
  }
}

async function resolvePayloadText(item: SyncItemOutput, sdk: CloudSyncSDK): Promise<string | null> {
  if (item.payload_enc) {
    return decodeSyncPayload(item.payload_enc)
  }

  if (!item.payload_ref || !item.payload_ref.startsWith('blob:')) {
    return null
  }

  const blobId = item.payload_ref.slice('blob:'.length).trim()
  if (!blobId) {
    return null
  }

  const blob = await sdk.downloadBlob(blobId)
  return decodeSyncPayload(textDecoder.decode(new Uint8Array(blob.data)))
}

function extractQualifiedName(item: SyncItemOutput): string {
  const fromMeta =
    item.meta_plain && typeof item.meta_plain === 'object' && 'qualified_name' in item.meta_plain
      ? String((item.meta_plain as { qualified_name?: unknown }).qualified_name ?? '').trim()
      : ''
  if (fromMeta) {
    return fromMeta
  }

  if (!item.item_id.startsWith(STORAGE_ITEM_PREFIX)) {
    return ''
  }
  return item.item_id.slice(STORAGE_ITEM_PREFIX.length).trim()
}

export async function applyPulledStorageItems(
  items: SyncItemOutput[],
  sdk: CloudSyncSDK
): Promise<number> {
  let appliedCount = 0

  for (const item of items) {
    if (item.type !== STORAGE_ITEM_TYPE) {
      continue
    }

    const qualifiedName = extractQualifiedName(item)
    if (!qualifiedName) {
      continue
    }

    const storage = storages.get(qualifiedName)
    if (!storage) {
      continue
    }

    if (item.deleted_at) {
      continue
    }

    const payloadText = await resolvePayloadText(item, sdk)
    if (!payloadText) {
      continue
    }

    try {
      const parsed = JSON.parse(payloadText) as Record<string, unknown>
      storage.applyRemoteSnapshot(parsed)
      appliedCount += 1
    } catch (error) {
      console.warn(
        `[AutoSync] Failed to apply remote storage snapshot for "${qualifiedName}"`,
        error
      )
    }
  }

  return appliedCount
}

export function isLargeSnapshot(snapshot: StorageSyncSnapshot, thresholdBytes: number): boolean {
  return snapshot.payloadSize > thresholdBytes
}
