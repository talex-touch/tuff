import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, loadPluginModuleWithSourceTransform, withoutGlobal } from './plugin-loader'

const devUtilsUrl = new URL('../../../../plugins/touch-dev-utils/index.js', import.meta.url)

// e37c92c8c removed the __test export in the isolated-runtime migration. All ten
// helpers below still exist in the plugin, they are simply not exported, so they are
// re-exported at load time into this suite's copy of the module rather than adding a
// test-only export back to the shipped file -- the approach intelligence.test.ts
// already uses.
const TEST_EXPORT_NAMES = [
  'buildQueryString',
  'escapeStringLiteral',
  'formatTimestampDetails',
  'parseJwt',
  'parseQueryString',
  'toCamelCase',
  'toKebabCase',
  'toPascalCase',
  'toSnakeCase',
  'unescapeStringLiteral',
] as const

const devUtilsTest = loadPluginModuleWithSourceTransform<{
  __test: Record<(typeof TEST_EXPORT_NAMES)[number], (...args: any[]) => any>
}>(
  devUtilsUrl,
  source => `${source}\nmodule.exports.__test={${TEST_EXPORT_NAMES.join(',')}}`,
  createPluginGlobals(),
).__test

class FakeBuilder {
  item: Record<string, any>

  constructor(id: string) {
    this.item = { id, actions: [] }
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

  setMeta(meta: Record<string, any>) {
    this.item.meta = meta
    return this
  }

  createAndAddAction(id: string, type: string, title: string, payload: any) {
    this.item.actions.push({ id, type, title, payload })
    return this
  }

  build() {
    return this.item
  }
}

describe('touch-dev-utils helpers', () => {
  it('parses jwt payload safely', () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiVHVmZiIsImV4cCI6MTczNTY4OTYwMH0.signature'
    const parsed = devUtilsTest.parseJwt(token)

    expect(parsed.header.alg).toBe('HS256')
    expect(parsed.payload.sub).toBe('123')
    expect(parsed.payload.name).toBe('Tuff')
  })

  it('converts timestamp strings into normalized views', () => {
    const formatted = devUtilsTest.formatTimestampDetails('1735689600')

    expect(formatted.unixSeconds).toBe(1735689600)
    expect(formatted.unixMilliseconds).toBe(1735689600000)
    expect(formatted.iso).toContain('2025-01-01T00:00:00.000Z')
  })

  it('converts naming styles without overlapping text-tools features', () => {
    expect(devUtilsTest.toSnakeCase('HelloWorld Example')).toBe('hello_world_example')
    expect(devUtilsTest.toKebabCase('hello_worldExample')).toBe('hello-world-example')
    expect(devUtilsTest.toCamelCase('hello-world_example')).toBe('helloWorldExample')
    expect(devUtilsTest.toPascalCase('hello-world_example')).toBe('HelloWorldExample')
  })

  it('parses and builds query strings', () => {
    expect(devUtilsTest.parseQueryString('?foo=1&foo=2&bar=baz')).toEqual({
      foo: ['1', '2'],
      bar: 'baz',
    })

    expect(
      devUtilsTest.buildQueryString({
        foo: ['1', '2'],
        bar: 'baz',
      }),
    ).toBe('foo=1&foo=2&bar=baz')
  })

  it('escapes and unescapes string literals', () => {
    const escaped = devUtilsTest.escapeStringLiteral('line1\nline2\tvalue')
    expect(escaped).toBe('line1\\nline2\\tvalue')
    expect(devUtilsTest.unescapeStringLiteral(escaped)).toBe('line1\nline2\tvalue')
  })

  it('builds copy actions as plugin actions', async () => {
    const pushed: Array<Array<Record<string, any>>> = []
    const pluginModule = loadPluginModule(
      devUtilsUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        plugin: {
          feature: {
            clearItems() {},
            pushItems(items: Array<Record<string, any>>) { pushed.push(items) },
          },
          storage: {
            async getFile() {
              return null
            },
            async setFile() {},
          },
        },
      }),
    )

    await pluginModule.onFeatureTriggered('dev-utils', 'camel hello-world')

    const camelItem = pushed[0].find(item => item.title === 'camelCase')

    expect(camelItem?.actions[0]).toMatchObject({
      id: 'copy',
      type: 'plugin',
      title: '复制',
    })
    expect(camelItem?.actions[0].payload).toEqual({ text: expect.any(String) })
  })

  // e37c92c8c moved the permission model host-side: this plugin no longer calls the
  // permission SDK, it calls clipboard.writeText and reads the thrown error, where
  // PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED means denied and anything else means the
  // write failed (index.js:561-570). The two tests here drove permission.request,
  // which nothing reads any more.
  const HOST_DENIED = 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'

  function copyItem(text: string) {
    return {
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: text }],
    }
  }

  it('blocks copy action when the host denies clipboard.write', async () => {
    const writeText = vi.fn(async () => {
      throw Object.assign(new Error('/private/clipboard denied'), { code: HOST_DENIED })
    })
    const pluginModule = loadPluginModule(
      devUtilsUrl,
      createPluginGlobals({ clipboard: { writeText } }),
    )

    const result = await pluginModule.onItemAction(copyItem('helloWorld'))

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
      message: '缺少 clipboard.write 权限',
    })
  })

  it('separates a failed clipboard write from a denied one', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('clipboard transport failed')
    })
    const pluginModule = loadPluginModule(
      devUtilsUrl,
      createPluginGlobals({ clipboard: { writeText } }),
    )

    const result = await pluginModule.onItemAction(copyItem('helloWorld'))

    // Reporting a transport failure as a denial sends the user to a permission screen
    // that has nothing to fix.
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'clipboard-write-failed',
      message: '复制失败',
    })
  })

  it('blocks copy action when the host exposes no clipboard', async () => {
    const pluginModule = loadPluginModule(
      devUtilsUrl,
      createPluginGlobals({ clipboard: withoutGlobal() }),
    )

    const result = await pluginModule.onItemAction(copyItem('helloWorld'))

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'clipboard-unavailable',
      message: '当前环境不支持写入剪贴板',
    })
  })

  it('copies the payload when the host allows it', async () => {
    const writeText = vi.fn(async () => undefined)
    const pluginModule = loadPluginModule(
      devUtilsUrl,
      createPluginGlobals({ clipboard: { writeText } }),
    )

    const result = await pluginModule.onItemAction(copyItem('helloWorld'))

    expect(result).toMatchObject({ externalAction: true, status: 'started' })
    expect(writeText).toHaveBeenCalledWith('helloWorld')
  })

  it('copies action payload after clipboard.write permission is granted', async () => {
    const writeText = vi.fn()
    const pluginModule = loadPluginModule(
      devUtilsUrl,
      createPluginGlobals({
        clipboard: { writeText },
        permission: {
          check: async () => true,
          request: vi.fn(),
        },
      }),
    )

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: 'helloWorld' }],
    })

    expect(writeText).toHaveBeenCalledWith('helloWorld')
    expect(result).toMatchObject({ externalAction: true, status: 'started' })
  })
})
