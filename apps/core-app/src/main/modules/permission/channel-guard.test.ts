import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPermissionModule: vi.fn(),
  getPluginByName: vi.fn()
}))

vi.mock('./permission-module-ref', () => ({
  getPermissionModule: mocks.getPermissionModule
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      getPluginByName: mocks.getPluginByName
    }
  }
}))

import { withPermission } from './channel-guard'

const pluginContext = {
  plugin: createTrustedTestPluginContext({
    name: 'touch-test',
    pluginInstanceId: 'touch-test-instance',
    uniqueKey: 'owner-key'
  })
} as HandlerContext

describe('withPermission privileged plugin mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPluginByName.mockReturnValue({ sdkapi: 260615 })
  })

  it('fails closed when the permission runtime is unavailable', async () => {
    mocks.getPermissionModule.mockReturnValue(null)
    const callback = vi.fn()
    const handler = withPermission(
      {
        permissionId: 'window.create',
        failClosedForPlugin: true,
        unavailableCode: 'PLUGIN_WINDOW_PERMISSION_UNAVAILABLE'
      },
      callback
    )

    await expect(handler({ _sdkapi: 260615 }, pluginContext)).rejects.toMatchObject({
      code: 'PLUGIN_WINDOW_PERMISSION_UNAVAILABLE',
      permissionId: 'window.create',
      pluginId: 'touch-test'
    })
    expect(callback).not.toHaveBeenCalled()
  })

  it('uses a stable privileged denial code', async () => {
    mocks.getPermissionModule.mockReturnValue({
      checkPermission: vi.fn(() => ({ allowed: false, reason: 'denied' }))
    })
    const callback = vi.fn()
    const handler = withPermission(
      {
        permissionId: 'window.create',
        failClosedForPlugin: true,
        deniedCode: 'PLUGIN_WINDOW_PERMISSION_DENIED'
      },
      callback
    )

    await expect(handler({ _sdkapi: 260615 }, pluginContext)).rejects.toMatchObject({
      code: 'PLUGIN_WINDOW_PERMISSION_DENIED'
    })
    expect(callback).not.toHaveBeenCalled()
  })

  it('rejects a forged payload sdkapi that disagrees with the declared plugin version', async () => {
    const checkPermission = vi.fn(() => ({ allowed: true }))
    mocks.getPermissionModule.mockReturnValue({
      checkPermission
    })
    const callback = vi.fn()
    const handler = withPermission(
      {
        permissionId: 'window.create',
        failClosedForPlugin: true,
        sdkMismatchCode: 'SDKAPI_MISMATCH'
      },
      callback
    )

    await expect(handler({ _sdkapi: 260428 }, pluginContext)).rejects.toMatchObject({
      code: 'SDKAPI_MISMATCH',
      permissionId: 'window.create',
      pluginId: 'touch-test'
    })
    expect(checkPermission).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', () => undefined],
    [
      'throws',
      () => {
        throw new Error('plugin metadata lookup secret')
      }
    ]
  ])('fails closed when authoritative sdkapi metadata %s', async (_case, resolvePlugin) => {
    const checkPermission = vi.fn(() => ({ allowed: true }))
    mocks.getPermissionModule.mockReturnValue({ checkPermission })
    mocks.getPluginByName.mockImplementation(resolvePlugin)
    const callback = vi.fn()
    const handler = withPermission(
      {
        permissionId: 'window.create',
        failClosedForPlugin: true,
        sdkMismatchCode: 'SDKAPI_MISMATCH'
      },
      callback
    )

    await expect(handler({ _sdkapi: 260615 }, pluginContext)).rejects.toMatchObject({
      code: 'SDKAPI_MISMATCH',
      permissionId: 'window.create',
      pluginId: 'touch-test'
    })
    expect(checkPermission).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
  })

  it('uses an outdated declared sdkapi instead of a forged current payload', async () => {
    const checkPermission = vi.fn((_pluginId, _permissionId, sdkapi) => ({
      allowed: sdkapi !== 250101,
      code: sdkapi === 250101 ? 'SDKAPI_BLOCKED' : undefined,
      reason: sdkapi === 250101 ? 'incompatible-sdk' : undefined
    }))
    mocks.getPermissionModule.mockReturnValue({ checkPermission })
    mocks.getPluginByName.mockReturnValue({ sdkapi: 250101 })
    const callback = vi.fn()
    const handler = withPermission(
      { permissionId: 'window.create', failClosedForPlugin: true },
      callback
    )

    await expect(handler({ _sdkapi: 260615 }, pluginContext)).rejects.toMatchObject({
      code: 'SDKAPI_BLOCKED'
    })
    expect(checkPermission).toHaveBeenCalledWith('touch-test', 'window.create', 250101)
    expect(callback).not.toHaveBeenCalled()
  })

  it('keeps explicit non-plugin internal calls available during startup', async () => {
    mocks.getPermissionModule.mockReturnValue(null)
    const callback = vi.fn(() => 'ok')
    const handler = withPermission(
      { permissionId: 'window.create', failClosedForPlugin: true },
      callback
    )

    await expect(handler({}, {} as HandlerContext)).resolves.toBe('ok')
    expect(callback).toHaveBeenCalledOnce()
  })

  it('does not resolve plugin sdkapi metadata for host callers', async () => {
    mocks.getPermissionModule.mockReturnValue({ checkPermission: vi.fn() })
    mocks.getPluginByName.mockImplementation(() => {
      throw new Error('host must not resolve plugin metadata')
    })
    const callback = vi.fn(() => 'ok')
    const handler = withPermission(
      { permissionId: 'window.create', failClosedForPlugin: true },
      callback
    )

    await expect(handler({ _sdkapi: 260615 }, {} as HandlerContext)).resolves.toBe('ok')
    expect(mocks.getPluginByName).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledOnce()
  })

  it('rejects caller-authored verification flags', async () => {
    mocks.getPermissionModule.mockReturnValue({
      checkPermission: vi.fn(() => ({ allowed: true }))
    })
    const callback = vi.fn()
    const handler = withPermission(
      {
        permissionId: 'window.create',
        requireVerifiedPlugin: true,
        deniedCode: 'PLUGIN_WINDOW_PERMISSION_DENIED'
      },
      callback
    )
    const forged = {
      plugin: { name: 'touch-test', uniqueKey: 'forged-key', verified: true }
    } as HandlerContext

    await expect(handler({}, forged)).rejects.toMatchObject({
      code: 'PLUGIN_WINDOW_PERMISSION_DENIED',
      pluginId: 'touch-test'
    })
    expect(callback).not.toHaveBeenCalled()
  })

  it('blocks public privileged handlers without a verified plugin context', async () => {
    mocks.getPermissionModule.mockReturnValue(null)
    const callback = vi.fn()
    const handler = withPermission(
      {
        permissionId: 'window.create',
        failClosedForPlugin: true,
        requireVerifiedPlugin: true,
        deniedCode: 'PLUGIN_WINDOW_PERMISSION_DENIED'
      },
      callback
    )

    await expect(handler({}, {} as HandlerContext)).rejects.toMatchObject({
      code: 'PLUGIN_WINDOW_PERMISSION_DENIED',
      pluginId: 'unknown'
    })
    expect(callback).not.toHaveBeenCalled()
  })
})
