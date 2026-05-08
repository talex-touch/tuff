import type { SyncItemOutput } from '@talex-touch/utils/types/cloud-sync'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { SyncPayloadCrypto } from './sync-payload-crypto'
import {
  buildBlobSyncItem,
  buildSyncItemFromSnapshot,
  resolveEncryptedPayloadText,
  type StorageSyncSnapshot
} from './sync-payload-wire'
import type { SyncPayloadCryptoStore } from './sync-payload-crypto'

function createMemoryStore(): SyncPayloadCryptoStore {
  const values = new Map<string, string>()
  return {
    isAvailable: () => true,
    getValue: async (key) => values.get(key) ?? null,
    setValue: async (key, value) => {
      if (value === null) {
        values.delete(key)
      } else {
        values.set(key, value)
      }
      return true
    }
  }
}

function buildOutput(overrides: Partial<SyncItemOutput>): SyncItemOutput {
  return {
    item_id: 'storage::app-setting',
    type: 'storage.snapshot',
    schema_version: 1,
    payload_enc: null,
    payload_ref: null,
    meta_plain: null,
    payload_size: null,
    updated_at: '2026-05-03T00:00:00.000Z',
    deleted_at: null,
    device_id: 'device-1',
    ...overrides
  }
}

describe('sync payload wire format', () => {
  it('builds small sync items with enc:v1 payloads and non-business metadata', async () => {
    const crypto = new SyncPayloadCrypto(createMemoryStore())
    const rawText = JSON.stringify({ secret: 'plain-business-value' })
    const encrypted = await crypto.encrypt(rawText)
    const snapshot: StorageSyncSnapshot = {
      qualifiedName: 'app-setting',
      itemId: 'storage::app-setting',
      payloadEnc: encrypted.payloadEnc,
      payloadSize: encrypted.payloadEnc.length,
      contentHash: 'content-hash',
      cryptoVersion: encrypted.cryptoVersion,
      keyId: encrypted.keyId,
      rawText
    }

    const item = buildSyncItemFromSnapshot(snapshot, 1, '2026-05-03T00:00:00.000Z')

    expect(item.payload_enc).toMatch(/^enc:v1:/)
    expect(item.payload_enc).not.toContain('plain-business-value')
    expect(item.meta_plain).toEqual({
      qualified_name: 'app-setting',
      schema_version: 1,
      payload_size: encrypted.payloadEnc.length,
      content_hash: 'content-hash',
      crypto_version: 'enc:v1',
      key_id: encrypted.keyId
    })
  })

  it('stores large blob content as encrypted text and decrypts it through the wire helper', async () => {
    const crypto = new SyncPayloadCrypto(createMemoryStore())
    const rawText = JSON.stringify({ secret: 'large-business-value' })
    const encrypted = await crypto.encrypt(rawText)
    const snapshot: StorageSyncSnapshot = {
      qualifiedName: 'app-setting',
      itemId: 'storage::app-setting',
      payloadEnc: encrypted.payloadEnc,
      payloadSize: encrypted.payloadEnc.length,
      contentHash: 'content-hash',
      cryptoVersion: encrypted.cryptoVersion,
      keyId: encrypted.keyId,
      rawText
    }
    const item = buildBlobSyncItem(snapshot, 1, '2026-05-03T00:00:00.000Z', 'blob-1')

    const blobText = snapshot.payloadEnc
    expect(blobText).toMatch(/^enc:v1:/)
    expect(blobText).not.toContain('large-business-value')

    const resolved = await resolveEncryptedPayloadText(
      buildOutput({ payload_ref: item.payload_ref }),
      {
        downloadBlob: async () => ({
          data: Buffer.from(blobText, 'utf-8').buffer.slice(
            Buffer.from(blobText, 'utf-8').byteOffset,
            Buffer.from(blobText, 'utf-8').byteOffset + Buffer.from(blobText, 'utf-8').byteLength
          )
        })
      },
      (payloadEnc) => crypto.decrypt(payloadEnc)
    )

    expect(resolved).toEqual({
      rawText,
      requiresMigrationRewrite: false
    })
  })

  it('marks b64 payloads as migration fallback reads', async () => {
    const rawText = JSON.stringify({ secret: 'migration-business-value' })
    const migrationPayload = `b64:${Buffer.from(rawText, 'utf-8').toString('base64')}`
    const crypto = new SyncPayloadCrypto(createMemoryStore())

    const resolved = await resolveEncryptedPayloadText(
      buildOutput({ payload_enc: migrationPayload }),
      {
        downloadBlob: async () => ({ data: new ArrayBuffer(0) })
      },
      (payloadEnc) => crypto.decrypt(payloadEnc)
    )

    expect(resolved).toEqual({
      rawText,
      requiresMigrationRewrite: true
    })
  })
})
