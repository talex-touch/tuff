import type { WindowSecurityProfile } from '../../../core/window-security-profile'
import type { PluginInjections } from './plugin-injections'
import { SdkApi, isSupportedSdkVersion } from '@talex-touch/utils/plugin'

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
  sdkapi?: number
  webViewInit?: boolean
}

export function resolvePluginViewSecurityProfile(
  plugin: PluginViewSecurityPlugin | null | undefined,
  context: PluginViewSecurityContext
): ResolvedPluginViewSecurityProfile {
  const candidateProfile = resolveCandidateProfile(plugin, context)

  return {
    candidateProfile: candidateProfile.profile,
    effectiveProfile: 'compat-plugin-view',
    reason: candidateProfile.reason
  }
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
