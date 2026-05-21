import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { uploadImageFromBuffer } from './imageStorage'
import { listPlatformGovernanceEvents } from './platformGovernanceStore'

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

describe('imageStorage', () => {
  it('records extracted plugin icon uploads in upload lifecycle analytics', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const resourceId = `plugin:${marker}:icon`

    const result = await uploadImageFromBuffer(
      h3Event,
      Buffer.from('<svg />'),
      'private customer icon.svg',
      'image/svg+xml',
      {
        actorId: 'publisher@example.com',
        resourceType: 'plugin-icon',
        uploadLifecycle: {
          surface: 'plugin-icon-extract',
          resourceId,
          metadata: {
            pluginId: marker,
            source: 'plugin-version-publish',
          },
        },
      },
    )

    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'upload',
      resourceType: 'plugin-icon',
      resourceId,
      days: 30,
      limit: 10,
    })

    expect(result.storageChannel).toBe('memory')
    expect(JSON.stringify(rows)).not.toContain('publisher@example.com')
    expect(JSON.stringify(rows)).not.toContain('private customer icon.svg')
    expect(rows.every(row => row.resourceId === resourceId)).toBe(true)
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'resource.started',
        resourceId,
        channel: 'image/svg+xml',
        unit: 'file',
        quantity: 1,
        metadata: expect.objectContaining({
          extension: 'svg',
          pluginId: marker,
          size: 7,
          source: 'plugin-version-publish',
          surface: 'plugin-icon-extract',
        }),
      }),
      expect.objectContaining({
        action: 'resource.completed',
        resourceId,
        channel: 'image/svg+xml',
        unit: 'byte',
        quantity: 7,
        metadata: expect.objectContaining({
          extension: 'svg',
          pluginId: marker,
          storageChannel: 'memory',
          storageProvider: 'memory',
          source: 'plugin-version-publish',
          surface: 'plugin-icon-extract',
        }),
      }),
    ]))
  })

  it('records extracted plugin icon upload failures in upload lifecycle analytics', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const resourceId = `plugin:${marker}:icon`

    await expect(uploadImageFromBuffer(
      h3Event,
      Buffer.from('not-an-icon'),
      'private customer icon.exe',
      'application/octet-stream',
      {
        actorId: 'publisher@example.com',
        resourceType: 'plugin-icon',
        uploadLifecycle: {
          surface: 'plugin-icon-extract',
          resourceId,
          metadata: {
            pluginId: marker,
            source: 'plugin-version-publish',
          },
        },
      },
    )).rejects.toMatchObject({
      statusCode: 400,
    })

    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'upload',
      resourceType: 'plugin-icon',
      resourceId,
      days: 30,
      limit: 10,
    })
    const failed = rows.find(row => row.action === 'resource.failed')

    expect(JSON.stringify(rows)).not.toContain('publisher@example.com')
    expect(JSON.stringify(rows)).not.toContain('private customer icon.exe')
    expect(failed).toMatchObject({
      action: 'resource.failed',
      resourceId,
      channel: 'application/octet-stream',
      unit: 'file',
      quantity: 1,
      metadata: expect.objectContaining({
        extension: 'exe',
        pluginId: marker,
        reason: expect.stringContaining('Invalid image extension'),
        source: 'plugin-version-publish',
        statusCode: 400,
        surface: 'plugin-icon-extract',
      }),
    })
  })
})
