import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { listPlatformGovernanceEvents, upsertPlatformGovernanceConfig } from './platformGovernanceStore'
import {
  deleteStorageObject,
  getStorageObject,
  listStorageObjectKeys,
  putStorageObject,
  type StorageObjectExternalConfig,
  type StorageObjectMemory,
} from './storageObjectStore'

const storageCredentialMocks = vi.hoisted(() => ({
  getStorageCredential: vi.fn(),
}))

vi.mock('./storageCredentialStore', () => storageCredentialMocks)

function event(id: string) {
  return {
    node: {
      req: {
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
    path: `/test/${id}`,
  } as any
}

function createMemory() {
  return new Map<string, { data: Buffer, contentType: string }>() satisfies StorageObjectMemory
}

function createMockBucket() {
  const objects = new Map<string, { data: Buffer, contentType: string }>()

  return {
    put: async (key: string, data: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) => {
      const buffer = data instanceof ArrayBuffer
        ? Buffer.from(data)
        : Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      objects.set(key, {
        data: buffer,
        contentType: options?.httpMetadata?.contentType || 'application/octet-stream',
      })
    },
    get: async (key: string) => {
      const object = objects.get(key)
      if (!object)
        return null

      return {
        httpMetadata: {
          contentType: object.contentType,
        },
        arrayBuffer: async () => object.data.buffer.slice(
          object.data.byteOffset,
          object.data.byteOffset + object.data.byteLength,
        ),
      }
    },
    delete: async (key: string) => {
      objects.delete(key)
    },
    list: async () => ({
      objects: Array.from(objects.keys()).map(key => ({ key })),
    }),
  } as any
}

function createExternalStorage(channel: 's3' | 'oss', fetchImpl: typeof fetch): StorageObjectExternalConfig {
  return {
    channel,
    provider: channel === 'oss' ? 'aliyun-oss' : 'aws-s3',
    bucket: 'nexus-test',
    region: channel === 'oss' ? 'cn-hangzhou' : 'us-east-1',
    endpoint: 'https://storage.example.com',
    prefix: 'tenant-a',
    forcePathStyle: true,
    credentials: {
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    },
    fetch: fetchImpl,
  }
}

function createMockExternalFetch() {
  const objects = new Map<string, { data: Buffer, contentType: string }>()
  const requests: Array<{ method: string, url: string, authorization: string | null }> = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    requests.push({
      method,
      url,
      authorization: headers.get('authorization'),
    })

    if (method === 'PUT') {
      const body = init?.body instanceof Uint8Array
        ? Buffer.from(init.body)
        : Buffer.from(init?.body as ArrayBuffer)
      objects.set(url, {
        data: body,
        contentType: headers.get('content-type') || 'application/octet-stream',
      })
      return new Response(null, { status: 200 })
    }

    if (method === 'GET' && url.includes('list-type=2')) {
      const body = `<ListBucketResult>${Array.from(objects.keys()).map((key) => {
        const pathname = new URL(key).pathname.replace(/^\/nexus-test\//, '')
        return `<Contents><Key>${pathname}</Key></Contents>`
      }).join('')}</ListBucketResult>`
      return new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } })
    }

    if (method === 'GET') {
      const object = objects.get(url)
      if (!object)
        return new Response(null, { status: 404 })
      return new Response(object.data, {
        status: 200,
        headers: { 'content-type': object.contentType },
      })
    }

    if (method === 'DELETE') {
      objects.delete(url)
      return new Response(null, { status: 204 })
    }

    return new Response(null, { status: 405 })
  }) as typeof fetch

  return { fetchImpl, requests, objects }
}

describe('storageObjectStore', () => {
  it('stores, reads, deletes, and records memory-backed object usage', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const memoryStorage = createMemory()
    const resourceType = `object-memory-${marker}`
    const key = `${marker}.bin`

    const stored = await putStorageObject({
      event: h3Event,
      bucket: null,
      memoryStorage,
      key,
      data: Buffer.from([1, 2, 3, 4]),
      contentType: 'application/octet-stream',
      actorId: 'publisher@example.com',
      resourceType,
    })
    const loaded = await getStorageObject({
      event: h3Event,
      bucket: null,
      memoryStorage,
      key,
      resourceType,
    })
    await deleteStorageObject({
      event: h3Event,
      bucket: null,
      memoryStorage,
      key,
      resourceType,
    })

    expect(stored).toMatchObject({
      key,
      size: 4,
      contentType: 'application/octet-stream',
      storageChannel: 'memory',
      storageProvider: 'memory',
    })
    expect(loaded?.data).toEqual(Buffer.from([1, 2, 3, 4]))
    expect(memoryStorage.has(key)).toBe(false)

    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'storage',
      resourceType,
      resourceId: key,
      days: 30,
      limit: 10,
    })

    expect(JSON.stringify(rows)).not.toContain('publisher@example.com')
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'storage.write', channel: 'memory', unit: 'byte', quantity: 4 }),
      expect.objectContaining({ action: 'storage.read', channel: 'memory', unit: 'byte', quantity: 4 }),
      expect.objectContaining({ action: 'storage.delete', channel: 'memory', unit: 'operation', quantity: 1 }),
    ]))
  })

  it('records storage usage against governance resource ids instead of raw object keys', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const memoryStorage = createMemory()
    const resourceType = `object-governance-id-${marker}`
    const rawKey = `releases/${marker}/private customer build.zip`
    const governanceResourceId = `release:${marker}:darwin:arm64`

    await putStorageObject({
      event: h3Event,
      bucket: null,
      memoryStorage,
      key: rawKey,
      governanceResourceId,
      data: Buffer.from([1, 2, 3]),
      contentType: 'application/zip',
      resourceType,
    })
    await getStorageObject({
      event: h3Event,
      bucket: null,
      memoryStorage,
      key: rawKey,
      governanceResourceId,
      resourceType,
    })
    await deleteStorageObject({
      event: h3Event,
      bucket: null,
      memoryStorage,
      key: rawKey,
      governanceResourceId,
      resourceType,
    })

    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'storage',
      resourceType,
      resourceId: governanceResourceId,
      days: 30,
      limit: 10,
    })

    expect(JSON.stringify(rows)).not.toContain(rawKey)
    expect(JSON.stringify(rows)).not.toContain('private customer build.zip')
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'storage.write',
        resourceId: governanceResourceId,
        channel: 'memory',
        unit: 'byte',
        quantity: 3,
      }),
      expect.objectContaining({
        action: 'storage.read',
        resourceId: governanceResourceId,
        channel: 'memory',
        unit: 'byte',
        quantity: 3,
      }),
      expect.objectContaining({
        action: 'storage.delete',
        resourceId: governanceResourceId,
        channel: 'memory',
        unit: 'operation',
        quantity: 1,
      }),
    ]))
  })

  it('stores and lists R2-backed objects through the shared executor', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const bucket = createMockBucket()
    const memoryStorage = createMemory()
    const resourceType = `object-r2-${marker}`
    const key = `${marker}.json`

    const stored = await putStorageObject({
      event: h3Event,
      bucket,
      memoryStorage,
      key,
      data: Buffer.from('{"ok":true}'),
      contentType: 'application/json',
      resourceType,
    })
    const loaded = await getStorageObject({
      event: h3Event,
      bucket,
      memoryStorage,
      key,
      resourceType,
    })
    const keysBeforeDelete = await listStorageObjectKeys(bucket, memoryStorage)
    await deleteStorageObject({
      event: h3Event,
      bucket,
      memoryStorage,
      key,
      resourceType,
    })

    expect(stored.storageChannel).toBe('r2')
    expect(stored.storageProvider).toBe('cloudflare-r2')
    expect(loaded?.contentType).toBe('application/json')
    expect(loaded?.data.toString()).toBe('{"ok":true}')
    expect(keysBeforeDelete).toEqual([key])
    await expect(getStorageObject({
      event: h3Event,
      bucket,
      memoryStorage,
      key,
      resourceType,
    })).resolves.toBeNull()
  })

  it('stores, reads, lists, deletes, and records S3-compatible objects through the external executor', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const memoryStorage = createMemory()
    const resourceType = `object-s3-${marker}`
    const key = `${marker}.json`
    const external = createExternalStorage('s3', createMockExternalFetch().fetchImpl)

    const stored = await putStorageObject({
      event: h3Event,
      bucket: null,
      memoryStorage,
      externalStorage: external,
      key,
      data: Buffer.from('{"s3":true}'),
      contentType: 'application/json',
      resourceType,
    })
    const loaded = await getStorageObject({
      event: h3Event,
      bucket: null,
      memoryStorage,
      externalStorage: external,
      key,
      resourceType,
    })
    const keysBeforeDelete = await listStorageObjectKeys(null, memoryStorage, {
      externalStorage: external,
    })
    await deleteStorageObject({
      event: h3Event,
      bucket: null,
      memoryStorage,
      externalStorage: external,
      key,
      resourceType,
    })

    expect(stored).toMatchObject({
      storageChannel: 's3',
      storageProvider: 'aws-s3',
      contentType: 'application/json',
    })
    expect(loaded?.data.toString()).toBe('{"s3":true}')
    expect(keysBeforeDelete).toEqual([key])

    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'storage',
      resourceType,
      resourceId: key,
      days: 30,
      limit: 10,
    })
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'storage.write', channel: 's3', unit: 'byte', quantity: 11 }),
      expect.objectContaining({ action: 'storage.read', channel: 's3', unit: 'byte', quantity: 11 }),
      expect.objectContaining({ action: 'storage.delete', channel: 's3', unit: 'operation', quantity: 1 }),
    ]))
  })

  it('selects an OSS executor from enabled storage channel policy and secure credentials', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const memoryStorage = createMemory()
    const resourceType = `object-oss-${marker}`
    const key = `${marker}.txt`
    const { fetchImpl, requests } = createMockExternalFetch()
    ;(globalThis as any).fetch = fetchImpl
    storageCredentialMocks.getStorageCredential.mockResolvedValue({
      accessKeyId: 'oss-access-key',
      secretAccessKey: 'oss-secret-key',
    })

    await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'storage_channel',
      name: `OSS storage ${marker}`,
      channel: 'oss',
      provider: 'aliyun-oss',
      targetId: resourceType,
      limits: {
        maxBytes: 1000,
        trafficBytes: 1000,
        windowDays: 30,
      },
      config: {
        credentialRef: `secure://storage/oss-${marker}`,
        bucket: 'nexus-test',
        endpoint: 'storage.example.com',
        region: 'cn-hangzhou',
        prefix: 'tenant-b',
      },
    }, 'admin')

    const stored = await putStorageObject({
      event: h3Event,
      bucket: null,
      memoryStorage,
      key,
      data: Buffer.from('hello oss'),
      contentType: 'text/plain',
      resourceType,
    })
    const loaded = await getStorageObject({
      event: h3Event,
      bucket: null,
      memoryStorage,
      key,
      resourceType,
    })

    expect(stored.storageChannel).toBe('oss')
    expect(stored.storageProvider).toBe('aliyun-oss')
    expect(loaded?.data.toString()).toBe('hello oss')
    expect(requests[0]?.authorization).toContain('OSS4-HMAC-SHA256')
    expect(JSON.stringify(requests)).not.toContain('oss-secret-key')
  })

  it('blocks writes before object storage and success usage are recorded', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const memoryStorage = createMemory()
    const resourceType = `object-blocked-${marker}`
    const key = `${marker}.bin`

    await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'storage_channel',
      name: `Object storage budget ${marker}`,
      channel: 'memory',
      provider: 'memory',
      targetId: resourceType,
      limits: {
        maxBytes: 3,
        windowDays: 30,
      },
    }, 'admin')

    await expect(putStorageObject({
      event: h3Event,
      bucket: null,
      memoryStorage,
      key,
      data: Buffer.from([1, 2, 3, 4]),
      contentType: 'application/octet-stream',
      resourceType,
    })).rejects.toMatchObject({
      statusCode: 429,
      statusMessage: expect.stringContaining('max-bytes-exceeded'),
    })

    expect(memoryStorage.has(key)).toBe(false)
    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'storage',
      resourceType,
      resourceId: key,
      days: 30,
      limit: 10,
    })
    expect(rows.filter(row => row.action === 'storage.write')).toHaveLength(0)
  })
})
