import { describe, expect, it, vi } from 'vitest'
import { accountSDK } from '../account'
import { CloudSyncError, CloudSyncSDK } from '../cloud-sync/cloud-sync-sdk'
import { CloudSyncSDK as PluginCloudSyncSDK } from '../plugin/sdk/cloud-sync'
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
          sync_token_expires_at: '2099-01-01T00:00:00.000Z',
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
      baseUrl: 'https://example.com',
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
          sync_token_expires_at: '2099-01-01T00:00:00.000Z',
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
      serviceBaseUrl: 'https://example.com',
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

  it('plugin sdk resolves auth/device via accountSDK', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/v1/sync/handshake')) {
        const headers = new Headers(init?.headers as HeadersInit)
        expect(headers.get('authorization')).toBe('Bearer auth-3')
        expect(headers.get('x-device-id')).toBe('device-3')
        return createJsonResponse({
          sync_token: 'sync-3',
          sync_token_expires_at: '2099-01-01T00:00:00.000Z',
          server_cursor: 0,
          device_id: 'device-3',
          quotas: {
            limits: { storage_limit_bytes: 100, object_limit: 10, item_limit: 5, device_limit: 3 },
            usage: { used_storage_bytes: 0, used_objects: 0, used_devices: 1 },
          },
        })
      }
      if (url.endsWith('/api/v1/sync/push')) {
        const headers = new Headers(init?.headers as HeadersInit)
        expect(headers.get('authorization')).toBe('Bearer auth-3')
        expect(headers.get('x-device-id')).toBe('device-3')
        expect(headers.get('x-sync-token')).toBe('sync-3')
        return createJsonResponse({ ack_cursor: 1, conflicts: [] })
      }
      return createJsonResponse({}, 404)
    })

    const authSpy = vi.spyOn(accountSDK, 'getAuthToken').mockResolvedValue('auth-3')
    const deviceSpy = vi.spyOn(accountSDK, 'getDeviceId').mockResolvedValue('device-3')

    const sdk = new PluginCloudSyncSDK({
      baseUrl: 'https://example.com',
      fetch: fetchMock as any,
      channelSend: vi.fn(async () => null),
      now: () => 0,
    })

    const item: SyncItemInput = {
      item_id: 'note-3',
      type: 'note',
      schema_version: 1,
      payload_enc: 'enc',
      payload_ref: null,
      meta_plain: { title: 'plugin' },
      payload_size: 10,
      updated_at: '2026-02-04T00:00:00.000Z',
      deleted_at: null,
      op_seq: 1,
      op_hash: 'hash-3',
      op_type: 'upsert',
    }

    await sdk.push([item])
    expect(authSpy).toHaveBeenCalled()
    expect(deviceSpy).toHaveBeenCalled()

    authSpy.mockRestore()
    deviceSpy.mockRestore()
  })
})
