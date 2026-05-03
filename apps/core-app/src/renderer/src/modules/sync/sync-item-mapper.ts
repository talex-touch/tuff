import type { CloudSyncSDK, SyncItemInput } from '@talex-touch/utils'
const DISABLED_REASON =
  'Renderer sync-item-mapper is retired. Sync payload encryption is main-process only.'

const STORAGE_ITEM_PREFIX = 'storage::'
const STORAGE_SCHEMA_VERSION = 1
export const PLUGIN_SYNC_QUALIFIED_PREFIX = 'plugin::'
export const PLUGIN_SYNC_ALL_SCOPE = `${PLUGIN_SYNC_QUALIFIED_PREFIX}__all__`

export interface StorageSyncSnapshot {
  qualifiedName: string
  itemId: string
  payloadEnc: string
  payloadSize: number
  contentHash: string
  rawText: string
}

export function encodeSyncPayload(rawText: string): string {
  void rawText
  throw new Error(DISABLED_REASON)
}

export function decodeSyncPayload(payloadEnc: string): string {
  void payloadEnc
  throw new Error(DISABLED_REASON)
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

export async function collectStorageSnapshots(
  qualifiedNames?: Iterable<string>
): Promise<StorageSyncSnapshot[]> {
  void qualifiedNames
  throw new Error(DISABLED_REASON)
}

export function buildSyncItemFromSnapshot(
  snapshot: StorageSyncSnapshot,
  opSeq: number,
  updatedAt: string
): SyncItemInput {
  void snapshot
  void opSeq
  void updatedAt
  throw new Error(DISABLED_REASON)
}

export function buildBlobSyncItem(
  snapshot: StorageSyncSnapshot,
  opSeq: number,
  updatedAt: string,
  blobId: string
): SyncItemInput {
  void snapshot
  void opSeq
  void updatedAt
  void blobId
  throw new Error(DISABLED_REASON)
}

export function buildDeletedSyncItem(
  qualifiedName: string,
  opSeq: number,
  updatedAt: string,
  opHash: string
): SyncItemInput {
  return {
    item_id: `${STORAGE_ITEM_PREFIX}${qualifiedName}`,
    type: 'storage.snapshot',
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

export async function applyPulledStorageItems(
  items: unknown[],
  sdk: CloudSyncSDK
): Promise<number> {
  void items
  void sdk
  throw new Error(DISABLED_REASON)
}

export function isLargeSnapshot(snapshot: StorageSyncSnapshot, thresholdBytes: number): boolean {
  return snapshot.payloadSize > thresholdBytes
}
