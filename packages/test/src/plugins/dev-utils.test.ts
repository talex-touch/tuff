import { describe, expect, it } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

const devUtilsPlugin = loadPluginModule(
  new URL('../../../../plugins/touch-dev-utils/index.js', import.meta.url),
  createPluginGlobals(),
)
const { __test: devUtilsTest } = devUtilsPlugin

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
})
