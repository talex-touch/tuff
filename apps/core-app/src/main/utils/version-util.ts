import { app } from 'electron'

/**
 * Get application version
 * Priority: globalThis.$pkg (from polyfills) > process.env.APP_VERSION > app.getVersion()
 *
 * @returns Application version string (e.g., "2.1.0")
 */
export function getAppVersion(): string {
  // Priority 1: Global package object (set by polyfills.ts)
  // @ts-ignore - globalThis.$pkg is defined in polyfills.ts
  if (typeof globalThis.$pkg !== 'undefined' && globalThis.$pkg?.version) {
    // @ts-ignore
    return globalThis.$pkg.version
  }

  // Priority 2: Environment variable
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION
  }

  // Priority 3: Electron app.getVersion() (if available)
  try {
    return app.getVersion()
  }
  catch {
    // ignore
  }

  return '0.0.0'
}

/**
 * Get version from global package.json (if available)
 * @returns Application version string or null if not available
 */
export function getAppVersionFromGlobal(): string | null {
  // @ts-ignore - globalThis.$pkg is defined in polyfills.ts
  if (typeof globalThis.$pkg !== 'undefined' && globalThis.$pkg?.version) {
    // @ts-ignore
    return globalThis.$pkg.version
  }
  return null
}

/**
 * Get application version with fallback strategy
 * Alias for getAppVersion in this simplified implementation
 */
export function getAppVersionSafe(): string {
  return getAppVersion()
}
