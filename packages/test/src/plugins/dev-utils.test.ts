import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const devUtilsPlugin = loadPluginModule(
  new URL('../../../../plugins/touch-dev-utils/index.js', import.meta.url),
  createPluginGlobals(),
)
const { __test: devUtilsTest } = devUtilsPlugin

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
      new URL('../../../../plugins/touch-dev-utils/index.js', import.meta.url),
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

  it('blocks copy action when clipboard.write permission is denied', async () => {
    const writeText = vi.fn()
    const request = vi.fn(async () => false)
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-dev-utils/index.js', import.meta.url),
      createPluginGlobals({
        clipboard: { writeText },
        permission: {
          check: async () => false,
          request,
        },
      }),
    )

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: 'helloWorld' }],
    })

    expect(request).toHaveBeenCalledWith('clipboard.write', '需要剪贴板写入权限以复制开发工具结果')
    expect(writeText).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('blocks copy action when permission sdk is unavailable', async () => {
    const writeText = vi.fn()
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-dev-utils/index.js', import.meta.url),
      createPluginGlobals({
        clipboard: { writeText },
        permission: withoutGlobal(),
      }),
    )

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: 'helloWorld' }],
    })

    expect(writeText).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('copies action payload after clipboard.write permission is granted', async () => {
    const writeText = vi.fn()
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-dev-utils/index.js', import.meta.url),
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
