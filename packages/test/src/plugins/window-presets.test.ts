import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

const presetsPlugin = loadPluginModule(new URL('../../../../plugins/touch-window-presets/index.js', import.meta.url))
const { __test: presetsTest } = presetsPlugin

class TestTuffItemBuilder {
  item: any

  constructor(id: string) {
    this.item = { id, meta: {} }
  }

  setSource(type: string, id: string, name: string) {
    this.item.source = { type, id, name }
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

  setIcon(icon: unknown) {
    this.item.icon = icon
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  build() {
    return this.item
  }
}

describe('window presets plugin', () => {
  it('builds windows snap script', () => {
    const script = presetsTest.buildWindowsScript('snap', {
      handle: '1024',
      side: 'left',
    })

    expect(script).toContain('SetWindowPos')
    expect(script).toContain('left')
  })

  it('normalizes windows and removes invalid/duplicate rows', () => {
    const windows = presetsTest.normalizeWindows([
      { name: 'Chrome', title: 'Docs', handle: '200', isFront: true },
      { name: 'Chrome', title: 'Docs', handle: '200', isFront: false },
      { name: '', title: 'NoName', handle: '201' },
      { name: 'VSCode', title: 'Editor', handle: '202' },
    ])

    expect(windows.length).toBe(2)
    expect(windows[0].key).toBe('h:200')
    expect(windows[1].key).toBe('h:202')
  })

  it('selects terminal and browser pair for dev preset', () => {
    const pair = presetsTest.selectDevPair([
      { key: 'h:1', name: 'Code', title: 'Workspace', isFront: true },
      { key: 'h:2', name: 'WindowsTerminal', title: 'zsh', isFront: false },
      { key: 'h:3', name: 'Chrome', title: 'Docs', isFront: false },
    ])

    expect(pair).not.toBeNull()
    expect(pair.left.name).toBe('WindowsTerminal')
    expect(pair.right.name).toBe('Chrome')
  })

  it('resolves group order presets then cleanup', () => {
    const order = presetsTest.resolveGroupOrder([
      { group: 'cleanup' },
      { group: 'presets' },
    ])

    expect(order).toEqual(['presets', 'cleanup'])
  })

  it('lists presets without requesting shell permission', async () => {
    const pushItems = vi.fn()
    const check = vi.fn().mockResolvedValue(false)
    const request = vi.fn().mockResolvedValue(false)
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-window-presets/index.js', import.meta.url),
      createPluginGlobals({
        plugin: {
          feature: {
            clearItems() {},
            pushItems,
          },
        },
        TuffItemBuilder: TestTuffItemBuilder,
        permission: { check, request },
        logger: { error() {}, warn() {} },
      }),
    )
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })

    try {
      await pluginModule.onFeatureTriggered('window-presets', '')
    }
    finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }

    expect(check).toHaveBeenCalledWith('system.shell')
    expect(request).not.toHaveBeenCalled()
    const items = pushItems.mock.calls.at(-1)?.[0]
    expect(items.some((item: any) => item.id === 'window-presets-no-permission')).toBe(true)
    expect(items.some((item: any) => item.meta?.capability?.status === 'permission-missing')).toBe(true)
  })

  it('requests shell permission only when running a preset', async () => {
    const check = vi.fn().mockResolvedValue(false)
    const request = vi.fn().mockResolvedValue(false)
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-window-presets/index.js', import.meta.url),
      createPluginGlobals({
        permission: { check, request },
        logger: { error() {}, warn() {} },
      }),
    )

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'window-presets',
        actionId: 'run-preset',
        payload: { presetId: 'split-horizontal' },
      },
    })

    expect(request).toHaveBeenCalledWith('system.shell', '需要 system.shell 权限执行窗口预设')
    expect(result.status).toBe('blocked')
    expect(result.reason).toBe('permission-missing')
  })

  it('reports unsupported platform without permission checks', async () => {
    const pushItems = vi.fn()
    const check = vi.fn().mockResolvedValue(false)
    const request = vi.fn().mockResolvedValue(false)
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-window-presets/index.js', import.meta.url),
      createPluginGlobals({
        plugin: {
          feature: {
            clearItems() {},
            pushItems,
          },
        },
        TuffItemBuilder: TestTuffItemBuilder,
        permission: { check, request },
        logger: { error() {}, warn() {} },
      }),
    )
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })

    try {
      await pluginModule.onFeatureTriggered('window-presets', '')
    }
    finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }

    expect(check).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
    const items = pushItems.mock.calls.at(-1)?.[0]
    expect(items[0].title).toBe('当前平台暂不支持窗口预设')
  })
})
