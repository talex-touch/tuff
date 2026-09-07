import process from 'node:process'
import { app } from 'electron'
import packageJson from '../../../package.json'

/**
 * Get application version.
 *
 * Packaged builds must trust Electron's bundle metadata first. The macOS OTA helper inherits the
 * previous process environment, so APP_VERSION can still contain the version that launched the
 * handoff even after the application bundle has been replaced.
 *
 * @returns Application version string (e.g., "2.1.0")
 */
export function getAppVersion(): string {
  try {
    if (app.isPackaged) {
      const packagedVersion = app.getVersion()
      if (packagedVersion) return packagedVersion
    }
  } catch {
    // Fall through for tests and early startup environments without complete Electron metadata.
  }

  if (typeof globalThis.$pkg !== 'undefined' && globalThis.$pkg?.version) {
    return globalThis.$pkg.version
  }

  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION
  }

  if (packageJson.version) {
    return packageJson.version
  }

  try {
    return app.getVersion()
  } catch {
    // ignore
  }

  return '0.0.0'
}

/**
 * Get version from global package.json (if available)
 * @returns Application version string or null if not available
 */
export function getAppVersionFromGlobal(): string | null {
  if (typeof globalThis.$pkg !== 'undefined' && globalThis.$pkg?.version) {
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
