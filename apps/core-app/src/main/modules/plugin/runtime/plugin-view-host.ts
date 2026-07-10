import type { TalexTouch } from '@talex-touch/utils'
import type { PluginWindowOptions } from '@talex-touch/utils/transport/events/types'
import type { PluginViewSecurityProfile } from './plugin-view-security-profile'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { buildPluginViewBootstrapArgument } from '../../../../shared/plugin-view-bridge'
import { buildWindowWebPreferences } from '../../../core/window-security-profile'

interface PluginViewHostPlugin {
  name: string
  version?: string
  sdkapi?: number
  _uniqueChannelKey: string
}

export interface PluginViewWebPreferenceOptions {
  plugin: PluginViewHostPlugin
  themeStyle: unknown
  source: string
  legacyPreload?: string
  overrides?: Electron.WebPreferences
}

function resolvePluginViewPreloadPath(): string {
  return path.join(__dirname, '..', 'preload', 'plugin-view.js')
}

function buildPluginViewPartition(pluginName: string, source: string): string {
  const hash = createHash('sha256').update(`${pluginName}:${source}`).digest('hex').slice(0, 24)
  return `tuff-plugin-view-${hash}`
}

function stripHostControlledPreferences(
  overrides: Electron.WebPreferences | undefined
): Electron.WebPreferences {
  const safe = { ...(overrides ?? {}) }
  delete safe.preload
  delete safe.partition
  delete safe.additionalArguments
  return safe
}

export function buildPluginViewWebPreferences(
  profile: PluginViewSecurityProfile,
  options: PluginViewWebPreferenceOptions
): Electron.WebPreferences {
  const safeOverrides = stripHostControlledPreferences(options.overrides)
  const partition = buildPluginViewPartition(options.plugin.name, options.source)

  if (profile === 'trusted-plugin-view') {
    const bootstrapArgument = buildPluginViewBootstrapArgument({
      channelKey: options.plugin._uniqueChannelKey,
      plugin: {
        name: options.plugin.name,
        version: options.plugin.version,
        sdkapi: options.plugin.sdkapi
      },
      config: {
        themeStyle: options.themeStyle ?? {}
      }
    })

    return buildWindowWebPreferences(profile, {
      ...safeOverrides,
      partition,
      preload: resolvePluginViewPreloadPath(),
      additionalArguments: [bootstrapArgument]
    })
  }

  return buildWindowWebPreferences(profile, {
    ...safeOverrides,
    partition,
    preload: options.legacyPreload
  })
}

export function buildPublicPluginWindowOptions(
  options: PluginWindowOptions,
  webPreferences: Electron.WebPreferences
): TalexTouch.TouchWindowConstructorOptions {
  const { visible = true, ...browserWindowOptions } = options
  return {
    ...browserWindowOptions,
    show: false,
    autoShow: visible,
    webPreferences
  }
}
