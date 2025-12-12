import type { SdkApiVersion } from './index'

/**
 * Current SDK API version.
 * Format: YYMMDD
 * Updated when breaking changes are introduced to plugin APIs.
 */
export const CURRENT_SDK_VERSION: SdkApiVersion = 251212

/**
 * Minimum SDK version required for permission enforcement.
 * Plugins below this version will bypass permission checks with a warning.
 */
export const PERMISSION_ENFORCEMENT_MIN_VERSION: SdkApiVersion = 251212

/**
 * SDK version compatibility result
 */
export interface SdkCompatibilityResult {
  /** Whether the plugin SDK version is compatible */
  compatible: boolean
  /** Whether permission enforcement should be applied */
  enforcePermissions: boolean
  /** Warning message if compatibility issues exist */
  warning?: string
  /** Suggestion for fixing compatibility issues */
  suggestion?: string
}

/**
 * Check SDK version compatibility for a plugin.
 * @param pluginSdkVersion - The sdkapi value from plugin manifest (undefined if not declared)
 * @param pluginName - Plugin name for error messages
 * @returns Compatibility check result
 */
export function checkSdkCompatibility(
  pluginSdkVersion: SdkApiVersion | undefined,
  pluginName: string
): SdkCompatibilityResult {
  // No sdkapi declared - legacy plugin
  if (pluginSdkVersion === undefined) {
    return {
      compatible: true,
      enforcePermissions: false,
      warning: `Plugin "${pluginName}" does not declare sdkapi version. Permission enforcement is disabled for compatibility.`,
      suggestion: `Add "sdkapi": ${CURRENT_SDK_VERSION} to manifest.json to enable permission enforcement.`,
    }
  }

  // Validate format (should be 6-digit number YYMMDD)
  if (!isValidSdkVersion(pluginSdkVersion)) {
    return {
      compatible: false,
      enforcePermissions: false,
      warning: `Plugin "${pluginName}" has invalid sdkapi format: ${pluginSdkVersion}. Expected YYMMDD format.`,
      suggestion: `Use format YYMMDD, e.g., "sdkapi": ${CURRENT_SDK_VERSION}`,
    }
  }

  // Version too old - bypass permissions with warning
  if (pluginSdkVersion < PERMISSION_ENFORCEMENT_MIN_VERSION) {
    return {
      compatible: true,
      enforcePermissions: false,
      warning: `Plugin "${pluginName}" uses legacy SDK version ${pluginSdkVersion}. Permission enforcement is disabled.`,
      suggestion: `Update to sdkapi: ${CURRENT_SDK_VERSION} for full permission support.`,
    }
  }

  // Version newer than current - might use unsupported features
  if (pluginSdkVersion > CURRENT_SDK_VERSION) {
    return {
      compatible: true,
      enforcePermissions: true,
      warning: `Plugin "${pluginName}" requires SDK version ${pluginSdkVersion}, but current version is ${CURRENT_SDK_VERSION}. Some features may not work.`,
      suggestion: `Update Tuff to the latest version for full compatibility.`,
    }
  }

  // Perfect match or compatible older version
  return {
    compatible: true,
    enforcePermissions: true,
  }
}

/**
 * Validate SDK version format (YYMMDD)
 */
export function isValidSdkVersion(version: number): boolean {
  if (!Number.isInteger(version) || version < 100000 || version > 999999) {
    return false
  }

  const str = version.toString()
  const year = parseInt(str.substring(0, 2), 10)
  const month = parseInt(str.substring(2, 4), 10)
  const day = parseInt(str.substring(4, 6), 10)

  // Basic validation: year 20-99, month 01-12, day 01-31
  return year >= 20 && year <= 99 && month >= 1 && month <= 12 && day >= 1 && day <= 31
}

/**
 * Format SDK version for display
 * @param version - SDK version number (YYMMDD)
 * @returns Formatted string like "25.12.12"
 */
export function formatSdkVersion(version: SdkApiVersion): string {
  const str = version.toString().padStart(6, '0')
  return `${str.substring(0, 2)}.${str.substring(2, 4)}.${str.substring(4, 6)}`
}

/**
 * Parse SDK version from string
 * @param str - Version string like "251212" or "25.12.12"
 * @returns SDK version number or undefined if invalid
 */
export function parseSdkVersion(str: string): SdkApiVersion | undefined {
  // Remove dots if present
  const cleaned = str.replace(/\./g, '')
  const num = parseInt(cleaned, 10)

  if (isValidSdkVersion(num)) {
    return num
  }
  return undefined
}
