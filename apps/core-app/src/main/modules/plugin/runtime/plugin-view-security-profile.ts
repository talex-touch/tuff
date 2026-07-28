import type { WindowSecurityProfile } from '../../../core/window-security-profile'
import type { PluginInjections } from './plugin-injections'
import { isSupportedSdkVersion, SdkApi } from '@talex-touch/utils/plugin'
import { PLUGIN_WINDOW_ERROR_CODES } from '@talex-touch/utils/transport/events/types'
import { createLogger } from '../../../utils/logger'

const pluginViewSecurityLog = createLogger('PluginViewSecurity')

export type PluginViewSecurityProfile = Extract<WindowSecurityProfile, 'trusted-plugin-view'>

export type PluginViewSecurityProfileReason =
  | 'missing-plugin'
  | 'sdkapi-before-trusted-marker'
  | 'legacy-preload'
  | 'legacy-webview'
  | 'explicit-legacy-runtime'
  | 'trusted-candidate'

export type PluginViewCompatibilityReason = Exclude<
  PluginViewSecurityProfileReason,
  'missing-plugin' | 'trusted-candidate'
>

export interface ResolvedPluginViewSecurityProfile {
  candidateProfile: 'trusted-plugin-view'
  effectiveProfile: 'trusted-plugin-view'
  reason: 'missing-plugin' | 'trusted-candidate'
}

export interface PluginViewSecurityContext {
  source: string
  injections?: Pick<PluginInjections, '_'> | null
  requiresLegacyRuntime?: boolean
}

interface PluginViewSecurityPlugin {
  name?: string
  sdkapi?: number
  webViewInit?: boolean
}

export interface PluginViewSecurityDiagnostic {
  plugin: string
  source: string
  candidateProfile: 'trusted-plugin-view' | 'legacy-blocked'
  effectiveProfile: 'trusted-plugin-view' | 'blocked'
  reason: PluginViewSecurityProfileReason
}

export interface PluginViewSecurityDiagnosticsSnapshot {
  surfaces: PluginViewSecurityDiagnostic[]
  compatibilityBlockers: Partial<Record<PluginViewCompatibilityReason, number>>
}

export class PluginViewCompatibilityError extends Error {
  readonly code = PLUGIN_WINDOW_ERROR_CODES.LEGACY_RUNTIME_UNSUPPORTED
  readonly minimumSdkApi = SdkApi.V260615

  constructor(readonly reason: PluginViewCompatibilityReason) {
    super(
      `Plugin view requires SDK API ${SdkApi.V260615} or later and the bundled host preload (reason: ${reason}).`
    )
    this.name = 'PluginViewCompatibilityError'
  }
}

const securityDiagnostics = new Map<string, PluginViewSecurityDiagnostic>()

export function resolvePluginViewSecurityProfile(
  plugin: PluginViewSecurityPlugin | null | undefined,
  context: PluginViewSecurityContext
): ResolvedPluginViewSecurityProfile {
  const reason = resolveCompatibilityReason(plugin, context)
  const pluginName = plugin?.name ?? 'unknown'
  const diagnosticKey = `${pluginName}:${context.source}`

  if (reason) {
    const diagnostic: PluginViewSecurityDiagnostic = {
      plugin: pluginName,
      source: context.source,
      candidateProfile: 'legacy-blocked',
      effectiveProfile: 'blocked',
      reason
    }
    securityDiagnostics.set(diagnosticKey, diagnostic)
    pluginViewSecurityLog.warn(
      `Blocked legacy plugin view surface: ${pluginName} (source=${context.source}, reason=${reason})`
    )
    throw new PluginViewCompatibilityError(reason)
  }

  const trustedReason = plugin ? 'trusted-candidate' : 'missing-plugin'
  const resolved: ResolvedPluginViewSecurityProfile = {
    candidateProfile: 'trusted-plugin-view',
    effectiveProfile: 'trusted-plugin-view',
    reason: trustedReason
  }
  securityDiagnostics.set(diagnosticKey, {
    plugin: pluginName,
    source: context.source,
    ...resolved
  })
  return resolved
}

export function getPluginViewSecurityDiagnostics(): PluginViewSecurityDiagnosticsSnapshot {
  const surfaces = Array.from(securityDiagnostics.values(), (diagnostic) => ({ ...diagnostic }))
  const compatibilityBlockers: Partial<Record<PluginViewCompatibilityReason, number>> = {}
  for (const diagnostic of surfaces) {
    if (diagnostic.effectiveProfile !== 'blocked') continue
    const reason = diagnostic.reason as PluginViewCompatibilityReason
    compatibilityBlockers[reason] = (compatibilityBlockers[reason] ?? 0) + 1
  }
  return { surfaces, compatibilityBlockers }
}

export function resetPluginViewSecurityDiagnostics(): void {
  securityDiagnostics.clear()
}

function isTrustedMarker(sdkapi: number | undefined): boolean {
  return Boolean(sdkapi && sdkapi >= SdkApi.V260615 && isSupportedSdkVersion(sdkapi))
}

function resolveCompatibilityReason(
  plugin: PluginViewSecurityPlugin | null | undefined,
  context: PluginViewSecurityContext
): PluginViewCompatibilityReason | null {
  if (!plugin) return null
  if (!isTrustedMarker(plugin.sdkapi)) return 'sdkapi-before-trusted-marker'
  if (context.requiresLegacyRuntime) return 'explicit-legacy-runtime'
  if (context.injections?._.preload) return 'legacy-preload'
  if (context.injections?._.isWebviewInit || plugin.webViewInit) return 'legacy-webview'
  return null
}
