import type { WindowSecurityProfile } from '../../../core/window-security-profile'
import type { PluginInjections } from './plugin-injections'
import { SdkApi, isSupportedSdkVersion } from '@talex-touch/utils/plugin'
import { createLogger } from '../../../utils/logger'

const pluginViewSecurityLog = createLogger('PluginViewSecurity')

export type PluginViewSecurityProfile = Extract<
  WindowSecurityProfile,
  'trusted-plugin-view' | 'compat-plugin-view'
>

export type PluginViewSecurityProfileReason =
  | 'missing-plugin'
  | 'sdkapi-before-trusted-marker'
  | 'legacy-preload'
  | 'legacy-webview'
  | 'explicit-legacy-runtime'
  | 'trusted-candidate'

export interface ResolvedPluginViewSecurityProfile {
  candidateProfile: PluginViewSecurityProfile
  effectiveProfile: PluginViewSecurityProfile
  reason: PluginViewSecurityProfileReason
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
  candidateProfile: PluginViewSecurityProfile
  effectiveProfile: PluginViewSecurityProfile
  reason: PluginViewSecurityProfileReason
}

export interface PluginViewSecurityDiagnosticsSnapshot {
  surfaces: PluginViewSecurityDiagnostic[]
  compatibilityBlockers: Partial<Record<PluginViewSecurityProfileReason, number>>
}

const securityDiagnostics = new Map<string, PluginViewSecurityDiagnostic>()

export function resolvePluginViewSecurityProfile(
  plugin: PluginViewSecurityPlugin | null | undefined,
  context: PluginViewSecurityContext
): ResolvedPluginViewSecurityProfile {
  const candidateProfile = resolveCandidateProfile(plugin, context)
  // H2: opt-in hard override. With TUFF_PLUGIN_SECURE_VIEWS=1 every plugin
  // surface is forced onto the secure profile (contextIsolation on, no
  // nodeIntegration). Off by default so legacy plugins that need the compat
  // runtime keep working; making it the default requires per-plugin user
  // consent + real-device legacy regression (follow-up).
  const secureViewsForced = process.env.TUFF_PLUGIN_SECURE_VIEWS === '1'
  const effectiveProfile: PluginViewSecurityProfile =
    secureViewsForced && candidateProfile.profile === 'compat-plugin-view'
      ? 'trusted-plugin-view'
      : candidateProfile.profile
  const resolved = {
    candidateProfile: candidateProfile.profile,
    effectiveProfile,
    reason: candidateProfile.reason
  }
  const diagnostic: PluginViewSecurityDiagnostic = {
    plugin: plugin?.name ?? 'unknown',
    source: context.source,
    ...resolved
  }
  securityDiagnostics.set(`${diagnostic.plugin}:${diagnostic.source}`, diagnostic)
  if (candidateProfile.profile === 'compat-plugin-view') {
    if (effectiveProfile === 'trusted-plugin-view') {
      pluginViewSecurityLog.info(
        `Forced secure profile for compat plugin surface: ${diagnostic.plugin} (TUFF_PLUGIN_SECURE_VIEWS=1, reason=${resolved.reason})`
      )
    } else {
      // Surface which plugins still run on the insecure compat profile and why.
      pluginViewSecurityLog.warn(
        `Plugin surface on INSECURE compat profile: ${diagnostic.plugin} (source=${diagnostic.source}, reason=${resolved.reason})`
      )
    }
  }
  return resolved
}

export function getPluginViewSecurityDiagnostics(): PluginViewSecurityDiagnosticsSnapshot {
  const surfaces = Array.from(securityDiagnostics.values(), (diagnostic) => ({ ...diagnostic }))
  const compatibilityBlockers: Partial<Record<PluginViewSecurityProfileReason, number>> = {}
  for (const diagnostic of surfaces) {
    if (diagnostic.effectiveProfile !== 'compat-plugin-view') continue
    compatibilityBlockers[diagnostic.reason] = (compatibilityBlockers[diagnostic.reason] ?? 0) + 1
  }
  return { surfaces, compatibilityBlockers }
}

export function resetPluginViewSecurityDiagnostics(): void {
  securityDiagnostics.clear()
}

function isTrustedMarker(sdkapi: number | undefined): boolean {
  return Boolean(sdkapi && sdkapi >= SdkApi.V260615 && isSupportedSdkVersion(sdkapi))
}

function resolveCandidateProfile(
  plugin: PluginViewSecurityPlugin | null | undefined,
  context: PluginViewSecurityContext
): {
  profile: PluginViewSecurityProfile
  reason: PluginViewSecurityProfileReason
} {
  if (!plugin) {
    return { profile: 'compat-plugin-view', reason: 'missing-plugin' }
  }

  if (!isTrustedMarker(plugin.sdkapi)) {
    return { profile: 'compat-plugin-view', reason: 'sdkapi-before-trusted-marker' }
  }

  if (context.requiresLegacyRuntime) {
    return { profile: 'compat-plugin-view', reason: 'explicit-legacy-runtime' }
  }

  const injections = context.injections
  if (injections?._.preload) {
    return { profile: 'compat-plugin-view', reason: 'legacy-preload' }
  }

  if (injections?._.isWebviewInit || plugin.webViewInit) {
    return { profile: 'compat-plugin-view', reason: 'legacy-webview' }
  }

  return { profile: 'trusted-plugin-view', reason: 'trusted-candidate' }
}
