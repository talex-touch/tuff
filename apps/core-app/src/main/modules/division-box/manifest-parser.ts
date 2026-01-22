/**
 * Manifest Parser for DivisionBox Configuration
 *
 * Parses and validates the divisionBox configuration block from plugin manifests.
 * Applies default values and logs warnings for invalid configurations.
 */

import type { DivisionBoxSize, ManifestDivisionBoxConfig } from '@talex-touch/utils'
import { createLogger } from '../../utils/logger'
import type { Primitive } from '../../utils/logger'

const logger = createLogger('DivisionBoxManifestParser')

/**
 * Default values for DivisionBox manifest configuration
 */
const DEFAULT_MANIFEST_CONFIG = {
  defaultSize: 'medium' as DivisionBoxSize,
  keepAlive: false,
  header: {
    show: true
  }
}

/**
 * Valid size values
 */
const VALID_SIZES: readonly DivisionBoxSize[] = ['compact', 'medium', 'expanded']

/**
 * Validates if a value is a valid DivisionBoxSize
 *
 * @param size - Size value to validate
 * @returns True if valid, false otherwise
 */
function isValidSize(size: unknown): size is DivisionBoxSize {
  return typeof size === 'string' && VALID_SIZES.includes(size as DivisionBoxSize)
}

function formatMetaValue(value: unknown): Primitive {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Parses and validates the divisionBox configuration from a plugin manifest
 *
 * This function:
 * 1. Validates the configuration structure
 * 2. Applies default values for missing fields
 * 3. Logs warnings for invalid configurations
 * 4. Returns a fully validated configuration object
 *
 * @param manifestConfig - Raw divisionBox configuration from manifest.json
 * @param pluginName - Name of the plugin (for logging)
 * @returns Validated configuration with defaults applied
 */
export function parseManifestDivisionBoxConfig(
  manifestConfig: unknown,
  pluginName: string
): ManifestDivisionBoxConfig {
  // If no config provided, return defaults
  if (!manifestConfig || typeof manifestConfig !== 'object') {
    if (manifestConfig !== undefined && manifestConfig !== null) {
      logger.warn(`[${pluginName}] Invalid divisionBox configuration format, using defaults`, {
        meta: { providedConfig: formatMetaValue(manifestConfig) }
      })
    }
    return { ...DEFAULT_MANIFEST_CONFIG }
  }

  const config = manifestConfig as Record<string, unknown>
  const result: ManifestDivisionBoxConfig = {
    defaultSize: DEFAULT_MANIFEST_CONFIG.defaultSize,
    keepAlive: DEFAULT_MANIFEST_CONFIG.keepAlive,
    header: { show: true }
  }

  // Parse and validate defaultSize
  if ('defaultSize' in config) {
    if (isValidSize(config.defaultSize)) {
      result.defaultSize = config.defaultSize
    } else {
      logger.warn(
        `[${pluginName}] Invalid defaultSize: "${config.defaultSize}", using default "medium". Valid sizes: ${Array.from(VALID_SIZES).join(', ')}`,
        {
          meta: {
            providedSize: String(config.defaultSize)
          }
        }
      )
    }
  }

  // Parse and validate keepAlive
  if ('keepAlive' in config) {
    if (typeof config.keepAlive === 'boolean') {
      result.keepAlive = config.keepAlive
    } else {
      logger.warn(
        `[${pluginName}] Invalid keepAlive value: "${config.keepAlive}", using default false`,
        {
          meta: {
            providedValue: formatMetaValue(config.keepAlive),
            expectedType: 'boolean'
          }
        }
      )
    }
  }

  // Parse and validate header configuration
  if ('header' in config && typeof config.header === 'object' && config.header !== null) {
    const headerConfig = config.header as Record<string, unknown>

    // Validate header.show
    if ('show' in headerConfig) {
      if (typeof headerConfig.show === 'boolean' && result.header) {
        result.header.show = headerConfig.show
      } else {
        logger.warn(
          `[${pluginName}] Invalid header.show value: "${headerConfig.show}", using default true`,
          {
            meta: {
              providedValue: formatMetaValue(headerConfig.show),
              expectedType: 'boolean'
            }
          }
        )
      }
    }

    // Validate header.title
    if ('title' in headerConfig) {
      if (
        typeof headerConfig.title === 'string' &&
        headerConfig.title.length > 0 &&
        result.header
      ) {
        result.header.title = headerConfig.title
      } else if (headerConfig.title !== undefined && headerConfig.title !== null) {
        logger.warn(`[${pluginName}] Invalid header.title value, ignoring`, {
          meta: {
            providedValue: formatMetaValue(headerConfig.title),
            expectedType: 'non-empty string'
          }
        })
      }
    }

    // Validate header.icon
    if ('icon' in headerConfig) {
      if (typeof headerConfig.icon === 'string' && headerConfig.icon.length > 0 && result.header) {
        result.header.icon = headerConfig.icon
      } else if (headerConfig.icon !== undefined && headerConfig.icon !== null) {
        logger.warn(`[${pluginName}] Invalid header.icon value, ignoring`, {
          meta: {
            providedValue: formatMetaValue(headerConfig.icon),
            expectedType: 'non-empty string'
          }
        })
      }
    }
  } else if ('header' in config && config.header !== undefined) {
    logger.warn(`[${pluginName}] Invalid header configuration format, using defaults`, {
      meta: {
        providedHeader: formatMetaValue(config.header),
        expectedType: 'object'
      }
    })
  }

  // Log successful parsing
  logger.debug(
    `[${pluginName}] Parsed divisionBox configuration: size=${result.defaultSize}, keepAlive=${result.keepAlive}, headerShow=${result.header?.show}`
  )

  return result
}

/**
 * Merges manifest configuration with runtime configuration
 *
 * Runtime configuration takes precedence over manifest defaults.
 * This is used when a plugin opens a DivisionBox with specific settings
 * that override the manifest defaults.
 *
 * @param manifestConfig - Configuration from manifest
 * @param runtimeConfig - Configuration provided at runtime
 * @returns Merged configuration
 */
export function mergeManifestWithRuntimeConfig(
  manifestConfig: Required<ManifestDivisionBoxConfig>,
  runtimeConfig: Partial<import('@talex-touch/utils').DivisionBoxConfig>
): import('@talex-touch/utils').DivisionBoxConfig {
  return {
    url: runtimeConfig.url!,
    title: runtimeConfig.title!,
    pluginId: runtimeConfig.pluginId,
    icon: runtimeConfig.icon ?? manifestConfig.header.icon,
    size: runtimeConfig.size ?? manifestConfig.defaultSize,
    keepAlive: runtimeConfig.keepAlive ?? manifestConfig.keepAlive,
    header: runtimeConfig.header ?? {
      show: manifestConfig.header.show ?? true,
      title: manifestConfig.header.title,
      icon: manifestConfig.header.icon
    },
    webPreferences: runtimeConfig.webPreferences
  }
}

/**
 * Gets the default DivisionBox configuration
 *
 * @returns Default configuration object
 */
export function getDefaultManifestConfig(): ManifestDivisionBoxConfig {
  return {
    defaultSize: 'medium',
    keepAlive: false,
    header: {
      show: true,
      title: undefined,
      icon: undefined
    }
  }
}
