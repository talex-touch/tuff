import { describe, expect, it } from 'vitest'
import {
  buildPluginViewBootstrapArgument,
  parsePluginViewBootstrapArgument
} from './plugin-view-bridge'

describe('plugin view bootstrap', () => {
  it('round-trips sanitized metadata without executable source or filesystem paths', () => {
    const argument = buildPluginViewBootstrapArgument({
      channelKey: 'secret-key',
      plugin: { name: 'touch-test', version: '1.2.3', sdkapi: 260615 },
      config: { themeStyle: { dark: true } }
    })

    expect(parsePluginViewBootstrapArgument([argument])).toEqual({
      channelKey: 'secret-key',
      plugin: { name: 'touch-test', version: '1.2.3', sdkapi: 260615 },
      config: { themeStyle: { dark: true } }
    })
    expect(argument).not.toContain('/tmp')
    expect(argument).not.toContain('require(')
  })

  it('rejects malformed or incomplete bootstrap arguments', () => {
    expect(() => parsePluginViewBootstrapArgument([])).toThrow()
    expect(() =>
      parsePluginViewBootstrapArgument(['--tuff-plugin-view-bootstrap=not-base64'])
    ).toThrow()
  })
})
