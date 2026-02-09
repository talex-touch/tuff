import { describe, expect, it } from 'vitest'
import { loadPluginModule } from './plugin-loader'

const presetsPlugin = loadPluginModule(new URL('../../../../plugins/touch-window-presets/index.js', import.meta.url))
const { __test: presetsTest } = presetsPlugin

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
})
