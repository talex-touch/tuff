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

const createBinaryResponse = (payload: Uint8Array, status = 200, headers?: Record<string, string>) => new Response(
  new Uint8Array(payload).buffer,
  {
    status,
    headers: { 'content-type': 'application/octet-stream', ...(headers ?? {}) },
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

  it('downloads blob as binary and keeps sync token header', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/v1/sync/handshake')) {
        return createJsonResponse({
          sync_token: 'sync-4',
          sync_token_expires_at: '2099-01-01T00:00:00.000Z',
          server_cursor: 0,
          device_id: 'device-4',
          quotas: {
            limits: { storage_limit_bytes: 100, object_limit: 10, item_limit: 5, device_limit: 3 },
            usage: { used_storage_bytes: 0, used_objects: 0, used_devices: 1 },
          },
        })
      }
      if (url.endsWith('/api/v1/sync/blobs/blob-1/download')) {
        const headers = new Headers(init?.headers as HeadersInit)
        expect(headers.get('x-sync-token')).toBe('sync-4')
        return createBinaryResponse(
          new TextEncoder().encode('hello'),
          200,
          { 'x-content-sha256': 'sha-1', 'content-length': '5' },
        )
      }
      return createJsonResponse({}, 404)
    })

    const sdk = new CloudSyncSDK({
      baseUrl: 'https://example.com',
      getAuthToken: () => 'auth-4',
      getDeviceId: () => 'device-4',
      fetch: fetchMock as any,
      now: () => 0,
    })

    const blob = await sdk.downloadBlob('blob-1')
    expect(blob.sha256).toBe('sha-1')
    expect(blob.sizeBytes).toBe(5)
    expect(new TextDecoder().decode(blob.data)).toBe('hello')
  })

  it('calls keys and device attest apis without sync token', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/v1/keys/list')) {
        const headers = new Headers(init?.headers as HeadersInit)
        expect(headers.get('x-sync-token')).toBeNull()
        return createJsonResponse({
          keyrings: [
            {
              keyring_id: 'k1',
              device_id: 'd1',
              key_type: 'uk',
              rotated_at: null,
              created_at: '2026-02-04T00:00:00.000Z',
              has_recovery_code: true,
            },
          ],
        })
      }
      if (url.endsWith('/api/v1/keys/issue-device')) {
        return createJsonResponse({ keyring_id: 'k2' })
      }
      if (url.endsWith('/api/v1/keys/recover-device')) {
        return createJsonResponse({
          keyrings: [
            {
              keyring_id: 'k3',
              device_id: 'd2',
              key_type: 'uk',
              encrypted_key: 'enc',
              rotated_at: null,
              created_at: '2026-02-04T00:00:00.000Z',
            },
          ],
        })
      }
      if (url.endsWith('/api/v1/devices/attest')) {
        return createJsonResponse({ ok: true, device_id: 'd1', updated_at: '2026-02-04T00:00:00.000Z' })
      }
      return createJsonResponse({}, 404)
    })

    const sdk = new CloudSyncSDK({
      baseUrl: 'https://example.com',
      getAuthToken: () => 'auth-5',
      getDeviceId: () => 'device-5',
      fetch: fetchMock as any,
    })

    const keyrings = await sdk.listKeyrings()
    expect(keyrings).toHaveLength(1)

    const issued = await sdk.issueDeviceKey({
      target_device_id: 'd1',
      key_type: 'uk',
      encrypted_key: 'enc',
      recovery_code_hash: 'rc',
    })
    expect(issued.keyring_id).toBe('k2')

    const recovered = await sdk.recoverDevice({ recovery_code: 'rc' })
    expect(recovered).toHaveLength(1)

    const attested = await sdk.attestDevice({ machine_code_hash: 'mc' })
    expect(attested.ok).toBe(true)
  })

  it('retries sensitive keys api with step-up callback token', async () => {
    let issueCalls = 0
    let recoverCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/v1/keys/issue-device')) {
        issueCalls += 1
        const headers = new Headers(init?.headers as HeadersInit)
        const loginToken = headers.get('x-login-token')
        if (!loginToken) {
          return createJsonResponse({ errorCode: 'DEVICE_NOT_AUTHORIZED', message: 'MF2A required' }, 403)
        }
        expect(loginToken).toBe('step-up-token')
        return createJsonResponse({ keyring_id: 'k4' })
      }

      if (url.endsWith('/api/v1/keys/recover-device')) {
        recoverCalls += 1
        const headers = new Headers(init?.headers as HeadersInit)
        const loginToken = headers.get('x-login-token')
        if (!loginToken) {
          return createJsonResponse({ errorCode: 'DEVICE_NOT_AUTHORIZED', message: 'MF2A required' }, 403)
        }
        expect(loginToken).toBe('step-up-token')
        return createJsonResponse({
          keyrings: [
            {
              keyring_id: 'k5',
              device_id: 'd5',
              key_type: 'uk',
              encrypted_key: 'enc',
              rotated_at: null,
              created_at: '2026-02-04T00:00:00.000Z',
            },
          ],
        })
      }

      return createJsonResponse({}, 404)
    })

    const onStepUpRequired = vi.fn(async () => 'step-up-token')
    const sdk = new CloudSyncSDK({
      baseUrl: 'https://example.com',
      getAuthToken: () => 'auth-6',
      getDeviceId: () => 'device-6',
      fetch: fetchMock as any,
      onStepUpRequired,
    })

    const issued = await sdk.issueDeviceKey({
      target_device_id: 'd5',
      key_type: 'uk',
      encrypted_key: 'enc',
    })
    expect(issued.keyring_id).toBe('k4')

    const recovered = await sdk.recoverDevice({ recovery_code: 'rc-1' })
    expect(recovered).toHaveLength(1)

    expect(onStepUpRequired).toHaveBeenCalledTimes(2)
    expect(issueCalls).toBe(2)
    expect(recoverCalls).toBe(2)
  })
})
