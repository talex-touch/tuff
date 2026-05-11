import { describe, expect, it, vi } from 'vitest'
import { DivisionBoxSession } from './session'

vi.mock('electron', () => ({
  app: { isPackaged: true },
  WebContentsView: class {}
}))

vi.mock('fs-extra', () => ({
  default: {
    writeFileSync: vi.fn()
  }
}))

vi.mock('../../core/runtime-accessor', () => ({
  getRegisteredMainRuntime: () => ({
    transport: {
      broadcastToWindow: vi.fn()
    }
  })
}))

vi.mock('../../core/window-security-profile', () => ({
  buildWindowWebPreferences: vi.fn(() => ({}))
}))

vi.mock('../../hooks/use-electron-guard', () => ({
  useAliveWebContents: vi.fn(() => null)
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: null
  }
}))

vi.mock('../plugin/runtime/plugin-injections', () => ({
  usePluginInjections: vi.fn(() => null)
}))

describe('DivisionBoxSession', () => {
  it('hydrates initial session state before renderer reads keys', () => {
    const detachedPayload = {
      item: { id: 'demo-plugin/widget-clock' },
      query: 'time now'
    }
    const session = new DivisionBoxSession('session-1', {
      url: 'tuff://detached?itemId=demo-plugin%2Fwidget-clock',
      title: 'Clock Widget',
      pluginId: 'demo-plugin',
      initialState: {
        detachedPayload
      }
    })

    expect(session.getSessionState('detachedPayload')).toEqual(detachedPayload)
  })
})
