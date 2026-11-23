import type { PluginInstallConfirmRequest } from '@talex-touch/utils/plugin'
import { CURRENT_SDK_VERSION } from '@talex-touch/utils/plugin'
import type { PluginInstallRequest } from '@talex-touch/utils/plugin/providers/types'
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

    // Permission confirmations, which is what these tests are about.
    const confirmRequests: PluginInstallConfirmRequest[] = []
    // Source confirmations. These used to be skipped because the request carried
    // `metadata.trusted`, which the renderer could forge (#902); the main process now always
    // asks for a non-official plugin, so the harness answers on the user's behalf.
    const sourceConfirmRequests: PluginInstallConfirmRequest[] = []
    let queueRef: PluginInstallQueue | null = null
    const transport = {
      sendToWindow: vi.fn().mockImplementation(async (_windowId, event, payload) => {
        if (event !== PluginEvents.install.confirm) return
        const request = payload as PluginInstallConfirmRequest
        if (request.kind === 'source') {
          sourceConfirmRequests.push(request)
          queueRef?.handleConfirmResponse({ taskId: request.taskId, decision: 'accept' })
          return
        }
        confirmRequests.push(request)
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
    queueRef = queue

    return {
      queue,
      installer,
      installRequest,
      transport,
      confirmRequests,
      sourceConfirmRequests,
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

  it('accepts confirmation responses emitted before the confirm send resolves', async () => {
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

    let queue: PluginInstallQueue
    const transport = {
      sendToWindow: vi.fn().mockImplementation(async (_windowId, event, payload) => {
        if (event === PluginEvents.install.confirm) {
          queue.handleConfirmResponse({
            taskId: (payload as PluginInstallConfirmRequest).taskId,
            decision: 'accept',
            grantMode: 'always'
          })
        }
      })
    } as unknown as ITuffTransportMain

    queue = new PluginInstallQueue(installer, transport, 1, {
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
      })
    })

    const result = await queue.enqueue(installRequest)

    expect(result.status).toBe('success')
    expect(installer.finalizeInstall).toHaveBeenCalled()
    expect(installer.discardPrepared).not.toHaveBeenCalled()
  })

  it('rechecks uninstall admission after confirmation and before final package mutation', async () => {
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
      finalizeInstall: vi.fn(),
      discardPrepared: vi.fn().mockResolvedValue(undefined)
    } as unknown as PluginInstaller
    let queue: PluginInstallQueue
    let uninstallBlocked = false
    const transport = {
      sendToWindow: vi.fn().mockImplementation(async (_windowId, event, payload) => {
        if (event === PluginEvents.install.confirm) {
          queue.handleConfirmResponse({
            taskId: (payload as PluginInstallConfirmRequest).taskId,
            decision: 'accept',
            grantMode: 'always'
          })
        }
      })
    } as unknown as ITuffTransportMain
    queue = new PluginInstallQueue(installer, transport, 1, {
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
      onPermissionConfirmed: () => {
        uninstallBlocked = true
      },
      assertInstallAdmission: () => {
        if (uninstallBlocked) throw new Error('PLUGIN_UNINSTALL_INCOMPLETE')
      }
    })

    const result = await queue.enqueue(installRequest)

    expect(result).toEqual({ status: 'error', message: 'PLUGIN_UNINSTALL_INCOMPLETE' })
    expect(installer.finalizeInstall).not.toHaveBeenCalled()
    expect(installer.discardPrepared).toHaveBeenCalledWith(prepared)
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
        name: 'touch-below-floor',
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

    // The source confirmation now runs for a non-official plugin (#902), so it has to be
    // answered before the sdkapi check this test is actually about is reached.
    let queueRef: PluginInstallQueue | null = null
    const transport = {
      sendToWindow: vi.fn().mockImplementation(async (_windowId, event, payload) => {
        if (event !== PluginEvents.install.confirm) return
        const request = payload as PluginInstallConfirmRequest
        if (request.kind === 'source') {
          queueRef?.handleConfirmResponse({ taskId: request.taskId, decision: 'accept' })
        }
      })
    } as unknown as ITuffTransportMain

    const queue = new PluginInstallQueue(installer, transport, 1, {
      resolvePermissionConfirmation: () => {
        throw new Error(
          'Plugin "touch-below-floor" is blocked because manifest.json must declare sdkapi >= 251212.'
        )
      }
    })
    queueRef = queue

    const result = await queue.enqueue(installRequest)

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toContain('must declare sdkapi >=')
    }
    expect(installer.finalizeInstall).not.toHaveBeenCalled()
    expect(installer.discardPrepared).toHaveBeenCalledWith(prepared)
  })
})

/**
 * That renderer-supplied metadata cannot switch the consent prompt off (#902).
 *
 * `metadata.trusted` was read into a trustedHint and used to skip requestConfirmation, so any
 * code running in the renderer could send `{trusted: true}` and install without a prompt.
 * officialActual, the field next to it, was already recomputed in the main process — this one
 * was the client-authoritative outlier.
 */
describe('install confirmation cannot be waived by the request', () => {
  function createQueue(options: { official: boolean; metadata?: Record<string, unknown> }) {
    const installRequest: PluginInstallRequest = {
      source: 'https://example.com/plugin.tpex',
      metadata: options.metadata
    }

    const prepared = {
      request: installRequest,
      providerResult: { provider: 'tpex', official: options.official, metadata: {} },
      manifest: { name: 'touch-demo', version: '1.0.0' }
    } as unknown as PreparedPluginInstall

    const installer = {
      prepareInstall: vi.fn().mockResolvedValue(prepared),
      finalizeInstall: vi.fn().mockResolvedValue({
        manifest: prepared.manifest,
        providerResult: prepared.providerResult
      }),
      discardPrepared: vi.fn().mockResolvedValue(undefined)
    } as unknown as PluginInstaller

    const sourceConfirmRequests: PluginInstallConfirmRequest[] = []
    let queueRef: PluginInstallQueue | null = null
    const transport = {
      sendToWindow: vi.fn().mockImplementation(async (_windowId, event, payload) => {
        if (event !== PluginEvents.install.confirm) return
        const request = payload as PluginInstallConfirmRequest
        if (request.kind !== 'source') return
        sourceConfirmRequests.push(request)
        queueRef?.handleConfirmResponse({ taskId: request.taskId, decision: 'accept' })
      })
    } as unknown as ITuffTransportMain

    const queue = new PluginInstallQueue(installer, transport, 1, {})
    queueRef = queue
    return { queue, installRequest, sourceConfirmRequests }
  }

  it('still asks when the request claims the user already trusted it', async () => {
    // The regression: this installed with no prompt at all.
    const { queue, installRequest, sourceConfirmRequests } = createQueue({
      official: false,
      metadata: { trusted: true }
    })

    const result = await queue.enqueue(installRequest)

    expect(result.status).toBe('success')
    expect(sourceConfirmRequests).toHaveLength(1)
  })

  it('asks for a plain untrusted request too', async () => {
    const { queue, installRequest, sourceConfirmRequests } = createQueue({ official: false })
    await queue.enqueue(installRequest)
    expect(sourceConfirmRequests).toHaveLength(1)
  })

  it('does not ask when the main process itself established the plugin is official', async () => {
    // Positive control, and the boundary that must not move: officialActual is recomputed from
    // prepared.providerResult, not read from the request, so it is not forgeable the same way.
    const { queue, installRequest, sourceConfirmRequests } = createQueue({ official: true })
    await queue.enqueue(installRequest)
    expect(sourceConfirmRequests).toHaveLength(0)
  })

  it('ignores a request claiming the plugin is official when the provider says otherwise', async () => {
    // metadata.official is read into officialHint, which is a hint only; the skip is driven by
    // officialActual. Asserted so that field cannot drift into being authoritative either.
    const { queue, installRequest, sourceConfirmRequests } = createQueue({
      official: false,
      metadata: { official: true, trusted: true }
    })

    await queue.enqueue(installRequest)
    expect(sourceConfirmRequests).toHaveLength(1)
  })
})

describe('PluginInstallQueue npm trust tier gate', () => {
  it('handles @talex-touch/* npm-verified installs without PLUGIN_TRUST_METADATA_REQUIRED and requires source + permission prompts', async () => {
    const installRequest: PluginInstallRequest = {
      source: 'npm:@talex-touch/clipboard-history-plugin@1.2.0',
      metadata: { official: true }
    }
    const prepared = {
      request: installRequest,
      providerResult: {
        provider: 'npm',
        // Even if a caller/mock set official:true without Nexus attestation, queue must enforce official:false
        official: true,
        filePath: '/tmp/clipboard-history-1.2.0.tgz',
        metadata: {
          packageName: '@talex-touch/clipboard-history-plugin',
          resolvedVersion: '1.2.0',
          trustTier: 'npm-verified',
          officialScope: true,
          unstamped: false
        }
      },
      manifest: {
        name: 'clipboard-history',
        version: '1.2.0',
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

    const receivedConfirmations: PluginInstallConfirmRequest[] = []
    let queueRef: PluginInstallQueue | null = null
    const transport = {
      sendToWindow: vi.fn().mockImplementation(async (_windowId, event, payload) => {
        if (event !== PluginEvents.install.confirm) return
        const req = payload as PluginInstallConfirmRequest
        receivedConfirmations.push(req)
        queueRef?.handleConfirmResponse({
          taskId: req.taskId,
          decision: 'accept',
          grantMode: 'always'
        })
      })
    } as unknown as ITuffTransportMain

    const onInstallCompleted = vi.fn().mockResolvedValue(undefined)
    const queue = new PluginInstallQueue(installer, transport, 1, {
      resolvePermissionConfirmation: () => ({
        taskId: '',
        kind: 'permissions',
        pluginId: 'clipboard-history',
        pluginName: 'clipboard-history',
        permissions: {
          required: ['clipboard.read'],
          optional: [],
          reasons: { 'clipboard.read': 'read clipboard history' }
        }
      }),
      onInstallCompleted
    })
    queueRef = queue

    const result = await queue.enqueue(installRequest)

    expect(result).toMatchObject({
      status: 'success',
      provider: 'npm',
      official: false
    })
    expect(receivedConfirmations.map((req) => req.kind)).toEqual(['source', 'permissions'])
    expect(receivedConfirmations[0]?.official).toBe(false)
    expect(installer.finalizeInstall).toHaveBeenCalledWith(prepared, {
      installOptions: {
        enforceProdMode: true,
        stripRootDir: 'package'
      }
    })
    expect(onInstallCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        providerResult: expect.objectContaining({ official: false })
      })
    )
  })

  it('passes allowUnstampedNpm only for verified unstamped npm-community installs', async () => {
    const installRequest: PluginInstallRequest = {
      source: 'npm:tuff-plugin-community@1.0.0'
    }
    const prepared = {
      request: installRequest,
      providerResult: {
        provider: 'npm',
        official: false,
        filePath: '/tmp/community-1.0.0.tgz',
        metadata: {
          packageName: 'tuff-plugin-community',
          resolvedVersion: '1.0.0',
          trustTier: 'npm-community',
          officialScope: false,
          unstamped: true
        }
      },
      manifest: {
        name: 'community',
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

    let queueRef: PluginInstallQueue | null = null
    const transport = {
      sendToWindow: vi.fn().mockImplementation(async (_windowId, event, payload) => {
        if (event !== PluginEvents.install.confirm) return
        const req = payload as PluginInstallConfirmRequest
        queueRef?.handleConfirmResponse({ taskId: req.taskId, decision: 'accept' })
      })
    } as unknown as ITuffTransportMain

    const queue = new PluginInstallQueue(installer, transport, 1, {})
    queueRef = queue

    const result = await queue.enqueue(installRequest)
    expect(result.status).toBe('success')
    expect(installer.finalizeInstall).toHaveBeenCalledWith(prepared, {
      installOptions: {
        enforceProdMode: true,
        stripRootDir: 'package',
        allowUnstampedNpm: true
      }
    })
  })
})
