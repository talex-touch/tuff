import type { SdkApiVersion } from '@talex-touch/utils/plugin'
import {
  CURRENT_SDK_VERSION,
  PERMISSION_ENFORCEMENT_MIN_VERSION,
  resolveSdkApiVersion
} from '@talex-touch/utils/plugin'
import { PLUGIN_SDK_BLOCKED_CODE } from '../../../shared/plugin-sdk-blocked'

export const SDKAPI_BLOCKED_CODE = PLUGIN_SDK_BLOCKED_CODE

export type PluginSdkBlockReason = 'missing-sdkapi' | 'invalid-sdkapi' | 'outdated-sdkapi'

export interface PluginSdkCompatibilityGate {
  blocked: boolean
  reason?: PluginSdkBlockReason
  message?: string
  suggestion?: string
  resolvedSdkapi?: SdkApiVersion
}

function buildUpgradeSuggestion(): string {
  return `Update manifest.json with "sdkapi": ${CURRENT_SDK_VERSION} and republish the plugin.`
}

export function getPluginSdkCompatibilityGate(
  pluginName: string,
  declaredSdkapi: unknown
): PluginSdkCompatibilityGate {
  if (declaredSdkapi === undefined) {
    return {
      blocked: true,
      reason: 'missing-sdkapi',
      message: `Plugin "${pluginName}" is blocked because manifest.json must declare sdkapi >= ${PERMISSION_ENFORCEMENT_MIN_VERSION}.`,
      suggestion: buildUpgradeSuggestion()
    }
  }

  const resolvedSdkapi = resolveSdkApiVersion(declaredSdkapi)
  if (resolvedSdkapi === undefined) {
    return {
      blocked: true,
      reason: 'invalid-sdkapi',
      message: `Plugin "${pluginName}" is blocked because sdkapi "${String(declaredSdkapi)}" is invalid. Use YYMMDD format and declare at least ${PERMISSION_ENFORCEMENT_MIN_VERSION}.`,
      suggestion: buildUpgradeSuggestion()
    }
  }

  if (resolvedSdkapi < PERMISSION_ENFORCEMENT_MIN_VERSION) {
    return {
      blocked: true,
      reason: 'outdated-sdkapi',
      message: `Plugin "${pluginName}" is blocked because sdkapi ${resolvedSdkapi} is below the minimum supported baseline ${PERMISSION_ENFORCEMENT_MIN_VERSION}.`,
      suggestion: buildUpgradeSuggestion(),
      resolvedSdkapi
    }
  }

  return {
    blocked: false,
    resolvedSdkapi
  }
}
