import { describe, expect, it, vi } from 'vitest'
import { CloudSyncError, CloudSyncSDK } from '../cloud-sync/cloud-sync-sdk'
import type { SyncItemInput } from '../types/cloud-sync'

const createJsonResponse = (payload: unknown, status = 200) => new Response(
  JSON.stringify(payload),
  {
    status,
    headers: { 'content-type': 'application/json' },
  },
)

describe('CloudSyncSDK', () => {
  it('handshakes and attaches sync token for push', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/v1/sync/handshake')) {
        return createJsonResponse({
          sync_token: 'sync-1',
          server_cursor: 0,
          device_id: 'device-1',
          quotas: {
            limits: { storage_limit_bytes: 100, object_limit: 10, item_limit: 5, device_limit: 3 },
            usage: { used_storage_bytes: 0, used_objects: 0, used_devices: 1 },
          },
        })
      }
      if (url.endsWith('/api/v1/sync/push')) {
        const headers = new Headers(init?.headers as HeadersInit)
        expect(headers.get('x-device-id')).toBe('device-1')
        expect(headers.get('x-sync-token')).toBe('sync-1')
        return createJsonResponse({ ack_cursor: 1, conflicts: [] })
      }
      return createJsonResponse({}, 404)
    })

    const cache: { token?: string, expiresAt?: string } = {}
    const sdk = new CloudSyncSDK({
      apiBaseUrl: 'https://example.com',
      getAuthToken: () => 'auth-1',
      getDeviceId: () => 'device-1',
      fetch: fetchMock as any,
      syncTokenCache: cache,
      now: () => 0,
    })

    const item: SyncItemInput = {
      item_id: 'note-1',
      type: 'note',
      schema_version: 1,
      payload_enc: 'enc',
      payload_ref: null,
      meta_plain: { title: 'hello' },
      payload_size: 10,
      updated_at: '2026-02-04T00:00:00.000Z',
      deleted_at: null,
      op_seq: 1,
      op_hash: 'hash-1',
      op_type: 'upsert',
    }

    const result = await sdk.push([item])
    expect(result.ack_cursor).toBe(1)
    expect(cache.token).toBe('sync-1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws CloudSyncError when response has errorCode', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/v1/sync/handshake')) {
        return createJsonResponse({
          sync_token: 'sync-2',
          server_cursor: 0,
          device_id: 'device-2',
          quotas: {
            limits: { storage_limit_bytes: 100, object_limit: 10, item_limit: 5, device_limit: 3 },
            usage: { used_storage_bytes: 0, used_objects: 0, used_devices: 1 },
          },
        })
      }
      if (url.endsWith('/api/v1/sync/push')) {
        return createJsonResponse({ errorCode: 'SYNC_INVALID_PAYLOAD' }, 400)
      }
      return createJsonResponse({}, 404)
    })

    const sdk = new CloudSyncSDK({
      apiBaseUrl: 'https://example.com',
      getAuthToken: () => 'auth-2',
      getDeviceId: () => 'device-2',
      fetch: fetchMock as any,
    })

    const item: SyncItemInput = {
      item_id: 'note-2',
      type: 'note',
      schema_version: 1,
      payload_enc: 'enc',
      payload_ref: null,
      meta_plain: null,
      payload_size: 10,
      updated_at: '2026-02-04T00:00:00.000Z',
      deleted_at: null,
      op_seq: 1,
      op_hash: 'hash-2',
      op_type: 'upsert',
    }

    await expect(sdk.push([item])).rejects.toBeInstanceOf(CloudSyncError)
  })
})
