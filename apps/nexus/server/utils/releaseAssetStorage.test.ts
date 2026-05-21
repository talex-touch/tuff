import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { listPlatformGovernanceEvents } from './platformGovernanceStore'
import { requireReleaseAsset, uploadReleaseAsset } from './releaseAssetStorage'

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

describe('releaseAssetStorage', () => {
  it('records storage usage with governance ids instead of raw release object keys', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const rawKey = `releases/${marker}/darwin-arm64/private customer build.zip`
    const governanceResourceId = `release:${marker}:darwin:arm64`

    await uploadReleaseAsset(h3Event, rawKey, Buffer.from([1, 2, 3, 4]), 'application/zip', {
      actorId: 'release-uploader@example.com',
      governanceResourceId,
      resourceType: 'release-asset',
    })
    await requireReleaseAsset(h3Event, rawKey, {
      governanceResourceId,
      resourceType: 'release-asset',
    })

    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'storage',
      resourceType: 'release-asset',
      resourceId: governanceResourceId,
      days: 30,
      limit: 10,
    })

    expect(JSON.stringify(rows)).not.toContain('release-uploader@example.com')
    expect(JSON.stringify(rows)).not.toContain(rawKey)
    expect(JSON.stringify(rows)).not.toContain('private customer build.zip')
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'storage.write',
        resourceId: governanceResourceId,
        channel: 'memory',
        unit: 'byte',
        quantity: 4,
      }),
      expect.objectContaining({
        action: 'storage.read',
        resourceId: governanceResourceId,
        channel: 'memory',
        unit: 'byte',
        quantity: 4,
      }),
    ]))
  })
})
