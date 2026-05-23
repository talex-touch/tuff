import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { getUpdateAsset, saveUpdateAsset } from './updateAssetStorage'

vi.mock('./platformGovernanceStore', async () => {
  const actual = await vi.importActual<typeof import('./platformGovernanceStore')>('./platformGovernanceStore')
  return {
    ...actual,
    assertStorageChannelPolicy: vi.fn(async () => undefined),
    recordStorageChannelUsage: vi.fn(async () => ({})),
  }
})

function createEvent(bucket?: unknown) {
  return {
    context: {
      cloudflare: {
        env: {
          ASSETS: bucket,
        },
      },
    },
    node: {
      req: {
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
  } as any
}

function createRetryableBucket() {
  const objects = new Map<string, { data: Buffer, contentType: string }>()
  let attempts = 0

  return {
    get attempts() {
      return attempts
    },
    put: async (key: string, data: Uint8Array, options?: { httpMetadata?: { contentType?: string } }) => {
      attempts += 1
      if (attempts < 3) {
        throw Object.assign(new Error('Transient update asset write failure'), {
          statusCode: 503,
        })
      }
      objects.set(key, {
        data: Buffer.from(data.buffer, data.byteOffset, data.byteLength),
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
  }
}

describe('updateAssetStorage', () => {
  it('retries transient R2 update payload writes through the shared storage executor', async () => {
    const bucket = createRetryableBucket()
    const event = createEvent(bucket)
    const key = `updates/${crypto.randomUUID()}/payload.json`

    await saveUpdateAsset(event, key, Buffer.from('{"ok":true}'), 'application/json')
    const loaded = await getUpdateAsset(event, key)

    expect(bucket.attempts).toBe(3)
    expect(loaded?.contentType).toBe('application/json')
    expect(loaded?.data.toString()).toBe('{"ok":true}')
  })
})
