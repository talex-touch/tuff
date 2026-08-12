import { describe, expect, it } from 'vitest'
import {
  buildPluginViewBootstrapArgument,
  parsePluginViewBootstrapArgument,
  PLUGIN_VIEW_BRIDGE_VERSION
} from './plugin-view-bridge'

describe('plugin view bootstrap', () => {
  it('round-trips sanitized metadata without executable source or filesystem paths', () => {
    const argument = buildPluginViewBootstrapArgument({
      bridgeVersion: PLUGIN_VIEW_BRIDGE_VERSION,
      plugin: { name: 'touch-test', version: '1.2.3', sdkapi: 260615 },
      config: { themeStyle: { dark: true } }
    })

    expect(parsePluginViewBootstrapArgument([argument])).toEqual({
      bridgeVersion: PLUGIN_VIEW_BRIDGE_VERSION,
      plugin: { name: 'touch-test', version: '1.2.3', sdkapi: 260615 },
      config: { themeStyle: { dark: true } }
    })
    expect(argument).not.toContain('/tmp')
    expect(argument).not.toContain('require(')
  })

  // This argument becomes a real command-line argument of the renderer, readable from the process
  // table by any unprivileged process on the machine. The plugin's channel key used to be in it
  // (#697); a caller that puts one back should fail here rather than in a `ps` listing.
  it('carries no channel key even when the caller supplies one', () => {
    const argument = buildPluginViewBootstrapArgument({
      bridgeVersion: PLUGIN_VIEW_BRIDGE_VERSION,
      channelKey: 'plugin-channel-key',
      plugin: { name: 'touch-test', sdkapi: 260615 },
      config: { themeStyle: {} }
    } as never)

    expect(argument).not.toContain('plugin-channel-key')
    expect(argument).not.toContain('channelKey')
    expect(parsePluginViewBootstrapArgument([argument])).not.toHaveProperty('channelKey')
  })

  it('rejects missing or unsupported bridge versions', () => {
    const base = {
      plugin: { name: 'touch-test', sdkapi: 260615 },
      config: { themeStyle: {} }
    }

    expect(() => buildPluginViewBootstrapArgument(base as never)).toThrow(
      'Plugin view bridge version is unsupported.'
    )
    expect(() =>
      buildPluginViewBootstrapArgument({
        ...base,
        bridgeVersion: PLUGIN_VIEW_BRIDGE_VERSION + 1
      } as never)
    ).toThrow('Plugin view bridge version is unsupported.')
  })

  it('rejects malformed or incomplete bootstrap arguments', () => {
    expect(() => parsePluginViewBootstrapArgument([])).toThrow()
    expect(() =>
      parsePluginViewBootstrapArgument(['--tuff-plugin-view-bootstrap=not-base64'])
    ).toThrow()
  })
})
