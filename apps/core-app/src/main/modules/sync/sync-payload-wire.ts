import type { SyncItemInput, SyncItemOutput } from '@talex-touch/utils/types/cloud-sync'
import { Buffer } from 'node:buffer'
import { decryptSyncPayload, type DecryptedSyncPayload } from './sync-payload-crypto'

export const STORAGE_ITEM_PREFIX = 'storage::'
export const STORAGE_ITEM_TYPE = 'storage.snapshot'
export const STORAGE_SCHEMA_VERSION = 1

export interface StorageSyncSnapshot {
  qualifiedName: string
  itemId: string
  payloadEnc: string
  payloadSize: number
  contentHash: string
  cryptoVersion: string
  keyId: string
  rawText: string
}

export interface SyncPayloadBlobClient {
  downloadBlob: (blobId: string) => Promise<{
    data: ArrayBuffer
  }>
}

export type SyncPayloadDecryptor = (payloadEnc: string) => Promise<DecryptedSyncPayload>

export async function resolveEncryptedPayloadText(
  item: SyncItemOutput,
  client: SyncPayloadBlobClient,
  decryptPayload: SyncPayloadDecryptor = decryptSyncPayload
): Promise<DecryptedSyncPayload | null> {
  if (item.payload_enc) {
    return decryptPayload(item.payload_enc)
  }

  if (!item.payload_ref || !item.payload_ref.startsWith('blob:')) {
    return null
  }

  const blobId = item.payload_ref.slice('blob:'.length).trim()
  if (!blobId) {
    return null
  }

  const blob = await client.downloadBlob(blobId)
  const payloadEnc = Buffer.from(new Uint8Array(blob.data)).toString('utf-8')
  return decryptPayload(payloadEnc)
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
      content_hash: snapshot.contentHash,
      crypto_version: snapshot.cryptoVersion,
      key_id: snapshot.keyId
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
      content_hash: snapshot.contentHash,
      crypto_version: snapshot.cryptoVersion,
      key_id: snapshot.keyId
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

export function extractQualifiedName(item: SyncItemOutput): string {
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

export function extractContentHash(item: SyncItemOutput): string {
  if (!item.meta_plain || typeof item.meta_plain !== 'object') {
    return ''
  }

  const hash = (item.meta_plain as { content_hash?: unknown }).content_hash
  return typeof hash === 'string' ? hash.trim() : ''
}
