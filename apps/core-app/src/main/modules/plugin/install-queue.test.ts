import type { PluginInstallConfirmRequest } from '@talex-touch/utils/plugin'
import { describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { PluginInstallQueue } from './install-queue'

vi.mock('./plugin-ui-utils', () => ({
  checkPluginActiveUI: vi.fn().mockResolvedValue({
    hasActiveUI: false,
    coreBox: false,
    divisionBoxSessions: []
  })
}))

describe('PluginInstallQueue permission confirmation', () => {
  function createQueue() {
    const prepared = {
      request: {
        source: 'https://example.com/plugin.tpex',
        metadata: { trusted: true }
      },
      providerResult: {
        provider: 'tpex',
        official: false,
        metadata: {}
      },
      manifest: {
        name: 'touch-demo',
        version: '1.0.0',
        sdkapi: 260228
      }
    } as any

    const installer = {
      prepareInstall: vi.fn().mockResolvedValue(prepared),
      finalizeInstall: vi.fn().mockResolvedValue({
        manifest: prepared.manifest,
        providerResult: prepared.providerResult
      }),
      discardPrepared: vi.fn().mockResolvedValue(undefined)
    } as any

    const confirmRequests: PluginInstallConfirmRequest[] = []
    const transport = {
      sendToWindow: vi.fn().mockImplementation(async (_windowId, event, payload) => {
        if (event === PluginEvents.install.confirm) {
          confirmRequests.push(payload as PluginInstallConfirmRequest)
        }
      })
    } as any

    const onPermissionConfirmed = vi.fn().mockResolvedValue(undefined)
    const queue = new PluginInstallQueue(installer, transport, 1, {
      resolvePermissionConfirmation: () => ({
        taskId: '',
        kind: 'permissions',
        pluginId: 'touch-demo',
        pluginName: 'touch-demo',
        permissions: {
          required: ['fs.read'],
          optional: [],
          reasons: { 'fs.read': 'read plugin files' }
        }
      }),
      onPermissionConfirmed
    })

    return {
      queue,
      installer,
      transport,
      confirmRequests,
      onPermissionConfirmed
    }
  }

  it('applies session grant decision from install permission confirmation', async () => {
    const { queue, confirmRequests, onPermissionConfirmed } = createQueue()
    const installPromise = queue.enqueue({
      source: 'https://example.com/plugin.tpex',
      metadata: { trusted: true }
    } as any)

    await vi.waitFor(() => {
      expect(confirmRequests).toHaveLength(1)
    })

    const taskId = confirmRequests[0].taskId
    queue.handleConfirmResponse({
      taskId,
      decision: 'accept',
      grantMode: 'session'
    })

    const result = await installPromise
    expect(result.status).toBe('success')
    expect(onPermissionConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        response: expect.objectContaining({
          decision: 'accept',
          grantMode: 'session'
        })
      })
    )
  })

  it('applies always grant decision from install permission confirmation', async () => {
    const { queue, confirmRequests, onPermissionConfirmed } = createQueue()
    const installPromise = queue.enqueue({
      source: 'https://example.com/plugin.tpex',
      metadata: { trusted: true }
    } as any)

    await vi.waitFor(() => {
      expect(confirmRequests).toHaveLength(1)
    })

    const taskId = confirmRequests[0].taskId
    queue.handleConfirmResponse({
      taskId,
      decision: 'accept',
      grantMode: 'always'
    })

    const result = await installPromise
    expect(result.status).toBe('success')
    expect(onPermissionConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        response: expect.objectContaining({
          decision: 'accept',
          grantMode: 'always'
        })
      })
    )
  })

  it('fails install when permission confirmation is rejected', async () => {
    const { queue, confirmRequests, installer } = createQueue()
    const installPromise = queue.enqueue({
      source: 'https://example.com/plugin.tpex',
      metadata: { trusted: true }
    } as any)

    await vi.waitFor(() => {
      expect(confirmRequests).toHaveLength(1)
    })

    queue.handleConfirmResponse({
      taskId: confirmRequests[0].taskId,
      decision: 'reject',
      reason: 'Permission denied by user'
    })

    const result = await installPromise
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toContain('Permission denied by user')
    }
    expect(installer.discardPrepared).toHaveBeenCalled()
  })
})
