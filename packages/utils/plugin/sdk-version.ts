import type { SdkApiVersion } from './index'

/**
 * Known SDK API versions (format: YYMMDD).
 *
 * Ranges (rough):
 * - < 251212: legacy mode (no permission enforcement, no category requirement)
 * - 251212 ~ 260113: permission enforcement + new input model baseline
 * - >= 260114: `manifest.json.category` is required for plugin grouping
 * - >= 260121: `tfileScope` is required when requesting tfile access
 */
export enum SdkApi {
  /**
   * 2025-12-12: permissions + input model baseline.
   */
  V251212 = 251212,
  /**
   * 2026-01-14: require `manifest.json.category` for plugins.
   */
  V260114 = 260114,
  /**
   * 2026-01-21: add tfile permission + scope enforcement.
   */
  V260121 = 260121,
}

/**
 * Supported SDK versions in descending order.
 * Used to gracefully fallback for unknown/invalid sdkapi values.
 */
export const SUPPORTED_SDK_VERSIONS: readonly SdkApiVersion[] = [
  SdkApi.V260121,
  SdkApi.V260114,
  SdkApi.V251212,
]

/**
 * Current SDK API version.
 * Updated when breaking changes are introduced to plugin APIs.
 */
export const CURRENT_SDK_VERSION: SdkApiVersion = SdkApi.V260121

/**
 * Minimum SDK version required for permission enforcement.
 * Plugins below this version will bypass permission checks with a warning.
 */
export const PERMISSION_ENFORCEMENT_MIN_VERSION: SdkApiVersion = SdkApi.V251212

/**
 * Minimum SDK version required for `manifest.json.category`.
 */
export const CATEGORY_REQUIRED_MIN_VERSION: SdkApiVersion = SdkApi.V260114

/**
 * Minimum SDK version required for `tfileScope` enforcement.
 */
export const TFILE_SCOPE_REQUIRED_MIN_VERSION: SdkApiVersion = SdkApi.V260121

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
  pluginName: string,
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

  const resolved = resolveSdkApiVersion(pluginSdkVersion)
  const warningParts: string[] = []
  const suggestionParts: string[] = []

  // Validate + normalize to a supported SDK version (graceful fallback)
  if (resolved === undefined) {
    return {
      compatible: true,
      enforcePermissions: false,
      warning: `Plugin "${pluginName}" has invalid sdkapi value: ${pluginSdkVersion}. Falling back to legacy mode.`,
      suggestion: `Use format YYMMDD (e.g., "sdkapi": ${CURRENT_SDK_VERSION}).`,
    }
  }

  if (resolved !== pluginSdkVersion) {
    warningParts.push(
      `Plugin "${pluginName}" declares sdkapi ${pluginSdkVersion}, but it is not a supported SDK marker. Falling back to ${resolved}.`,
    )
    suggestionParts.push(`Use a supported sdkapi marker, e.g., ${CURRENT_SDK_VERSION}.`)
  }

  // Version too old - bypass permissions with warning
  if (resolved < PERMISSION_ENFORCEMENT_MIN_VERSION) {
    return {
      compatible: true,
      enforcePermissions: false,
      warning: [
        ...warningParts,
        `Plugin "${pluginName}" uses legacy SDK version ${resolved}. Permission enforcement is disabled.`,
      ].join(' '),
      suggestion: [
        ...suggestionParts,
        `Update to sdkapi: ${CURRENT_SDK_VERSION} for full permission support.`,
      ].join(' '),
    }
  }

  // Version newer than current - might use unsupported features
  if (pluginSdkVersion > CURRENT_SDK_VERSION) {
    return {
      compatible: true,
      enforcePermissions: true,
      warning: [
        ...warningParts,
        `Plugin "${pluginName}" requires SDK version ${pluginSdkVersion}, but current version is ${CURRENT_SDK_VERSION}. Some features may not work.`,
      ].join(' '),
      suggestion: [
        ...suggestionParts,
        `Update Tuff to the latest version for full compatibility.`,
      ].join(' '),
    }
  }

  // Perfect match or compatible older version
  return {
    compatible: true,
    enforcePermissions: true,
    warning: warningParts.length ? warningParts.join(' ') : undefined,
    suggestion: suggestionParts.length ? suggestionParts.join(' ') : undefined,
  }
}

/**
 * Resolve a plugin-declared sdkapi to the nearest supported SDK marker.
 *
 * Rules:
 * - Invalid values => undefined (legacy)
 * - Unknown future versions => fallback to the latest supported <= declared
 * - Known versions => keep as-is
 */
export function resolveSdkApiVersion(raw: unknown): SdkApiVersion | undefined {
  const num
    = typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? parseSdkVersion(raw)
        : undefined

  if (num === undefined || !isValidSdkVersion(num)) {
    return undefined
  }

  for (const v of SUPPORTED_SDK_VERSIONS) {
    if (num >= v) {
      return v
    }
  }

  return undefined
}

/**
 * Validate SDK version format (YYMMDD)
 */
export function isValidSdkVersion(version: number): boolean {
  if (!Number.isInteger(version) || version < 100000 || version > 999999) {
    return false
  }

  const str = version.toString()
  const year = Number.parseInt(str.substring(0, 2), 10)
  const month = Number.parseInt(str.substring(2, 4), 10)
  const day = Number.parseInt(str.substring(4, 6), 10)

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
  const num = Number.parseInt(cleaned, 10)

  if (isValidSdkVersion(num)) {
    return num
  }
  return undefined
}
