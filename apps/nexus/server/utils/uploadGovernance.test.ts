import { createError } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listPlatformGovernanceEvents } from './platformGovernanceStore'
import {
  completeUploadGovernance,
  failUploadGovernance,
  startUploadGovernance,
  UPLOAD_GOVERNANCE_WRITE_TIMEOUT_MS,
} from './uploadGovernance'

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

function pendingD1Event(id: string) {
  const never = () => new Promise(() => {})
  return {
    ...event(id),
    context: {
      cloudflare: {
        env: {
          DB: {
            prepare: () => ({
              bind: () => ({
                run: never,
                all: never,
              }),
              run: never,
              all: never,
            }),
          },
        },
      },
    },
  } as any
}

describe('uploadGovernance', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('records sanitized upload lifecycle events without leaking raw actor or file names', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const resourceType = `upload-resource-${marker}`

    const context = await startUploadGovernance(h3Event, {
      actorId: 'uploader@example.com',
      resourceType,
      file: {
        name: 'private customer export.zip',
        size: 4096,
        type: 'APPLICATION/ZIP',
      },
      metadata: {
        surface: 'dashboard-resource',
      },
    })

    await completeUploadGovernance(h3Event, context, {
      resourceId: `uploaded-${marker}.zip`,
      size: 4096,
      storageChannel: 'memory',
      storageProvider: 'memory',
    })

    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'upload',
      resourceType,
      days: 30,
      limit: 10,
    })

    expect(JSON.stringify(rows)).not.toContain('uploader@example.com')
    expect(JSON.stringify(rows)).not.toContain('private customer export.zip')
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'resource.started',
        channel: 'application/zip',
        unit: 'file',
        quantity: 1,
        metadata: expect.objectContaining({
          attemptId: context.attemptId,
          extension: 'zip',
          size: 4096,
          surface: 'dashboard-resource',
        }),
      }),
      expect.objectContaining({
        action: 'resource.completed',
        channel: 'application/zip',
        unit: 'byte',
        quantity: 4096,
        metadata: expect.objectContaining({
          attemptId: context.attemptId,
          storageChannel: 'memory',
          storageProvider: 'memory',
        }),
      }),
    ]))
  })

  it('records plugin package upload lifecycle by stable plugin version governance id', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const resourceId = `plugin:${marker}:version:release:1.0.0`

    const context = await startUploadGovernance(h3Event, {
      actorId: 'publisher@example.com',
      resourceType: 'plugin-package',
      resourceId,
      file: {
        name: 'private customer plugin.tpex',
        size: 4096,
        type: 'application/vnd.tuff.plugin',
      },
      metadata: {
        pluginId: marker,
        channel: 'RELEASE',
        version: '1.0.0',
        surface: 'plugin-version-publish',
      },
    })

    await completeUploadGovernance(h3Event, context, {
      resourceId,
      contentType: 'application/vnd.tuff.plugin',
      size: 4096,
      storageChannel: 'memory',
      storageProvider: 'memory',
      metadata: {
        pluginId: marker,
        channel: 'RELEASE',
        version: '1.0.0',
        surface: 'plugin-version-publish',
      },
    })

    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'upload',
      resourceType: 'plugin-package',
      resourceId,
      days: 30,
      limit: 10,
    })

    expect(JSON.stringify(rows)).not.toContain('publisher@example.com')
    expect(JSON.stringify(rows)).not.toContain('private customer plugin.tpex')
    expect(rows.every(row => row.resourceId === resourceId)).toBe(true)
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'resource.started',
        channel: 'application/vnd.tuff.plugin',
        unit: 'file',
        quantity: 1,
        metadata: expect.objectContaining({
          attemptId: context.attemptId,
          extension: 'tpex',
          size: 4096,
          surface: 'plugin-version-publish',
        }),
      }),
      expect.objectContaining({
        action: 'resource.completed',
        channel: 'application/vnd.tuff.plugin',
        unit: 'byte',
        quantity: 4096,
        metadata: expect.objectContaining({
          attemptId: context.attemptId,
          extension: 'tpex',
          storageChannel: 'memory',
          storageProvider: 'memory',
          surface: 'plugin-version-publish',
        }),
      }),
    ]))
  })

  it('records sanitized upload failures with stable reason and status code', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const resourceType = `upload-failure-${marker}`
    const context = await startUploadGovernance(h3Event, {
      actorId: 'uploader@example.com',
      resourceType,
      file: {
        name: 'secret icon.svg',
        size: 1024,
        type: 'image/svg+xml',
      },
    })

    await failUploadGovernance(
      h3Event,
      context,
      createError({ statusCode: 429, statusMessage: 'Storage quota exceeded.' }),
    )

    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'upload',
      resourceType,
      days: 30,
      limit: 10,
    })
    const failed = rows.find(row => row.action === 'resource.failed')

    expect(JSON.stringify(rows)).not.toContain('uploader@example.com')
    expect(JSON.stringify(rows)).not.toContain('secret icon.svg')
    expect(failed).toMatchObject({
      action: 'resource.failed',
      unit: 'file',
      quantity: 1,
      metadata: expect.objectContaining({
        attemptId: context.attemptId,
        extension: 'svg',
        reason: 'Storage quota exceeded.',
        statusCode: 429,
      }),
    })
  })

  it('does not block upload flow when governance persistence hangs', async () => {
    vi.useFakeTimers()

    const marker = crypto.randomUUID()
    const pendingContext = startUploadGovernance(pendingD1Event(marker), {
      actorId: 'uploader@example.com',
      resourceType: `upload-pending-${marker}`,
      file: {
        name: 'private stuck upload.zip',
        size: 2048,
        type: 'application/zip',
      },
      metadata: {
        surface: 'dashboard-resource',
      },
    })

    await vi.advanceTimersByTimeAsync(UPLOAD_GOVERNANCE_WRITE_TIMEOUT_MS)

    await expect(pendingContext).resolves.toMatchObject({
      resourceType: `upload-pending-${marker}`,
      contentType: 'application/zip',
      extension: 'zip',
      size: 2048,
    })
  })
})
