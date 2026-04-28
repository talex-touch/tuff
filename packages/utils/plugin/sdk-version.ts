import type { SdkApiVersion } from './index'

/**
 * Known SDK API versions (format: YYMMDD).
 *
 * Ranges (rough):
 * - < 251212: blocked by the current runtime baseline
 * - 251212 ~ 260113: permission enforcement + new input model baseline
 * - >= 260114: `manifest.json.category` is required for plugin grouping
 * - >= 260121: `tfileScope` is required when requesting tfile access
 * - >= 260215: plugin sqlite sdk is available
 * - >= 260225: OmniPanel declarative transfer is available
 * - >= 260228: plugin capability auth baseline is enabled
 * - >= 260428: current supported marker
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
  /**
   * 2026-02-15: add plugin sqlite sdk support.
   */
  V260215 = 260215,
  /**
   * 2026-02-25: add OmniPanel declarative transfer support.
   */
  V260225 = 260225,
  /**
   * 2026-02-28: capability auth baseline for plugin calls.
   */
  V260228 = 260228,
  /**
   * 2026-04-28: current supported marker.
   * No additional runtime gate is introduced beyond existing baselines.
   */
  V260428 = 260428,
}

/**
 * Supported SDK versions in descending order.
 * This list is the canonical allowlist for plugin-declared sdkapi markers.
 */
export const SUPPORTED_SDK_VERSIONS: readonly SdkApiVersion[] = [
  SdkApi.V260428,
  SdkApi.V260228,
  SdkApi.V260225,
  SdkApi.V260215,
  SdkApi.V260121,
  SdkApi.V260114,
  SdkApi.V251212,
]

/**
 * Current SDK API version.
 * Updated when a new supported plugin SDK marker is introduced.
 */
export const CURRENT_SDK_VERSION: SdkApiVersion = SdkApi.V260428

/**
 * Minimum SDK version required for permission enforcement.
 * Plugins below this version are blocked by the core-app runtime gate.
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
 * Minimum SDK version required for OmniPanel declarative transfer.
 */
export const OMNI_TRANSFER_DECLARATIVE_MIN_VERSION: SdkApiVersion = SdkApi.V260225

/**
 * Minimum SDK version required for capability-level auth baseline.
 */
export const CAPABILITY_AUTH_MIN_VERSION: SdkApiVersion = SdkApi.V260228

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
  // Missing sdkapi is no longer a soft-compat path.
  if (pluginSdkVersion === undefined) {
    return {
      compatible: false,
      enforcePermissions: false,
      warning: `Plugin "${pluginName}" is blocked because manifest.json must declare sdkapi >= ${PERMISSION_ENFORCEMENT_MIN_VERSION}.`,
      suggestion: `Add "sdkapi": ${CURRENT_SDK_VERSION} to manifest.json and republish the plugin.`,
    }
  }

  const declared = parseSdkApiInput(pluginSdkVersion)

  if (declared === undefined) {
    return {
      compatible: false,
      enforcePermissions: false,
      warning: `Plugin "${pluginName}" is blocked because sdkapi "${pluginSdkVersion}" is invalid. Use YYMMDD format and declare at least ${PERMISSION_ENFORCEMENT_MIN_VERSION}.`,
      suggestion: `Use format YYMMDD (for example "sdkapi": ${CURRENT_SDK_VERSION}).`,
    }
  }

  if (declared < PERMISSION_ENFORCEMENT_MIN_VERSION) {
    return {
      compatible: false,
      enforcePermissions: false,
      warning: `Plugin "${pluginName}" is blocked because sdkapi ${declared} is below the minimum supported baseline ${PERMISSION_ENFORCEMENT_MIN_VERSION}.`,
      suggestion: `Update to sdkapi: ${CURRENT_SDK_VERSION}.`,
    }
  }

  if (!isSupportedSdkVersion(declared)) {
    return {
      compatible: false,
      enforcePermissions: false,
      warning: `Plugin "${pluginName}" is blocked because sdkapi ${declared} is not a supported SDK marker.`,
      suggestion: `Use one of the supported sdkapi markers, preferably ${CURRENT_SDK_VERSION}.`,
    }
  }

  return {
    compatible: true,
    enforcePermissions: true,
  }
}

/**
 * Resolve a plugin-declared sdkapi to a supported SDK marker.
 *
 * Rules:
 * - Invalid values => undefined (blocked by runtime gate)
 * - Valid versions below the first supported marker => keep raw value for explicit gate checks
 * - Known versions => keep as-is
 * - Unknown current/future markers => undefined (blocked by runtime gate)
 */
export function resolveSdkApiVersion(raw: unknown): SdkApiVersion | undefined {
  const num = parseSdkApiInput(raw)

  if (num === undefined) {
    return undefined
  }

  if (isSupportedSdkVersion(num) || num < PERMISSION_ENFORCEMENT_MIN_VERSION) {
    return num
  }

  return undefined
}

export function isSupportedSdkVersion(version: SdkApiVersion): boolean {
  return SUPPORTED_SDK_VERSIONS.includes(version)
}

function parseSdkApiInput(raw: unknown): SdkApiVersion | undefined {
  const num
    = typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? parseSdkVersion(raw)
        : undefined

  if (num === undefined || !isValidSdkVersion(num)) {
    return undefined
  }

  return num
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
