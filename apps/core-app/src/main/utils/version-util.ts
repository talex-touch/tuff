import process from 'node:process'
import { app } from 'electron'
import packageJson from '../../../../../package.json'

/**
 * Get application version
 * Priority:
 * 1. globalThis.$pkg (from polyfills)
 * 2. process.env.APP_VERSION
 * 3. Bundled root package.json version
 * 4. app.getVersion()
 *
 * @returns Application version string (e.g., "2.1.0")
 */
export function getAppVersion(): string {
  // Priority 1: Global package object (set by polyfills.ts)
  if (typeof globalThis.$pkg !== 'undefined' && globalThis.$pkg?.version) {
    return globalThis.$pkg.version
  }

  // Priority 2: Environment variable
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION
  }

  if (packageJson.version) {
    return packageJson.version
  }

  // Priority 4: Electron app.getVersion() (if available)
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
