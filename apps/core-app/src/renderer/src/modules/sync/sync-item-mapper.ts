import type { CloudSyncSDK, SyncItemInput, SyncItemOutput } from '@talex-touch/utils'
import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import { hasWindow } from '@talex-touch/utils/env'
import { storages } from '@talex-touch/utils/renderer'

const STORAGE_ITEM_PREFIX = 'storage::'
const STORAGE_ITEM_TYPE = 'storage.snapshot'
const STORAGE_SCHEMA_VERSION = 1
export const PLUGIN_SYNC_QUALIFIED_PREFIX = 'plugin::'
export const PLUGIN_SYNC_ALL_SCOPE = `${PLUGIN_SYNC_QUALIFIED_PREFIX}__all__`

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

interface PluginStorageSyncItemPayload {
  pluginName: string
  fileName: string
  qualifiedName: string
  content: unknown
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

function getRendererChannel(): ITouchClientChannel | null {
  if (!hasWindow() || !window.$channel) {
    return null
  }
  return window.$channel
}

export function isPluginStorageQualifiedName(value: string): boolean {
  return value.startsWith(PLUGIN_SYNC_QUALIFIED_PREFIX)
}

export function buildPluginStorageQualifiedName(pluginName: string, fileName?: string): string {
  const normalizedPluginName = pluginName.trim()
  const normalizedFileName = typeof fileName === 'string' ? fileName.trim() : ''
  if (!normalizedPluginName) {
    return ''
  }
  return normalizedFileName
    ? `${PLUGIN_SYNC_QUALIFIED_PREFIX}${normalizedPluginName}::${normalizedFileName}`
    : `${PLUGIN_SYNC_QUALIFIED_PREFIX}${normalizedPluginName}::`
}

export function parsePluginStorageQualifiedName(
  qualifiedName: string
): { pluginName: string; fileName?: string } | null {
  const normalized = qualifiedName.trim()
  if (!isPluginStorageQualifiedName(normalized) || normalized === PLUGIN_SYNC_ALL_SCOPE) {
    return null
  }

  const body = normalized.slice(PLUGIN_SYNC_QUALIFIED_PREFIX.length)
  const separatorIndex = body.indexOf('::')
  if (separatorIndex < 0) {
    return null
  }

  const pluginName = body.slice(0, separatorIndex).trim()
  const fileName = body.slice(separatorIndex + 2).trim()
  if (!pluginName) {
    return null
  }

  return {
    pluginName,
    fileName: fileName || undefined
  }
}

async function listPluginSyncItems(
  qualifiedNames?: string[]
): Promise<PluginStorageSyncItemPayload[]> {
  const channel = getRendererChannel()
  if (!channel) {
    return []
  }

  try {
    const payload = qualifiedNames && qualifiedNames.length > 0 ? { qualifiedNames } : undefined
    const response = await channel.send('plugin:storage:list-sync-items', payload)
    if (!Array.isArray(response)) {
      return []
    }

    return response.filter((item): item is PluginStorageSyncItemPayload => {
      if (!item || typeof item !== 'object') {
        return false
      }
      return (
        typeof (item as { pluginName?: unknown }).pluginName === 'string' &&
        typeof (item as { fileName?: unknown }).fileName === 'string' &&
        typeof (item as { qualifiedName?: unknown }).qualifiedName === 'string'
      )
    })
  } catch (error) {
    console.warn('[AutoSync] Failed to list plugin sync items', error)
    return []
  }
}

function getStorageNames(): string[] {
  return Array.from(storages.keys())
}

export async function collectStorageSnapshots(
  qualifiedNames?: Iterable<string>
): Promise<StorageSyncSnapshot[]> {
  const targetNames = qualifiedNames ? Array.from(new Set(qualifiedNames)) : getStorageNames()
  const localTargetNames = targetNames.filter((name) => !isPluginStorageQualifiedName(name))
  const includeAllPluginItems = !qualifiedNames || targetNames.includes(PLUGIN_SYNC_ALL_SCOPE)
  const pluginTargetNames = includeAllPluginItems
    ? undefined
    : targetNames.filter((name) => isPluginStorageQualifiedName(name))
  const snapshots: StorageSyncSnapshot[] = []

  for (const qualifiedName of localTargetNames) {
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

  if (includeAllPluginItems || (pluginTargetNames && pluginTargetNames.length > 0)) {
    const pluginItems = await listPluginSyncItems(pluginTargetNames)
    for (const item of pluginItems) {
      const normalizedQualifiedName = item.qualifiedName.trim()
      if (!normalizedQualifiedName || !isPluginStorageQualifiedName(normalizedQualifiedName)) {
        continue
      }
      const content = item.content && typeof item.content === 'object' ? item.content : {}
      const rawText = JSON.stringify(content)
      const payloadEnc = encodeSyncPayload(rawText)
      const payloadSize = textEncoder.encode(payloadEnc).byteLength
      const contentHash = await sha256Hex(rawText)

      snapshots.push({
        qualifiedName: normalizedQualifiedName,
        itemId: `${STORAGE_ITEM_PREFIX}${normalizedQualifiedName}`,
        payloadEnc,
        payloadSize,
        contentHash,
        rawText
      })
    }
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

export function buildDeletedSyncItem(
  qualifiedName: string,
  opSeq: number,
  updatedAt: string,
  opHash: string
): SyncItemInput {
  return {
    item_id: `${STORAGE_ITEM_PREFIX}${qualifiedName}`,
    type: STORAGE_ITEM_TYPE,
    schema_version: STORAGE_SCHEMA_VERSION,
    payload_enc: null,
    payload_ref: null,
    meta_plain: {
      qualified_name: qualifiedName,
      schema_version: STORAGE_SCHEMA_VERSION,
      payload_size: 0,
      content_hash: opHash
    },
    payload_size: 0,
    updated_at: updatedAt,
    deleted_at: updatedAt,
    op_seq: opSeq,
    op_hash: opHash,
    op_type: 'delete'
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

function extractContentHash(item: SyncItemOutput): string {
  if (!item.meta_plain || typeof item.meta_plain !== 'object') {
    return ''
  }

  const hash = (item.meta_plain as { content_hash?: unknown }).content_hash
  return typeof hash === 'string' ? hash.trim() : ''
}

async function applyPluginStorageSnapshot(
  qualifiedName: string,
  payloadText: string,
  expectedHash: string
): Promise<boolean> {
  const parsedQualifiedName = parsePluginStorageQualifiedName(qualifiedName)
  if (!parsedQualifiedName || !parsedQualifiedName.fileName) {
    return false
  }

  let parsedPayload: unknown
  try {
    parsedPayload = JSON.parse(payloadText)
  } catch (error) {
    console.warn(`[AutoSync] Failed to parse plugin payload for "${qualifiedName}"`, error)
    return false
  }

  try {
    const localItems = await listPluginSyncItems([qualifiedName])
    const localItem = localItems.find((item) => item.qualifiedName === qualifiedName)
    if (localItem) {
      const localText = JSON.stringify(
        localItem.content && typeof localItem.content === 'object' ? localItem.content : {}
      )
      if (localText === payloadText) {
        return false
      }
      if (expectedHash) {
        const localHash = await sha256Hex(localText)
        if (localHash === expectedHash) {
          return false
        }
      }
    }
  } catch (error) {
    console.warn(`[AutoSync] Failed to compare local plugin payload for "${qualifiedName}"`, error)
  }

  const channel = getRendererChannel()
  if (!channel) {
    return false
  }

  const result = await channel.send('plugin:storage:apply-sync-item', {
    pluginName: parsedQualifiedName.pluginName,
    fileName: parsedQualifiedName.fileName,
    content: parsedPayload
  })

  if (result && typeof result === 'object' && (result as { success?: unknown }).success === true) {
    return true
  }

  const message =
    result && typeof result === 'object' && 'error' in result
      ? String((result as { error?: unknown }).error ?? 'Unknown error')
      : 'Unknown error'
  console.warn(`[AutoSync] Failed to apply plugin snapshot for "${qualifiedName}": ${message}`)
  return false
}

async function applyPluginStorageDeletion(qualifiedName: string): Promise<boolean> {
  const parsedQualifiedName = parsePluginStorageQualifiedName(qualifiedName)
  if (!parsedQualifiedName || !parsedQualifiedName.fileName) {
    return false
  }

  const channel = getRendererChannel()
  if (!channel) {
    return false
  }

  const result = await channel.send('plugin:storage:delete-sync-item', {
    pluginName: parsedQualifiedName.pluginName,
    fileName: parsedQualifiedName.fileName
  })

  if (result && typeof result === 'object' && (result as { success?: unknown }).success === true) {
    return true
  }

  const message =
    result && typeof result === 'object' && 'error' in result
      ? String((result as { error?: unknown }).error ?? 'Unknown error')
      : 'Unknown error'
  console.warn(`[AutoSync] Failed to apply plugin deletion for "${qualifiedName}": ${message}`)
  return false
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

    if (isPluginStorageQualifiedName(qualifiedName)) {
      if (item.deleted_at) {
        const removed = await applyPluginStorageDeletion(qualifiedName)
        if (removed) {
          appliedCount += 1
        }
        continue
      }

      const payloadText = await resolvePayloadText(item, sdk)
      if (!payloadText) {
        continue
      }

      const applied = await applyPluginStorageSnapshot(
        qualifiedName,
        payloadText,
        extractContentHash(item)
      )
      if (applied) {
        appliedCount += 1
      }
      continue
    }

    if (item.deleted_at) {
      continue
    }

    const payloadText = await resolvePayloadText(item, sdk)
    if (!payloadText) {
      continue
    }

    const storage = storages.get(qualifiedName)
    if (!storage) {
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
