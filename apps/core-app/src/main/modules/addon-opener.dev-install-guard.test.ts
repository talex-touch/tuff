/**
 * The dev-install handler installs a plugin from a caller-supplied path, registering it with its
 * own permissions. With only a non-empty check in front of it, a plugin view could point it at a
 * directory it had staged elsewhere on disk and get a second, attacker-authored plugin installed
 * -- lateral movement out of its own sandbox (#791).
 *
 * `app` inside onInit is the runtime's app, not the module-level electron import, so isPackaged
 * is injected through the runtime stub rather than mocked globally.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const installDevPluginFromPathMock = vi.hoisted(() => vi.fn(async () => ({ status: 'success' })))
const transportMock = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown, context?: unknown) => unknown>(),
  on: vi.fn()
}))

// The import graph reaches temp-file.service, plugin-module and sentry-service, all of which
// touch electron at module scope. This harness is the repo's own answer to that.
import './ai/intelligence-test-harness'

vi.mock('../modules/plugin/dev-plugin-installer', () => ({
  installDevPluginFromPath: installDevPluginFromPathMock
}))

vi.mock('@talex-touch/utils/transport/main', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/transport/main')>()
  return {
    ...actual,
    getTuffTransportMain: () => ({
      on: (event: { toEventName: () => string }, handler: (p: unknown, c?: unknown) => unknown) => {
        transportMock.handlers.set(event.toEventName(), handler)
        return vi.fn()
      }
    })
  }
})

import { OpenerEvents } from '@talex-touch/utils/transport/events'
import { AddonOpenerModule } from './addon-opener'

type DevInstallHandler = (
  payload: { path?: string; forceUpdate?: boolean },
  context?: { plugin?: { name: string } }
) => Promise<{ status: string; error?: string }>

function captureDevInstallHandler(isPackaged: boolean): DevInstallHandler {
  transportMock.handlers.clear()
  const module = new AddonOpenerModule()
  module.onInit({
    app: {
      app: {
        isPackaged,
        on: vi.fn(),
        setAsDefaultProtocolClient: vi.fn(),
        isDefaultProtocolClient: vi.fn(() => true),
        removeAsDefaultProtocolClient: vi.fn(),
        getPath: vi.fn(() => '/tmp/tuff-test')
      },
      window: { window: { isDestroyed: () => true, on: vi.fn() } },
      channel: {}
    },
    file: { dirPath: '/tmp' }
  } as never)

  const handler = transportMock.handlers.get(OpenerEvents.install.dev.toEventName())
  if (!handler) throw new Error('dev install handler was not registered')
  return handler as DevInstallHandler
}

describe('dev plugin install is host-only and development-only', () => {
  beforeEach(() => {
    installDevPluginFromPathMock.mockClear()
  })

  it('插件调用被拒绝,且安装器根本不会被调用', async () => {
    const handler = captureDevInstallHandler(false)

    await expect(
      handler({ path: '/tmp/staged-plugin' }, { plugin: { name: 'third-party' } })
    ).resolves.toMatchObject({ status: 'error', error: 'HOST_ONLY' })
    expect(installDevPluginFromPathMock).not.toHaveBeenCalled()
  })

  it('打包构建中一律拒绝', async () => {
    const handler = captureDevInstallHandler(true)

    await expect(handler({ path: '/tmp/staged-plugin' }, {})).resolves.toMatchObject({
      status: 'error',
      error: 'DEV_ONLY'
    })
    expect(installDevPluginFromPathMock).not.toHaveBeenCalled()
  })

  it('开发构建里的宿主调用仍然可以安装(否则上面两条会掩盖功能损坏)', async () => {
    const handler = captureDevInstallHandler(false)

    await handler({ path: '/tmp/my-plugin', forceUpdate: true }, {})

    expect(installDevPluginFromPathMock).toHaveBeenCalledWith('/tmp/my-plugin', {
      forceUpdate: true
    })
  })
})
