import { describe, expect, it } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const snipasteUrl = new URL('../../../../plugins/touch-snipaste/index.js', import.meta.url)

describe('snipaste plugin capability boundary', () => {
  it('keeps permission sdk unavailable visible when execution is blocked', async () => {
    const pluginModule = loadPluginModule(snipasteUrl, createPluginGlobals({
      permission: withoutGlobal(),
    }))

    const result = await pluginModule.__test.runSnipaste(['snip'])

    expect(result).toMatchObject({
      status: 'blocked',
      ok: false,
      reason: 'permission-sdk-unavailable',
    })
    expect(pluginModule.__test.formatBlockedMessage(result.reason)).toBe('权限系统不可用，无法启动 Snipaste')
  })

  it('keeps denied permission visible without spawning Snipaste', async () => {
    const pluginModule = loadPluginModule(snipasteUrl, createPluginGlobals({
      permission: {
        check: async () => false,
        request: async () => false,
      },
    }))

    const result = await pluginModule.__test.runSnipaste(['snip'])

    expect(result).toMatchObject({
      status: 'blocked',
      ok: false,
      reason: 'permission-denied',
    })
    expect(pluginModule.__test.formatBlockedMessage(result.reason)).toBe('缺少 system.shell 权限')
  })
})
