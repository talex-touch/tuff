import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  evaluatePermissionPluginSdkHardCutGate,
  registerPermissionPluginBridge,
  resetPermissionPluginBridge,
  resolvePermissionPluginDeclaredSdkApi,
  teardownPermissionPluginStorage
} from './permission-ports'

describe('permission-ports', () => {
  afterEach(() => {
    resetPermissionPluginBridge()
  })

  it('fails closed for sdkapi resolution when unregistered, non-numeric, or throwing', async () => {
    await expect(resolvePermissionPluginDeclaredSdkApi('touch-demo')).resolves.toBeUndefined()

    const disposeInvalid = registerPermissionPluginBridge({
      resolvePluginDeclaredSdkApi: () => '260615' as unknown as number
    })
    await expect(resolvePermissionPluginDeclaredSdkApi('touch-demo')).resolves.toBeUndefined()
    disposeInvalid()

    const disposeThrowing = registerPermissionPluginBridge({
      resolvePluginDeclaredSdkApi: async () => {
        throw new Error('bridge error')
      }
    })
    await expect(resolvePermissionPluginDeclaredSdkApi('touch-demo')).resolves.toBeUndefined()
    disposeThrowing()
  })

  it('supports idempotent non-clobbering disposal for partial bridge registrations', async () => {
    const firstResolver = vi.fn(() => 251212)
    const secondResolver = vi.fn(() => 260615)
    const teardown = vi.fn(async () => undefined)

    const disposeFirst = registerPermissionPluginBridge({
      resolvePluginDeclaredSdkApi: firstResolver,
      teardownPluginStorage: teardown
    })
    const disposeSecond = registerPermissionPluginBridge({
      resolvePluginDeclaredSdkApi: secondResolver
    })

    // Disposing the superseded registration clears teardown (still owned) without clobbering secondResolver.
    disposeFirst()
    disposeFirst()

    await expect(resolvePermissionPluginDeclaredSdkApi('touch-demo')).resolves.toBe(260615)
    await teardownPermissionPluginStorage('touch-demo')
    expect(teardown).not.toHaveBeenCalled()

    disposeSecond()
    await expect(resolvePermissionPluginDeclaredSdkApi('touch-demo')).resolves.toBeUndefined()
  })

  it('propagates errors from registered plugin storage teardown handlers', async () => {
    const teardown = vi.fn(async () => {
      throw new Error('storage teardown failed')
    })
    const dispose = registerPermissionPluginBridge({ teardownPluginStorage: teardown })

    await expect(teardownPermissionPluginStorage('touch-demo')).rejects.toThrow(
      'storage teardown failed'
    )
    expect(teardown).toHaveBeenCalledWith('touch-demo')
    dispose()
  })

  it('uses the pure baseline sdk hard-cut gate by default and fails closed when a custom gate throws', () => {
    expect(evaluatePermissionPluginSdkHardCutGate('touch-demo', undefined)).toMatchObject({
      blocked: true,
      reason: 'missing-sdkapi'
    })
    expect(evaluatePermissionPluginSdkHardCutGate('touch-demo', 251111)).toMatchObject({
      blocked: true,
      reason: 'outdated-sdkapi'
    })
    expect(evaluatePermissionPluginSdkHardCutGate('touch-demo', 251212)).toMatchObject({
      blocked: false
    })

    const disposeCustom = registerPermissionPluginBridge({
      getPluginSdkHardCutGate: () => {
        throw new Error('unexpected gate failure')
      }
    })
    expect(evaluatePermissionPluginSdkHardCutGate('touch-demo', 251212)).toMatchObject({
      blocked: true,
      reason: 'unsupported-sdkapi'
    })
    disposeCustom()
  })
})
