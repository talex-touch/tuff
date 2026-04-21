import type { PluginInstallConfirmRequest, PluginInstallRequest } from '@talex-touch/utils/plugin'
import { CURRENT_SDK_VERSION } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { PluginInstallQueue } from './install-queue'
import type { PluginInstaller, PreparedPluginInstall } from './plugin-installer'

vi.mock('./plugin-ui-utils', () => ({
  checkPluginActiveUI: vi.fn().mockResolvedValue({
    hasActiveUI: false,
    coreBox: false,
    divisionBoxSessions: []
  })
}))

describe('PluginInstallQueue permission confirmation', () => {
  function createQueue() {
    const installRequest: PluginInstallRequest = {
      source: 'https://example.com/plugin.tpex',
      metadata: { trusted: true }
    }

    const prepared = {
      request: installRequest,
      providerResult: {
        provider: 'tpex',
        official: false,
        metadata: {}
      },
      manifest: {
        name: 'touch-demo',
        version: '1.0.0',
        sdkapi: CURRENT_SDK_VERSION
      }
    } as unknown as PreparedPluginInstall

    const installer = {
      prepareInstall: vi.fn().mockResolvedValue(prepared),
      finalizeInstall: vi.fn().mockResolvedValue({
        manifest: prepared.manifest,
        providerResult: prepared.providerResult
      }),
      discardPrepared: vi.fn().mockResolvedValue(undefined)
    } as unknown as PluginInstaller

    const confirmRequests: PluginInstallConfirmRequest[] = []
    const transport = {
      sendToWindow: vi.fn().mockImplementation(async (_windowId, event, payload) => {
        if (event === PluginEvents.install.confirm) {
          confirmRequests.push(payload as PluginInstallConfirmRequest)
        }
      })
    } as unknown as ITuffTransportMain

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
      installRequest,
      transport,
      confirmRequests,
      onPermissionConfirmed
    }
  }

  it('applies session grant decision from install permission confirmation', async () => {
    const { queue, confirmRequests, installRequest, onPermissionConfirmed } = createQueue()
    const installPromise = queue.enqueue(installRequest)

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
    const { queue, confirmRequests, installRequest, onPermissionConfirmed } = createQueue()
    const installPromise = queue.enqueue(installRequest)

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
    const { queue, confirmRequests, installRequest, installer } = createQueue()
    const installPromise = queue.enqueue(installRequest)

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

  it('fails install before finalize when prepared manifest is blocked by sdkapi validation', async () => {
    const installRequest: PluginInstallRequest = {
      source: 'https://example.com/plugin.tpex',
      metadata: { trusted: true }
    }

    const prepared = {
      request: installRequest,
      providerResult: {
        provider: 'tpex',
        official: false,
        metadata: {}
      },
      manifest: {
        name: 'touch-legacy',
        version: '1.0.0'
      }
    } as unknown as PreparedPluginInstall

    const installer = {
      prepareInstall: vi.fn().mockResolvedValue(prepared),
      finalizeInstall: vi.fn().mockResolvedValue({
        manifest: prepared.manifest,
        providerResult: prepared.providerResult
      }),
      discardPrepared: vi.fn().mockResolvedValue(undefined)
    } as unknown as PluginInstaller

    const transport = {
      sendToWindow: vi.fn().mockResolvedValue(undefined)
    } as unknown as ITuffTransportMain

    const queue = new PluginInstallQueue(installer, transport, 1, {
      resolvePermissionConfirmation: () => {
        throw new Error(
          'Plugin "touch-legacy" is blocked because manifest.json must declare sdkapi >= 251212.'
        )
      }
    })

    const result = await queue.enqueue(installRequest)

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toContain('must declare sdkapi >=')
    }
    expect(installer.finalizeInstall).not.toHaveBeenCalled()
    expect(installer.discardPrepared).toHaveBeenCalledWith(prepared)
  })
})
