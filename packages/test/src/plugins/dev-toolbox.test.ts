import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const devToolboxUrl = new URL('../../../../plugins/touch-dev-toolbox/index.js', import.meta.url)
const toolboxPlugin = loadPluginModule(devToolboxUrl)
const { __test: toolboxTest } = toolboxPlugin

describe('dev toolbox config', () => {
  it('declares network permission for opening toolbox links', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../../plugins/touch-dev-toolbox/manifest.json', import.meta.url), 'utf8'))

    expect(manifest.permissions.optional).toContain('network.internet')
    expect(manifest.permissionReasons['network.internet']).toContain('默认浏览器打开')
  })

  it('uses defaults when empty', () => {
    const config = toolboxTest.parseToolboxConfig(null)
    expect(Array.isArray(config.links)).toBe(true)
    expect(config.links.length).toBe(0)
  })

  it('normalizes links only', () => {
    const config = toolboxTest.parseToolboxConfig({
      workspacePath: '/tmp/project',
      commands: [{ id: 'lint', command: 'pnpm lint' }],
      links: [{ title: 'Docs', url: 'https://example.com' }],
    })

    expect(config.links.length).toBe(1)
    expect(config.workspacePath).toBeUndefined()
    expect(config.commands).toBeUndefined()
  })

  it('blocks link opening when network permission is denied', async () => {
    const openUrl = vi.fn()
    const request = vi.fn(async () => false)
    const pluginModule = loadPluginModule(devToolboxUrl, createPluginGlobals({
      openUrl,
      permission: {
        check: async () => false,
        request,
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'dev-toolbox',
        actionId: 'open-link',
        payload: { url: 'https://example.com' },
      },
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
    expect(request).toHaveBeenCalledWith('network.internet', '需要 network.internet 权限以默认浏览器打开开发工具箱链接')
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('blocks link opening when permission sdk is unavailable', async () => {
    const openUrl = vi.fn()
    const pluginModule = loadPluginModule(devToolboxUrl, createPluginGlobals({
      openUrl,
      permission: withoutGlobal(),
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'dev-toolbox',
        actionId: 'open-link',
        payload: { url: 'https://example.com' },
      },
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-sdk-unavailable',
    })
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('blocks link opening when network permission request fails', async () => {
    const openUrl = vi.fn()
    const pluginModule = loadPluginModule(devToolboxUrl, createPluginGlobals({
      openUrl,
      permission: {
        check: async () => false,
        request: async () => {
          throw new Error('permission transport failed')
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'dev-toolbox',
        actionId: 'open-link',
        payload: { url: 'https://example.com' },
      },
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-request-failed',
    })
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('opens link after network permission is granted', async () => {
    const openUrl = vi.fn(async () => undefined)
    const pluginModule = loadPluginModule(devToolboxUrl, createPluginGlobals({
      openUrl,
      permission: {
        check: async () => true,
        request: async () => true,
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'dev-toolbox',
        actionId: 'open-link',
        payload: { url: 'https://example.com' },
      },
    })

    expect(result).toMatchObject({ externalAction: true, status: 'started' })
    expect(openUrl).toHaveBeenCalledWith('https://example.com')
  })
})
