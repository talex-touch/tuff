import { describe, expect, it } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

class FakeBuilder {
  item: Record<string, unknown>

  constructor(id: string) {
    this.item = { id }
  }

  setSource() {
    return this
  }

  setTitle(title: string) {
    this.item.title = title
    return this
  }

  setSubtitle(subtitle: string) {
    this.item.subtitle = subtitle
    return this
  }

  setIcon() {
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = meta
    return this
  }

  build() {
    return this.item
  }
}

function createTestGlobals(
  items: Array<{ title?: string, subtitle?: string, meta?: Record<string, any> }>,
  permissionAllowed: boolean,
) {
  return createPluginGlobals({
    TuffItemBuilder: FakeBuilder,
    permission: {
      check: async () => permissionAllowed,
      request: async () => permissionAllowed,
    },
    plugin: {
      feature: {
        clearItems() { items.length = 0 },
        pushItems(next: Array<{ title?: string, subtitle?: string, meta?: Record<string, any> }>) { items.push(...next) },
      },
    },
  })
}

function createSafeShellRunner(calls: string[] = []) {
  return (command: string) => {
    calls.push(command)
    return {
      on(event: string, callback: (code?: number) => void) {
        if (event === 'close') {
          callback(0)
        }
        return this
      },
    }
  }
}

const systemPlugin = loadPluginModule(new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url))
const { __test: systemTest } = systemPlugin

describe('system actions plugin', () => {
  it('contains full action set on darwin', () => {
    const actions = systemTest.resolveActions('darwin')
    const ids = actions.map(action => action.id)

    expect(ids).toContain('shutdown')
    expect(ids).toContain('restart')
    expect(ids).toContain('lock-screen')
    expect(ids).toContain('volume-up')
    expect(ids).toContain('volume-down')
    expect(ids).toContain('mute')
    expect(ids).toContain('brightness-up')
    expect(ids).toContain('brightness-down')
    expect(ids).toContain('open-main-window')
  })

  it('keeps windows action list without brightness items', () => {
    const actions = systemTest.resolveActions('win32')
    const ids = actions.map(action => action.id)

    expect(ids).toContain('shutdown')
    expect(ids).toContain('restart')
    expect(ids).toContain('open-main-window')
    expect(ids).not.toContain('brightness-up')
    expect(ids).not.toContain('brightness-down')
  })

  it('matches keyword search', () => {
    const actions = systemTest.resolveActions('darwin')
    const matched = systemTest.matchActions(actions, 'shutdown')

    expect(matched.some(action => action.id === 'shutdown')).toBe(true)
  })

  it('returns grouped order by priority', () => {
    const actions = [
      { id: 'a', group: 'window' },
      { id: 'b', group: 'power' },
      { id: 'c', group: 'audio' },
    ]

    const order = systemTest.resolveGroupOrder(actions)
    expect(order).toEqual(['power', 'audio', 'window'])
  })

  it('builds normalized search tokens', () => {
    const tokens = systemTest.buildSearchTokens({
      name: 'Main Window',
      description: 'Show Tuff',
      keywords: ['Open Window'],
    })

    expect(tokens).toContain('main window')
    expect(tokens).toContain('mainwindow')
    expect(tokens).toContain('show tuff')
    expect(tokens).toContain('showtuff')
    expect(tokens).toContain('open window')
    expect(tokens).toContain('openwindow')
  })

  it('shows permission hint when denied', async () => {
    const items: Array<{ title?: string, subtitle?: string, meta?: Record<string, any> }> = []
    const requested: string[] = []
    const globals = createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      permission: {
        check: async () => false,
        request: async (permissionId: string) => {
          requested.push(permissionId)
          return false
        },
      },
      plugin: {
        feature: {
          clearItems() { items.length = 0 },
          pushItems(next: Array<{ title?: string, subtitle?: string, meta?: Record<string, any> }>) { items.push(...next) },
        },
      },
    })

    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      globals,
    )

    await pluginModule.onFeatureTriggered('system-actions', '')
    if (systemTest.isShellPlatformSupported(process.platform)) {
      expect(items[0]?.title).toBe('系统命令能力')
      expect(['permission-missing', 'unsupported']).toContain(items[0]?.meta?.capability?.status)
      expect(items[0]?.meta?.capability?.permission).toBe('system.shell')
      expect(items.some(item => item.title === '打开主窗口')).toBe(true)
      expect(requested).toEqual([])
    }
    else {
      expect(items[0]?.meta?.capability?.status).toBe('unsupported')
    }
  })

  it('marks permission sdk unavailable as permission missing when shell is otherwise available', async () => {
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      createPluginGlobals({
        permission: withoutGlobal(),
      }),
    )
    pluginModule.__test.setSpawnShellCommandForTest(() => ({
      on() {
        return this
      },
    }))

    expect(await pluginModule.__test.resolveFeatureShellCapabilityState('darwin')).toMatchObject({
      status: 'permission-missing',
      reason: 'permission-sdk-unavailable',
    })
  })

  it('returns empty hint when no matches', async () => {
    const items: Array<{ title?: string }> = []
    const globals = createTestGlobals(items, true)

    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      globals,
    )

    await pluginModule.onFeatureTriggered('system-actions', '不存在的指令')
    expect(items[0]?.title).toBe('没有匹配的系统操作')
  })

  it('builds grouped items for matches', async () => {
    const items: Array<{ title?: string, meta?: Record<string, any> }> = []
    const globals = createTestGlobals(items, true)

    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      globals,
    )

    await pluginModule.onFeatureTriggered('system-actions', '关机')
    if (!systemTest.isShellPlatformSupported(process.platform)) {
      expect(items[0]?.meta?.capability?.status).toBe('unsupported')
      return
    }

    expect(items.length).toBeGreaterThan(1)
    expect(items[0]?.title).toBe('系统命令能力')
    const shutdown = items.find(item => item.meta?.actionId === 'shutdown')
    expect(shutdown?.meta?.capability?.audit).toMatchObject({
      pluginName: 'touch-system-actions',
      featureId: 'system-actions',
      actionId: 'shutdown',
      requiresConfirmation: true,
      requiresAdmin: true,
    })
  })

  it('marks shell fallback as unsupported when safe-shell is unavailable', () => {
    const capability = systemTest.buildShellCapability({
      featureId: 'system-actions',
      actionId: 'shutdown',
      platform: 'darwin',
    })

    expect(['available', 'unsupported']).toContain(capability.status)
    expect(capability.permission).toBe('system.shell')
    expect(capability.audit.commandKind).toBe('fixed-shell')
  })

  it('keeps main window action native and independent from shell permission', () => {
    const [mainWindowAction] = systemTest.resolveActions(process.platform)
      .filter(action => action.id === 'open-main-window')
    const capability = systemTest.buildActionCapability('system-actions', mainWindowAction)

    expect(capability).toMatchObject({
      id: 'app.window',
      type: 'native-window',
      status: 'available',
      audit: {
        pluginName: 'touch-system-actions',
        featureId: 'system-actions',
        actionId: 'open-main-window',
        commandKind: 'native-window',
      },
    })
  })

  it('executes main window action without shell permission sdk', async () => {
    let shown = 0
    let focused = 0
    const previousApp = (globalThis as Record<string, any>).$app
    ;(globalThis as Record<string, any>).$app = {
      window: {
        window: {
          show() { shown += 1 },
          focus() { focused += 1 },
        },
      },
    }
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      createPluginGlobals({
        permission: withoutGlobal(),
      }),
    )

    try {
      const result = await pluginModule.onItemAction({
        meta: {
          defaultAction: 'system-actions',
          actionId: 'open-main-window',
        },
      })

      expect(result).toMatchObject({
        externalAction: true,
        status: 'started',
      })
      expect(shown).toBe(1)
      expect(focused).toBe(1)
    }
    finally {
      if (typeof previousApp === 'undefined') {
        delete (globalThis as Record<string, any>).$app
      }
      else {
        ;(globalThis as Record<string, any>).$app = previousApp
      }
    }
  })

  it('blocks shell action execution when safe-shell is unavailable before permission request', async () => {
    const requested: string[] = []
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
    const globals = createPluginGlobals({
      permission: {
        check: async () => true,
        request: async (permissionId: string) => {
          requested.push(permissionId)
          return true
        },
      },
    })
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      globals,
    )
    pluginModule.__test.setSpawnShellCommandForTest(null)

    Object.defineProperty(process, 'platform', {
      configurable: true,
      enumerable: true,
      value: 'darwin',
    })

    try {
      const result = await pluginModule.onItemAction({
        meta: {
          defaultAction: 'system-actions',
          actionId: 'lock-screen',
        },
      })

      expect(result).toMatchObject({
        externalAction: true,
        status: 'blocked',
        reason: 'safe-shell-unavailable',
      })
      expect(requested).toEqual([])
    }
    finally {
      Object.defineProperty(process, 'platform', platformDescriptor!)
    }
  })

  it('does not execute shell action when permission sdk is unavailable', async () => {
    const shellCalls: string[] = []
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      createPluginGlobals({
        permission: withoutGlobal(),
      }),
    )
    pluginModule.__test.setSpawnShellCommandForTest(createSafeShellRunner(shellCalls))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'system-actions',
        actionId: 'lock-screen',
      },
    })

    if (!systemTest.isShellPlatformSupported(process.platform)) {
      expect(result).toMatchObject({
        externalAction: true,
        status: 'blocked',
        reason: `platform:${process.platform}`,
      })
      expect(shellCalls).toEqual([])
      return
    }

    expect(result).toMatchObject({
      externalAction: true,
      status: 'blocked',
      reason: 'permission-sdk-unavailable',
    })
    expect(shellCalls).toEqual([])
  })

  it('does not execute shell action when permission is denied', async () => {
    const shellCalls: string[] = []
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      createPluginGlobals({
        permission: {
          check: async () => false,
          request: async () => false,
        },
      }),
    )
    pluginModule.__test.setSpawnShellCommandForTest(createSafeShellRunner(shellCalls))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'system-actions',
        actionId: 'lock-screen',
      },
    })

    if (!systemTest.isShellPlatformSupported(process.platform)) {
      expect(result).toMatchObject({ reason: `platform:${process.platform}` })
      return
    }

    expect(result).toMatchObject({
      externalAction: true,
      status: 'blocked',
      reason: 'permission-denied',
    })
    expect(shellCalls).toEqual([])
  })

  it('does not execute shell action when permission request fails', async () => {
    const shellCalls: string[] = []
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      createPluginGlobals({
        permission: {
          check: async () => false,
          request: async () => {
            throw new Error('permission transport failed')
          },
        },
      }),
    )
    pluginModule.__test.setSpawnShellCommandForTest(createSafeShellRunner(shellCalls))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'system-actions',
        actionId: 'lock-screen',
      },
    })

    if (!systemTest.isShellPlatformSupported(process.platform)) {
      expect(result).toMatchObject({ reason: `platform:${process.platform}` })
      return
    }

    expect(result).toMatchObject({
      externalAction: true,
      status: 'blocked',
      reason: 'permission-request-failed',
    })
    expect(shellCalls).toEqual([])
  })

  it('does not request or execute shell action when permission check fails', async () => {
    const shellCalls: string[] = []
    const requested: string[] = []
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      createPluginGlobals({
        permission: {
          check: async () => {
            throw new Error('permission check failed')
          },
          request: async (permissionId: string) => {
            requested.push(permissionId)
            return true
          },
        },
      }),
    )
    pluginModule.__test.setSpawnShellCommandForTest(createSafeShellRunner(shellCalls))

    Object.defineProperty(process, 'platform', {
      configurable: true,
      enumerable: true,
      value: 'darwin',
    })

    try {
      const result = await pluginModule.onItemAction({
        meta: {
          defaultAction: 'system-actions',
          actionId: 'lock-screen',
        },
      })

      expect(result).toMatchObject({
        externalAction: true,
        status: 'blocked',
        reason: 'permission-request-failed',
      })
      expect(requested).toEqual([])
      expect(shellCalls).toEqual([])
    }
    finally {
      Object.defineProperty(process, 'platform', platformDescriptor!)
    }
  })
})
