import { readFileSync } from 'node:fs'
import { PLUGIN_BLOCKED_REASONS } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, loadPluginModuleWithSourceTransform, withoutGlobal } from './plugin-loader'

const devToolboxUrl = new URL('../../../../plugins/touch-dev-toolbox/index.js', import.meta.url)

// The plugin exports its lifecycle and nothing else: e37c92c8c removed the __test
// export in the isolated-runtime migration. Both functions below still exist, they
// are simply not exported, so they are re-exported at load time into this test's
// copy of the module rather than adding a test-only export to the shipped file --
// the same approach intelligence.test.ts takes.
const TEST_EXPORT_NAMES = ['parseToolboxConfig', 'normalizeExternalUrl'] as const

const toolboxTest = loadPluginModuleWithSourceTransform<{
  __test: Record<(typeof TEST_EXPORT_NAMES)[number], (...args: any[]) => any>
}>(
  devToolboxUrl,
  source => `${source}\nmodule.exports.__test={${TEST_EXPORT_NAMES.join(',')}}`,
  createPluginGlobals(),
).__test

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

  it('normalizes only HTTP and HTTPS external URLs', () => {
    expect(toolboxTest.normalizeExternalUrl('https://example.com/docs')).toBe('https://example.com/docs')
    expect(toolboxTest.normalizeExternalUrl('http://example.com')).toBe('http://example.com/')
    expect(toolboxTest.normalizeExternalUrl('file:///tmp/toolbox.json')).toBe('')
    expect(toolboxTest.normalizeExternalUrl('javascript:alert(1)')).toBe('')
    expect(toolboxTest.normalizeExternalUrl('not a url')).toBe('')
  })

  // e37c92c8c moved the permission model host-side. This plugin no longer touches the
  // permission SDK at all: onItemAction calls openUrl and reads the thrown error,
  // where PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED means denied and anything else
  // means the call failed (index.js:226-241). The tests below drove permission.check /
  // permission.request, which nothing reads any more.
  //
  // They also passed actionId and payload inside meta. onItemAction resolves both from
  // item.actions[0] (index.js:197-199), so action came back null, every branch was
  // skipped, and the handler returned undefined -- which is why all eight reported
  // "expected undefined to match object".
  const HOST_DENIED = 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'

  function openLinkItem(url: string) {
    return {
      meta: { defaultAction: 'dev-toolbox' },
      actions: [{ id: 'open-link', payload: { url } }],
    }
  }

  it('rejects a non-HTTP link before reaching the host', async () => {
    const openUrl = vi.fn()
    const pluginModule = loadPluginModule(devToolboxUrl, createPluginGlobals({ openUrl }))

    const result = await pluginModule.onItemAction(openLinkItem('file:///tmp/toolbox.json'))

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'invalid-url',
      message: '链接地址无效，仅支持 HTTP/HTTPS',
    })
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('rejects a javascript: link before reaching the host', async () => {
    const openUrl = vi.fn()
    const pluginModule = loadPluginModule(devToolboxUrl, createPluginGlobals({ openUrl }))

    const result = await pluginModule.onItemAction(openLinkItem('javascript:alert(1)'))

    expect(result).toMatchObject({ status: 'blocked', reason: 'invalid-url' })
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('blocks link opening when the host denies network permission', async () => {
    const openUrl = vi.fn(async () => {
      throw Object.assign(new Error('/private/open denied'), { code: HOST_DENIED })
    })
    const pluginModule = loadPluginModule(devToolboxUrl, createPluginGlobals({ openUrl }))

    const result = await pluginModule.onItemAction(openLinkItem('https://example.com'))

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: PLUGIN_BLOCKED_REASONS.PERMISSION_DENIED,
      message: '缺少 network.internet 权限',
    })
  })

  it('separates a failed host open from a denied one', async () => {
    const openUrl = vi.fn(async () => {
      throw new Error('open transport failed')
    })
    const pluginModule = loadPluginModule(devToolboxUrl, createPluginGlobals({ openUrl }))

    const result = await pluginModule.onItemAction(openLinkItem('https://example.com'))

    // A transport failure reported as a permission denial sends the user to a
    // permission screen that has nothing to fix.
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'open-url-failed',
      message: '打开外部链接失败',
    })
  })

  it('blocks link opening when the host exposes no openUrl capability', async () => {
    const pluginModule = loadPluginModule(devToolboxUrl, createPluginGlobals({
      openUrl: withoutGlobal(),
    }))

    const result = await pluginModule.onItemAction(openLinkItem('https://example.com'))

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'open-url-unavailable',
      message: '当前运行时不支持打开外部链接',
    })
  })

  it('opens a normalized link when the host allows it', async () => {
    const openUrl = vi.fn(async () => undefined)
    const pluginModule = loadPluginModule(devToolboxUrl, createPluginGlobals({ openUrl }))

    const result = await pluginModule.onItemAction(openLinkItem('http://example.com'))

    expect(result).toMatchObject({ externalAction: true, status: 'started' })
    // normalizeExternalUrl runs before the host call, so the host receives the parsed
    // form rather than the raw payload.
    expect(openUrl).toHaveBeenCalledWith('http://example.com/')
  })

  it('ignores items whose default action is not the toolbox', async () => {
    const openUrl = vi.fn()
    const pluginModule = loadPluginModule(devToolboxUrl, createPluginGlobals({ openUrl }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'something-else' },
      actions: [{ id: 'open-link', payload: { url: 'https://example.com' } }],
    })

    expect(result).toBeUndefined()
    expect(openUrl).not.toHaveBeenCalled()
  })
})
