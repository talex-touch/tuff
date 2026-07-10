import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPermissionModule: vi.fn(),
  getPluginByName: vi.fn()
}))

vi.mock('./index', () => ({
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
  plugin: { name: 'touch-test', verified: true, uniqueKey: 'owner-key' }
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

  it('rejects a payload sdkapi that disagrees with the declared plugin version', async () => {
    mocks.getPermissionModule.mockReturnValue({
      checkPermission: vi.fn(() => ({ allowed: true }))
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
